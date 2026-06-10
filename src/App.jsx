import { useEffect, useState, useRef, createContext, useContext } from "react";
import "./App.css";
import ChatMain    from "./ChatMain.jsx";
import LeftSidebar from "./LeftSidebar.jsx";
import { saveMemory, autoTag } from "./MemoryStore.js";

// ─── CONTEXT ────────────────────────────────────────────────
const Ctx = createContext(null);
export const useCtx = () => useContext(Ctx);

// ─── DEFAULTS ───────────────────────────────────────────────
const DEFAULT_CONNECTIONS = [
  { id:"ollama",    name:"Ollama",        type:"local",  icon:"🦙", url:"http://localhost:11434", apiKey:"", status:"unconfigured", models:[] },
  { id:"openai",    name:"OpenAI",        type:"cloud",  icon:"🤖", url:"https://api.openai.com/v1", apiKey:"", status:"unconfigured", models:["gpt-4o","gpt-4o-mini","gpt-3.5-turbo"] },
  { id:"anthropic", name:"Anthropic",     type:"cloud",  icon:"🧠", url:"https://api.anthropic.com", apiKey:"", status:"unconfigured", models:["claude-opus-4-6","claude-sonnet-4-6","claude-haiku-4-5"] },
  { id:"google",    name:"Google Gemini", type:"cloud",  icon:"💎", url:"https://generativelanguage.googleapis.com/v1beta/openai", apiKey:"", status:"unconfigured", models:["gemini-2.0-flash","gemini-1.5-pro"] },
  { id:"groq",      name:"Groq",          type:"cloud",  icon:"⚡", url:"https://api.groq.com/openai/v1", apiKey:"", status:"unconfigured", models:["llama-3.3-70b-versatile","deepseek-r1-distill-llama-70b"] },
  { id:"mistral",   name:"Mistral AI",    type:"cloud",  icon:"🌪️", url:"https://api.mistral.ai/v1", apiKey:"", status:"unconfigured", models:["mistral-large-latest","open-mistral-7b"] },
  { id:"openrouter",name:"OpenRouter",    type:"cloud",  icon:"🔀", url:"https://openrouter.ai/api/v1", apiKey:"", status:"unconfigured", models:["deepseek/deepseek-r1","qwen/qwen-2.5-72b-instruct"] },
  { id:"chromadb",  name:"ChromaDB",      type:"memory", icon:"🗄️", url:"http://localhost:8000", apiKey:"", status:"unconfigured", models:[] },
  { id:"searxng",   name:"SearXNG",       type:"search", icon:"🔍", url:"http://localhost:8080", apiKey:"", status:"unconfigured", models:[] },
];

const DEFAULT_ASSIGNMENTS = {
  chat:     { connectionId:"", model:"" },
  research: { connectionId:"", model:"" },
  code:     { connectionId:"", model:"" },
};

export const OLLAMA_CATALOG = [
  { name:"deepseek-r1:8b",   size:"4.9 GB", desc:"DeepSeek R1 8B — chain-of-thought reasoning",      tags:["research","chat"] },
  { name:"deepseek-r1:14b",  size:"9.0 GB", desc:"DeepSeek R1 14B — stronger reasoning",             tags:["research","chat"] },
  { name:"qwen3:8b",         size:"5.2 GB", desc:"Qwen3 8B — multilingual reasoning",                tags:["chat","research","code"] },
  { name:"qwen3:14b",        size:"9.3 GB", desc:"Qwen3 14B — longer context, stronger",             tags:["chat","research"] },
  { name:"qwen2.5-coder:7b", size:"4.7 GB", desc:"Qwen 2.5 Coder — code generation",                tags:["code"] },
  { name:"gemma3:4b",        size:"3.3 GB", desc:"Gemma 3 4B — compact and capable",                 tags:["chat"] },
  { name:"gemma3:12b",       size:"8.1 GB", desc:"Gemma 3 12B — strong reasoning",                   tags:["chat","research"] },
  { name:"llava:13b",        size:"8.0 GB", desc:"LLaVA 13B — vision + language",                    tags:["vision"] },
  { name:"mistral",          size:"4.1 GB", desc:"Mistral 7B — instruction following",               tags:["chat","code"] },
  { name:"phi4",             size:"9.1 GB", desc:"Phi-4 — efficient reasoning",                      tags:["chat","code"] },
  { name:"nomic-embed-text", size:"274 MB", desc:"Nomic embeddings — ChromaDB RAG memory",           tags:["memory"] },
];

