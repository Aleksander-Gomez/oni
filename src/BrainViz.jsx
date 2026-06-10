/**
 * ONI // BRAIN VISUALIZATION
 * 3D neural network graph of memory context
 * Built with Three.js (vanilla, no @react-three/fiber needed)
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { getGraphData, getAllMemories, getActiveTag, formatBytes } from "./MemoryStore.js";

export default function BrainViz({ onClose }) {
  const mountRef    = useRef(null);
  const sceneRef    = useRef(null);
  const [selected,  setSelected]  = useState(null);
  const [hovered,   setHovered]   = useState(null);
  const [stats,     setStats]     = useState({ nodes:0, edges:0, memories:0 });
  const [memories,  setMemories]  = useState([]);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    let animId;
    const W = el.clientWidth;
    const H = el.clientHeight;

    // ── THREE.JS SETUP ─────────────────────────────────────
    import("three").then(THREE => {
      const scene    = new THREE.Scene();
      scene.background = new THREE.Color(0x050505);
      scene.fog        = new THREE.FogExp2(0x050505, 0.035);

      const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 1000);
      camera.position.set(0, 0, 18);

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(W, H);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      el.appendChild(renderer.domElement);

      // ── GRAPH DATA ──────────────────────────────────────
      const { nodes, edges } = getGraphData();
      setStats({ nodes: nodes.length, edges: edges.length, memories: getAllMemories().length });

      // Position nodes using force-like layout
      const positions = {};
      const modelNodes = nodes.filter(n => n.type === "model");
      const tagNodes   = nodes.filter(n => n.type === "tag");

      // Models arranged in a ring
      modelNodes.forEach((n, i) => {
        const angle = (i / Math.max(modelNodes.length, 1)) * Math.PI * 2;
        const r = 5;
        positions[n.id] = new THREE.Vector3(
          Math.cos(angle) * r,
          (Math.random() - 0.5) * 2,
          Math.sin(angle) * r
        );
      });

      // Tags arranged in outer ring + some scattered
      tagNodes.forEach((n, i) => {
        const angle = (i / Math.max(tagNodes.length, 1)) * Math.PI * 2 + 0.3;
        const r = 9 + Math.random() * 3;
        positions[n.id] = new THREE.Vector3(
          Math.cos(angle) * r,
          (Math.random() - 0.5) * 6,
          Math.sin(angle) * r
        );
      });

      // ── MESHES ──────────────────────────────────────────
      const meshes  = {};
      const labels  = {};
      const allObjs = [];

      // Ambient + point lights
      scene.add(new THREE.AmbientLight(0x111111));
      const pLight = new THREE.PointLight(0x39ff14, 1.5, 40);
      pLight.position.set(0, 5, 0);
      scene.add(pLight);

      nodes.forEach(node => {
        const pos = positions[node.id];
        if (!pos) return;

        const geo  = new THREE.SphereGeometry(node.size, 16, 16);
        const color = new THREE.Color(node.color);
        const mat  = new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: node.type === "model" ? 0.4 : 0.2,
          roughness: 0.3,
          metalness: 0.6,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        mesh.userData = { nodeId: node.id, node };
        scene.add(mesh);
        meshes[node.id] = mesh;
        allObjs.push(mesh);

        // Wireframe ring for model nodes
        if (node.type === "model") {
          const ringGeo = new THREE.TorusGeometry(node.size * 1.4, 0.04, 8, 32);
          const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4 });
          const ring = new THREE.Mesh(ringGeo, ringMat);
          ring.position.copy(pos);
          ring.rotation.x = Math.PI / 2;
          scene.add(ring);
        }
      });

      // Edges as lines
      edges.forEach(edge => {
        const src = positions[edge.source];
        const tgt = positions[edge.target];
        if (!src || !tgt) return;

        const points = [src.clone(), tgt.clone()];
        const geo    = new THREE.BufferGeometry().setFromPoints(points);
        const isTagTag = edge.type === "tag-tag";
        const mat  = new THREE.LineBasicMaterial({
          color: isTagTag ? 0x004466 : 0x1a3a1a,
          transparent: true,
          opacity: isTagTag ? 0.2 : 0.35,
        });
        scene.add(new THREE.Line(geo, mat));
      });

      // Particle field background
      const pGeo  = new THREE.BufferGeometry();
      const pVerts = new Float32Array(600);
      for (let i = 0; i < 600; i++) pVerts[i] = (Math.random() - 0.5) * 60;
      pGeo.setAttribute("position", new THREE.BufferAttribute(pVerts, 3));
      const pMat = new THREE.PointsMaterial({ color: 0x113311, size: 0.08 });
      scene.add(new THREE.Points(pGeo, pMat));

      sceneRef.current = { scene, camera, renderer, meshes, allObjs, positions, nodes };

      // ── ORBIT CONTROLS (manual) ────────────────────────
      let isDown = false, lastX = 0, lastY = 0;
      let rotX = 0, rotY = 0, zoom = 18;

      const onDown = e => { isDown = true; lastX = e.clientX; lastY = e.clientY; };
      const onUp   = () => { isDown = false; };
      const onMove = e => {
        if (!isDown) return;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        rotY += dx * 0.005;
        rotX += dy * 0.005;
        rotX  = Math.max(-Math.PI/2, Math.min(Math.PI/2, rotX));
        lastX = e.clientX; lastY = e.clientY;
      };
      const onWheel = e => {
        zoom += e.deltaY * 0.02;
        zoom  = Math.max(5, Math.min(40, zoom));
      };

      el.addEventListener("mousedown", onDown);
      window.addEventListener("mouseup", onUp);
      window.addEventListener("mousemove", onMove);
      el.addEventListener("wheel", onWheel);

      // ── RAYCASTING (click/hover) ──────────────────────
      const raycaster = new THREE.Raycaster();
      const mouse2d   = new THREE.Vector2();

      const onMouseMove = e => {
        const rect = el.getBoundingClientRect();
        mouse2d.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
        mouse2d.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse2d, camera);
        const hits = raycaster.intersectObjects(allObjs);
        if (hits.length > 0) {
          const node = hits[0].object.userData.node;
          setHovered(node || null);
          el.style.cursor = "pointer";
        } else {
          setHovered(null);
          el.style.cursor = "default";
        }
      };

      const onClick = e => {
        const rect = el.getBoundingClientRect();
        mouse2d.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
        mouse2d.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse2d, camera);
        const hits = raycaster.intersectObjects(allObjs);
        if (hits.length > 0) {
          const node = hits[0].object.userData.node;
          if (node) {
            setSelected(node);
            // Load memories for this node
            const mems = getAllMemories().filter(m => {
              if (node.type === "model") return m.model === node.fullLabel;
              if (node.type === "tag")   return getActiveTag(m).includes(node.label);
              return false;
            });
            setMemories(mems.slice(0, 20));
          }
        } else {
          setSelected(null);
          setMemories([]);
        }
      };

      el.addEventListener("mousemove", onMouseMove);
      el.addEventListener("click", onClick);

      // ── ANIMATE ─────────────────────────────────────────
      let t = 0;
      const animate = () => {
        animId = requestAnimationFrame(animate);
        t += 0.005;

        // Gentle auto-rotate when not interacting
        if (!isDown) rotY += 0.001;

        // Camera orbit
        camera.position.x = Math.sin(rotY) * Math.cos(rotX) * zoom;
        camera.position.y = Math.sin(rotX) * zoom;
        camera.position.z = Math.cos(rotY) * Math.cos(rotX) * zoom;
        camera.lookAt(0, 0, 0);

        // Pulse model nodes
        Object.values(meshes).forEach((mesh, i) => {
          if (mesh.userData.node?.type === "model") {
            mesh.material.emissiveIntensity = 0.3 + Math.sin(t * 2 + i) * 0.15;
          }
        });

        // Highlight hovered
        allObjs.forEach(obj => {
          if (obj.userData.node) {
            const isHov = hovered && obj.userData.node.id === hovered.id;
            const isSel = selected && obj.userData.node.id === selected.id;
            obj.material.emissiveIntensity = isSel ? 0.9 : isHov ? 0.7 : (obj.userData.node.type === "model" ? 0.3 + Math.sin(t * 2) * 0.1 : 0.15);
          }
        });

        pLight.position.x = Math.sin(t * 0.5) * 8;
        pLight.position.z = Math.cos(t * 0.5) * 8;

        renderer.render(scene, camera);
      };
      animate();

      // Resize handler
      const onResize = () => {
        const W2 = el.clientWidth, H2 = el.clientHeight;
        camera.aspect = W2 / H2;
        camera.updateProjectionMatrix();
        renderer.setSize(W2, H2);
      };
      window.addEventListener("resize", onResize);

      return () => {
        cancelAnimationFrame(animId);
        el.removeEventListener("mousedown", onDown);
        window.removeEventListener("mouseup", onUp);
        window.removeEventListener("mousemove", onMove);
        el.removeEventListener("wheel", onWheel);
        el.removeEventListener("mousemove", onMouseMove);
        el.removeEventListener("click", onClick);
        window.removeEventListener("resize", onResize);
        renderer.dispose();
        if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
      };
    });

    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div className="brain-viz-overlay">
      {/* Header */}
      <div className="bv-header">
        <div>
          <div className="bv-title">🧠 CONTEXT NEURAL MAP</div>
          <div className="bv-sub">{stats.nodes} nodes · {stats.edges} connections · {stats.memories} memories</div>
        </div>
        <div className="bv-header-right">
          <div className="bv-hint">DRAG to rotate · SCROLL to zoom · CLICK a node</div>
          <button className="bv-close" onClick={onClose}>✕ CLOSE</button>
        </div>
      </div>

      {/* Main content */}
      <div className="bv-body">
        {/* 3D Canvas */}
        <div ref={mountRef} className="bv-canvas"/>

        {/* Info panel */}
        <div className="bv-panel">
          {/* Hover tooltip */}
          {hovered && !selected && (
            <div className="bv-tooltip">
              <div className="bv-tt-type">{hovered.type.toUpperCase()}</div>
              <div className="bv-tt-name">{hovered.label}</div>
              <div className="bv-tt-stat">{hovered.count} memories</div>
              {hovered.promptCount > 0 && <div className="bv-tt-stat">{hovered.promptCount} prompts</div>}
            </div>
          )}

          {/* Selected node detail */}
          {selected ? (
            <div className="bv-detail">
              <div className="bv-detail-header">
                <div>
                  <div className="bv-detail-type">{selected.type.toUpperCase()} NODE</div>
                  <div className="bv-detail-name">{selected.label}</div>
                </div>
                <button className="bv-detail-close" onClick={() => { setSelected(null); setMemories([]); }}>✕</button>
              </div>
              <div className="bv-detail-stats">
                <div className="bv-ds-item"><span>MEMORIES</span><span>{selected.count}</span></div>
                {selected.promptCount > 0 && <div className="bv-ds-item"><span>PROMPTS</span><span>{selected.promptCount}</span></div>}
              </div>
              <div className="bv-detail-mems">
                <div className="bv-dm-label">STORED MEMORIES</div>
                {memories.length === 0
                  ? <div className="bv-dm-empty">No memories yet</div>
                  : memories.map(m => (
                    <div key={m.id} className="bv-dm-item">
                      <div className="bv-dm-tags">
                        {getActiveTag(m).map(t => <span key={t} className="bv-dm-tag">{t}</span>)}
                        {m.sentiment === "positive" && <span className="bv-dm-tag pos">👍</span>}
                        {m.sentiment === "negative" && <span className="bv-dm-tag neg">👎</span>}
                      </div>
                      <div className="bv-dm-text">{m.content.slice(0, 120)}...</div>
                      <div className="bv-dm-meta">{new Date(m.created_at).toLocaleDateString()} · {formatBytes(m.size_bytes)}</div>
                    </div>
                  ))
                }
              </div>
            </div>
          ) : (
            <div className="bv-legend">
              <div className="bv-legend-title">LEGEND</div>
              <div className="bv-legend-item"><div className="bv-legend-dot" style={{background:"#39ff14"}}/><span>Model node (large)</span></div>
              <div className="bv-legend-item"><div className="bv-legend-dot" style={{background:"#00f5ff"}}/><span>Topic/tag node</span></div>
              <div className="bv-legend-item"><div className="bv-legend-line" style={{background:"rgba(57,255,20,.4)"}}/><span>Model → topic link</span></div>
              <div className="bv-legend-item"><div className="bv-legend-line" style={{background:"rgba(0,68,102,.6)"}}/><span>Shared tag bridge</span></div>
              <div className="bv-legend-explain">
                <div className="bv-legend-explain-title">WHAT YOU'RE SEEING</div>
                <p>Each glowing sphere is a model or a topic you've explored. The connections show how your models have built context around different subjects.</p>
                <p>Larger nodes = more memory stored. Brighter = more recently used.</p>
                <p>This is your personal knowledge graph — built from your conversations, not from any company's data center.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