// ─── ROOT ────────────────────────────────────────────────────
export default function App() {
  const [connections, setConnections] = useState(() => {
    try { return JSON.parse(localStorage.getItem("oni_connections")) || DEFAULT_CONNECTIONS; }
    catch { return DEFAULT_CONNECTIONS; }
  });
  const [assignments, setAssignments] = useState(() => {
    try { return JSON.parse(localStorage.getItem("oni_assignments")) || DEFAULT_ASSIGNMENTS; }
    catch { return DEFAULT_ASSIGNMENTS; }
  });
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab,  setSettingsTab]  = useState("connections");

  useEffect(() => { localStorage.setItem("oni_connections", JSON.stringify(connections)); }, [connections]);
  useEffect(() => { localStorage.setItem("oni_assignments", JSON.stringify(assignments)); }, [assignments]);

  const updateConn = (id, patch) =>
    setConnections(cs => cs.map(c => c.id===id ? {...c,...patch} : c));
  const setAssign = (section, patch) =>
    setAssignments(a => ({ ...a, [section]: {...a[section],...patch} }));

  const goSettings = (tab="connections") => {
    setSettingsTab(tab);
    setShowSettings(true);
  };

  const handleSaveToBrain = async (content, source, topic) => {
    const a    = assignments.chat;
    const conn = connections.find(c => c.id===a?.connectionId);
    const tags = await autoTag(content, conn, a?.model);
    saveMemory({ content, model:a?.model||"", connectionId:a?.connectionId||"", auto_tag:tags, source, topic, section:source });
  };

  return (
    <Ctx.Provider value={{ connections, assignments, updateConn, setAssign }}>
      <div className="oni-root">
        <MatrixRain />
        <div className="oni-layout">
          <TopBar
            connections={connections}
            assignments={assignments}
            setAssign={setAssign}
            onSettings={() => goSettings("connections")}
          />
          <div className="oni-main">
            <LeftSidebar goSettings={goSettings} />
            <div className="oni-center">
              <ChatMain
                connections={connections}
                assignments={assignments}
                onGoResearch={() => {}}
                onSaveToBrain={handleSaveToBrain}
              />
            </div>
          </div>
        </div>
        {showSettings && (
          <SettingsOverlay
            activeTab={settingsTab}
            onClose={() => setShowSettings(false)}
            onTabChange={setSettingsTab}
          />
        )}
      </div>
    </Ctx.Provider>
  );
}

// ─── TOPBAR ──────────────────────────────────────────────────
function TopBar({ connections, assignments, setAssign, onSettings }) {
  const [open, setOpen] = useState(false);
  const dropRef = useRef(null);
  const a    = assignments?.chat || { connectionId:"", model:"" };
  const conn = connections?.find(c => c.id===a.connectionId);

  const allModels = connections
    .filter(c => c.models.length > 0)
    .flatMap(c => c.models.map(m => ({
      key: `${c.id}::${m}`, label: m, sub: c.name,
      icon: c.icon, connectionId: c.id, model: m, local: c.type==="local",
    })));

  useEffect(() => {
    const fn = e => { if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const activeLabel = a.model ? `${conn?.icon||""} ${a.model}` : "SELECT MODEL";

  return (
    <div className="topbar">
      <div className="logo">ONI</div>

      <div className="model-drop-wrap" ref={dropRef}>
        <button className={`model-drop-btn${open?" open":""}`} onClick={() => setOpen(s=>!s)}>
          <span className="mdb-label">{activeLabel}</span>
          <span className="mdb-arrow">▾</span>
        </button>
        {open && (
          <div className="model-dropdown">
            {allModels.length === 0
              ? <div className="mdd-empty">
                  No models connected.<br/>Open Settings → Ollama to connect.
                </div>
              : allModels.map(m => (
                <div key={m.key}
                  className={`mdd-item${a.model===m.model&&a.connectionId===m.connectionId?" active":""}`}
                  onClick={() => {
                    setAssign("chat",     { connectionId:m.connectionId, model:m.model });
                    setAssign("research", { connectionId:m.connectionId, model:m.model });
                    setAssign("code",     { connectionId:m.connectionId, model:m.model });
                    setOpen(false);
                  }}>
                  <span className="mdd-icon">{m.icon}</span>
                  <div className="mdd-text">
                    <div className="mdd-label">{m.label}</div>
                    <div className="mdd-sub">{m.sub}{m.local?" · LOCAL":""}</div>
                  </div>
                  {a.model===m.model && <span className="mdd-check">✓</span>}
                </div>
              ))
            }
            <div className="mdd-footer" onClick={() => { onSettings(); setOpen(false); }}>
              ⚙ Manage connections
            </div>
          </div>
        )}
      </div>

      <button className="settings-btn" onClick={onSettings}>⚙</button>
    </div>
  );
}

// ─── SETTINGS OVERLAY ────────────────────────────────────────
const SETTINGS_TABS = [
  { id:"connections", label:"CONNECTIONS", icon:"🔌" },
  { id:"ollama",      label:"OLLAMA",      icon:"🦙" },
  { id:"assignments", label:"DEFAULTS",    icon:"🎯" },
  { id:"apikeys",     label:"API KEYS",    icon:"🔑" },
  { id:"memory",      label:"MEMORY",      icon:"🧠" },
  { id:"search",      label:"SEARCH",      icon:"🔍" },
  { id:"system",      label:"SYSTEM",      icon:"⚙️" },
];

function SettingsOverlay({ activeTab, onClose, onTabChange }) {
  return (
    <div className="settings-overlay" onClick={e => { if(e.target===e.currentTarget) onClose(); }}>
      <div className="settings-panel">
        <div className="settings-header">
          <div className="settings-title">SETTINGS</div>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>
        <div className="settings-body">
          <div className="settings-nav">
            {SETTINGS_TABS.map(t => (
              <button key={t.id}
                className={`stab-btn${activeTab===t.id?" active":""}`}
                onClick={() => onTabChange(t.id)}>
                <span>{t.icon}</span>{t.label}
              </button>
            ))}
          </div>
          <div className="settings-content">
            {activeTab==="connections" && <ConnectionsPane />}
            {activeTab==="ollama"      && <OllamaPane />}
            {activeTab==="assignments" && <AssignmentsPane />}
            {activeTab==="apikeys"     && <ApiKeysPane />}
            {activeTab==="memory"      && <MemoryPane />}
            {activeTab==="search"      && <SearchPane />}
            {activeTab==="system"      && <SystemPane />}
          </div>
        </div>
      </div>
    </div>
  );
}

function ConnectionsPane() {
  const { connections, updateConn } = useCtx();
  const test = async (conn) => {
    updateConn(conn.id, { status:"testing" });
    try {
      if (conn.type==="local") {
        const r = await fetch(`${conn.url}/api/tags`, { signal:AbortSignal.timeout(5000) });
        if (r.ok) {
          const d = await r.json();
          updateConn(conn.id, { status:"connected", models:(d.models||[]).map(m=>m.name) });
        } else throw new Error();
      } else if (conn.type==="memory") {
        const r = await fetch(`${conn.url}/api/v2/heartbeat`, { signal:AbortSignal.timeout(4000) });
        updateConn(conn.id, { status:r.ok?"connected":"error" });
      } else if (conn.type==="search") {
        const r = await fetch(`${conn.url}/healthz`, { signal:AbortSignal.timeout(4000) });
        updateConn(conn.id, { status:r.ok?"connected":"error" });
      } else {
        updateConn(conn.id, { status:conn.apiKey?"connected":"error" });
      }
    } catch { updateConn(conn.id, { status:"error" }); }
  };

  const groups = [
    { type:"local",  label:"LOCAL" },
    { type:"cloud",  label:"CLOUD" },
    { type:"memory", label:"MEMORY" },
    { type:"search", label:"SEARCH" },
  ];

  return (
    <div className="sp">
      <div className="sp-title">MODEL CONNECTIONS</div>
      <p className="sp-desc">Local models run on your machine — no data leaves. Test each connection to see available models.</p>
      {groups.map(g => {
        const group = connections.filter(c => c.type===g.type);
        if (!group.length) return null;
        return (
          <div key={g.type} className="conn-group">
            <div className="conn-group-label">{g.label}</div>
            {group.map(c => (
              <div key={c.id} className={`conn-card ${c.status}`}>
                <div className="conn-row">
                  <span className="conn-icon">{c.icon}</span>
                  <div className="conn-info">
                    <div className="conn-name">{c.name}</div>
                    <div className="conn-url">{c.url}</div>
                  </div>
                  <span className={`conn-badge ${c.status}`}>{c.status==="testing"?"...":c.status.toUpperCase()}</span>
                  <button className="btn-test" onClick={()=>test(c)}>{c.status==="testing"?"...":"TEST"}</button>
                </div>
                {c.status==="connected" && c.models.length>0 && (
                  <div className="conn-models">
                    {c.models.map(m=><span key={m} className="conn-pill">{m}</span>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function OllamaPane() {
  const { connections, updateConn } = useCtx();
  const ollama = connections.find(c=>c.id==="ollama");
  const [url,     setUrl]     = useState(ollama?.url||"http://localhost:11434");
  const [pulling, setPulling] = useState(null);
  const [log,     setLog]     = useState([]);
  const [filter,  setFilter]  = useState("all");
  const logRef = useRef(null);
  useEffect(()=>{ if(logRef.current) logRef.current.scrollTop=logRef.current.scrollHeight; },[log]);

  const connect = async () => {
    updateConn("ollama",{url});
    try {
      const r = await fetch(`${url}/api/tags`,{signal:AbortSignal.timeout(5000)});
      if (r.ok) {
        const d = await r.json();
        updateConn("ollama",{status:"connected",models:(d.models||[]).map(m=>m.name)});
        setLog(l=>[...l,`✓ Connected — ${(d.models||[]).length} models`]);
      } else throw new Error();
    } catch { updateConn("ollama",{status:"error"}); setLog(l=>[...l,`✗ Cannot reach ${url}`]); }
  };

  const pull = async (name) => {
    setPulling(name); setLog(l=>[...l,`> Pulling ${name}...`]);
    try {
      const r = await fetch(`${ollama.url}/api/pull`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,stream:false})});
      if (r.ok) {
        setLog(l=>[...l,`✓ ${name} ready`]);
        const r2 = await fetch(`${ollama.url}/api/tags`);
        if (r2.ok) { const d=await r2.json(); updateConn("ollama",{models:(d.models||[]).map(m=>m.name),status:"connected"}); }
      } else setLog(l=>[...l,`✗ Pull failed`]);
    } catch(e) { setLog(l=>[...l,`✗ ${e.message}`]); }
    setPulling(null);
  };

  const del = async (name) => {
    try {
      await fetch(`${ollama.url}/api/delete`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({name})});
      updateConn("ollama",{models:ollama.models.filter(m=>m!==name)});
    } catch {}
  };

  const tags  = ["all","chat","code","research","vision","memory"];
  const shown = filter==="all" ? OLLAMA_CATALOG : OLLAMA_CATALOG.filter(m=>m.tags.includes(filter));

  return (
    <div className="sp">
      <div className="sp-title">OLLAMA</div>
      <p className="sp-desc">Local models on your machine. No data sent anywhere. Your RTX 4060 runs 8B models at full GPU speed.</p>
      <div className="sp-row">
        <input className="sp-input" value={url} onChange={e=>setUrl(e.target.value)} placeholder="http://localhost:11434"/>
        <button className="btn-sp" onClick={connect}>CONNECT</button>
      </div>
      {ollama?.status==="connected" && ollama.models.length>0 && (
        <div className="sp-section">
          <div className="sp-label">INSTALLED ({ollama.models.length})</div>
          <div className="installed-list">
            {ollama.models.map(m=>(
              <div key={m} className="installed-pill">
                <span>{m}</span>
                <button onClick={()=>del(m)}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {log.length>0 && <div className="pull-log" ref={logRef}>{log.map((l,i)=><div key={i}>{l}</div>)}</div>}
      <div className="sp-section">
        <div className="sp-label">CATALOG</div>
        <div className="catalog-filters">
          {tags.map(t=><button key={t} className={`filter-pill${filter===t?" active":""}`} onClick={()=>setFilter(t)}>{t}</button>)}
        </div>
        <div className="catalog-list">
          {shown.map(m=>{
            const inst = ollama?.models?.some(im=>im.startsWith(m.name.split(":")[0]));
            return (
              <div key={m.name} className={`catalog-item${inst?" installed":""}`}>
                <div className="ci-info">
                  <div className="ci-name">{m.name}</div>
                  <div className="ci-desc">{m.desc}</div>
                  <div className="ci-tags">{m.tags.map(t=><span key={t}>{t}</span>)}</div>
                </div>
                <div className="ci-right">
                  <div className="ci-size">{m.size}</div>
                  {inst
                    ? <span className="ci-installed">✓</span>
                    : <button className="btn-pull" disabled={pulling===m.name} onClick={()=>pull(m.name)}>
                        {pulling===m.name?"...":"⬇"}
                      </button>
                  }
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AssignmentsPane() {
  const { connections, assignments, setAssign } = useCtx();
  const allModels = connections.filter(c=>c.models.length>0)
    .flatMap(c=>c.models.map(m=>({ key:`${c.id}::${m}`, label:`${c.icon} ${m}`, connectionId:c.id, model:m })));

  return (
    <div className="sp">
      <div className="sp-title">SECTION DEFAULTS</div>
      <p className="sp-desc">Assign a default model per task. Connect Ollama first to populate this list.</p>
      {allModels.length===0 && <div className="sp-warn">No models connected yet. Go to CONNECTIONS → test Ollama.</div>}
      {["chat","research","code"].map(s => {
        const a = assignments[s]||{connectionId:"",model:""};
        return (
          <div key={s} className="assign-row">
            <div className="assign-label">{s.toUpperCase()}</div>
            <select className="assign-select"
              value={a.connectionId&&a.model?`${a.connectionId}::${a.model}`:""}
              onChange={e=>{
                if(!e.target.value){setAssign(s,{connectionId:"",model:""});return;}
                const[cid,...mp]=e.target.value.split("::");
                setAssign(s,{connectionId:cid,model:mp.join("::")});
              }}>
              <option value="">— select —</option>
              {allModels.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
        );
      })}
    </div>
  );
}

function ApiKeysPane() {
  const { connections, updateConn } = useCtx();
  const cloud = connections.filter(c=>c.type==="cloud");
  const [vis,  setVis] = useState({});
  return (
    <div className="sp">
      <div className="sp-title">API KEYS</div>
      <p className="sp-desc">Stored in your browser localStorage only — never sent anywhere except directly to the provider.</p>
      {cloud.map(c=>(
        <div key={c.id} className="apikey-row">
          <div className="apikey-label">{c.icon} {c.name}</div>
          <div className="apikey-input-row">
            <input type={vis[c.id]?"text":"password"} className="sp-input"
              placeholder="API key..." value={c.apiKey}
              onChange={e=>updateConn(c.id,{apiKey:e.target.value})}/>
            <button className="btn-vis" onClick={()=>setVis(v=>({...v,[c.id]:!v[c.id]}))}>
              {vis[c.id]?"🙈":"👁️"}
            </button>
            <button className="btn-sp" onClick={()=>updateConn(c.id,{status:c.apiKey?"connected":"unconfigured"})}>SAVE</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function MemoryPane() {
  const { connections, updateConn } = useCtx();
  const chroma = connections.find(c=>c.id==="chromadb");
  const [url, setUrl] = useState(chroma?.url||"http://localhost:8000");
  const test = async () => {
    updateConn("chromadb",{status:"testing"});
    try {
      const r = await fetch(`${url}/api/v1/heartbeat`,{signal:AbortSignal.timeout(4000)});
      updateConn("chromadb",{status:r.ok?"connected":"error",url});
    } catch { updateConn("chromadb",{status:"error"}); }
  };
  return (
    <div className="sp">
      <div className="sp-title">MEMORY / CHROMADB</div>
      <p className="sp-desc">Vector database for semantic memory. Run locally with Docker. When connected, memories you rate 👍 get stored here and retrieved automatically as context.</p>
      <div className="sp-code">docker run -p 8000:8000 chromadb/chroma</div>
      <div className="sp-row">
        <input className="sp-input" value={url} onChange={e=>setUrl(e.target.value)}/>
        <button className="btn-sp" onClick={test}>TEST</button>
      </div>
      <span className={`conn-badge ${chroma?.status||"unconfigured"}`}>{chroma?.status?.toUpperCase()||"UNCONFIGURED"}</span>
    </div>
  );
}

function SearchPane() {
  const { connections, updateConn } = useCtx();
  const s = connections.find(c=>c.id==="searxng");
  const [url, setUrl] = useState(s?.url||"http://localhost:8080");
  const test = async () => {
    updateConn("searxng",{status:"testing"});
    try {
      const r = await fetch(`${url}/healthz`,{signal:AbortSignal.timeout(4000)});
      updateConn("searxng",{status:r.ok?"connected":"error",url});
    } catch { updateConn("searxng",{status:"error"}); }
  };
  return (
    <div className="sp">
      <div className="sp-title">SEARXNG SEARCH</div>
      <p className="sp-desc">Private self-hosted search for the Research tool. No tracking.</p>
      <div className="sp-code">docker run -p 8080:8080 searxng/searxng</div>
      <div className="sp-row">
        <input className="sp-input" value={url} onChange={e=>setUrl(e.target.value)}/>
        <button className="btn-sp" onClick={test}>TEST</button>
      </div>
      <span className={`conn-badge ${s?.status||"unconfigured"}`}>{s?.status?.toUpperCase()||"UNCONFIGURED"}</span>
    </div>
  );
}

function SystemPane() {
  const { connections, assignments } = useCtx();
  const exportConfig = () => {
    const blob = new Blob([JSON.stringify({connections,assignments},null,2)],{type:"application/json"});
    const a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="oni-config.json"; a.click();
  };
  const importConfig = e => {
    const file=e.target.files[0]; if(!file) return;
    const r=new FileReader(); r.onload=ev=>{
      try {
        const cfg=JSON.parse(ev.target.result);
        if(cfg.connections) localStorage.setItem("oni_connections",JSON.stringify(cfg.connections));
        if(cfg.assignments) localStorage.setItem("oni_assignments",JSON.stringify(cfg.assignments));
        window.location.reload();
      } catch { alert("Invalid config file"); }
    }; r.readAsText(file);
  };
  return (
    <div className="sp">
      <div className="sp-title">SYSTEM</div>
      <div className="sp-row">
        <button className="btn-sp" onClick={exportConfig}>⬇ EXPORT CONFIG</button>
        <label className="btn-sp" style={{cursor:"pointer"}}>⬆ IMPORT CONFIG<input type="file" accept=".json" style={{display:"none"}} onChange={importConfig}/></label>
      </div>
      <button className="btn-danger" onClick={()=>{ if(!confirm("Reset all settings?")) return; localStorage.clear(); window.location.reload(); }}>✕ RESET ALL</button>
    </div>
  );
}

// ─── MATRIX RAIN ─────────────────────────────────────────────
function MatrixRain() {
  useEffect(()=>{
    const canvas=document.getElementById("matrix-canvas");
    const ctx=canvas.getContext("2d");
    const resize=()=>{canvas.width=window.innerWidth;canvas.height=window.innerHeight;};
    resize(); window.addEventListener("resize",resize);
    const chars="01ONIΣ∆鬼研";
    let drops=Array(Math.floor(window.innerWidth/14)).fill(1);
    const draw=()=>{
      ctx.fillStyle="rgba(0,0,0,0.06)"; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.font="13px monospace";
      drops.forEach((y,i)=>{
        ctx.fillStyle=Math.random()>.97?"#ffffff":"rgba(57,255,20,0.25)";
        ctx.fillText(chars[Math.floor(Math.random()*chars.length)],i*14,y*14);
        if(y*14>canvas.height&&Math.random()>.975) drops[i]=0;
        drops[i]++;
      });
    };
    const id=setInterval(draw,40);
    return()=>{clearInterval(id);window.removeEventListener("resize",resize);};
  },[]);
  return <canvas id="matrix-canvas" className="matrix-canvas"/>;
}
