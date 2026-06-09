import { useEffect, useState, useRef, createContext, useContext } from "react";
import "./App.css";

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════
const TABS = [
  { id:"chat",     label:"CHAT AI",       icon:"👾", color:"green"  },
  { id:"research", label:"RESEARCH",      icon:"🔬", color:"yellow" },
  { id:"music",    label:"MUSIC AI",      icon:"🎵", color:"cyan"   },
  { id:"photo",    label:"IMAGE & PHOTO", icon:"📷", color:"pink"   },
  { id:"camera",   label:"AR CAMERA",     icon:"🎥", color:"pink"   },
  { id:"code",     label:"CODE",          icon:"⌨️", color:"lime"   },
  { id:"compare",  label:"MODEL COMPARE", icon:"⚡", color:"purple" },
  { id:"settings", label:"SETTINGS",      icon:"⚙️", color:"orange" },
];

const DEFAULT_CONNECTIONS = [
  { id:"ollama",    name:"Ollama",        type:"local",  icon:"🦙", url:"http://localhost:11434", apiKey:"", status:"unconfigured", models:[] },
  { id:"openai",    name:"OpenAI",        type:"cloud",  icon:"🤖", url:"https://api.openai.com/v1", apiKey:"", status:"unconfigured", models:["gpt-4o","gpt-4o-mini","gpt-4-turbo","gpt-3.5-turbo"] },
  { id:"anthropic", name:"Anthropic",     type:"cloud",  icon:"🧠", url:"https://api.anthropic.com", apiKey:"", status:"unconfigured", models:["claude-opus-4-6","claude-sonnet-4-6","claude-haiku-4-5"] },
  { id:"google",    name:"Google Gemini", type:"cloud",  icon:"💎", url:"https://generativelanguage.googleapis.com/v1beta/openai", apiKey:"", status:"unconfigured", models:["gemini-2.0-flash","gemini-1.5-pro","gemini-1.5-flash"] },
  { id:"groq",      name:"Groq",          type:"cloud",  icon:"⚡", url:"https://api.groq.com/openai/v1", apiKey:"", status:"unconfigured", models:["llama-3.3-70b-versatile","deepseek-r1-distill-llama-70b","gemma2-9b-it","mixtral-8x7b-32768"] },
  { id:"mistral",   name:"Mistral AI",    type:"cloud",  icon:"🌪️", url:"https://api.mistral.ai/v1", apiKey:"", status:"unconfigured", models:["mistral-large-latest","mistral-medium-latest","open-mistral-7b"] },
  { id:"openrouter",name:"OpenRouter",    type:"cloud",  icon:"🔀", url:"https://openrouter.ai/api/v1", apiKey:"", status:"unconfigured", models:["google/gemma-3-27b-it","deepseek/deepseek-r1","qwen/qwen-2.5-72b-instruct"] },
  { id:"stability", name:"Stability AI",  type:"image",  icon:"🎨", url:"https://api.stability.ai", apiKey:"", status:"unconfigured", models:["stable-diffusion-3","stable-image-ultra"] },
  { id:"fal",       name:"fal.ai (FLUX)", type:"image",  icon:"🖼️", url:"https://fal.run", apiKey:"", status:"unconfigured", models:["flux-pro","flux-dev","flux-schnell"] },
  { id:"suno",      name:"Suno",          type:"music",  icon:"🎵", url:"https://api.suno.ai", apiKey:"", status:"unconfigured", models:["suno-v4","suno-v3.5"] },
  { id:"mediapipe", name:"MediaPipe",     type:"vision", icon:"👁️", url:"local://mediapipe", apiKey:"", status:"unconfigured", models:["hand-landmarker","face-mesh","pose-landmarker"] },
  { id:"chromadb",  name:"ChromaDB",      type:"memory", icon:"🗄️", url:"http://localhost:8000", apiKey:"", status:"unconfigured", models:[] },
  { id:"searxng",   name:"SearXNG",       type:"search", icon:"🔍", url:"http://localhost:8080", apiKey:"", status:"unconfigured", models:[] },
];

const DEFAULT_ASSIGNMENTS = {
  chat:     { connectionId:"", model:"" },
  research: { connectionId:"", model:"" },
  music:    { connectionId:"", model:"" },
  photo:    { connectionId:"", model:"" },
  camera:   { connectionId:"", model:"" },
  code:     { connectionId:"", model:"" },
  compare:  { connectionId:"", model:"" },
};

const OLLAMA_CATALOG = [
  { name:"deepseek-r1:8b",    size:"4.9 GB", desc:"DeepSeek R1 8B — chain-of-thought reasoning",        tags:["research","chat"] },
  { name:"deepseek-r1:14b",   size:"9.0 GB", desc:"DeepSeek R1 14B — stronger reasoning",               tags:["research","chat"] },
  { name:"qwen3:8b",          size:"5.2 GB", desc:"Qwen3 8B — excellent multilingual & reasoning",       tags:["chat","research","code"] },
  { name:"qwen3:14b",         size:"9.3 GB", desc:"Qwen3 14B — stronger reasoning, longer context",      tags:["chat","research"] },
  { name:"qwen2.5-coder:7b",  size:"4.7 GB", desc:"Qwen 2.5 Coder — multilingual code generation",      tags:["code"] },
  { name:"gemma3:4b",         size:"3.3 GB", desc:"Google Gemma 3 4B — compact, capable",               tags:["chat"] },
  { name:"gemma3:12b",        size:"8.1 GB", desc:"Google Gemma 3 12B — strong multimodal reasoning",   tags:["chat","research"] },
  { name:"llava:13b",         size:"8.0 GB", desc:"LLaVA 13B — vision + language (photo tab)",          tags:["photo"] },
  { name:"mistral",           size:"4.1 GB", desc:"Mistral 7B — sharp instruction following",            tags:["chat","code"] },
  { name:"phi4",              size:"9.1 GB", desc:"Microsoft Phi-4 — efficient reasoning",               tags:["chat","code"] },
  { name:"nomic-embed-text",  size:"274 MB", desc:"Nomic embeddings — for ChromaDB RAG memory",         tags:["research","memory"] },
  { name:"mxbai-embed-large", size:"669 MB", desc:"MixedBread embed — high-quality semantic search",    tags:["research","memory"] },
];

const Ctx = createContext(null);
const useCtx = () => useContext(Ctx);

// ═══════════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════════
export default function App() {
  const [tab,   setTab]   = useState("chat");
  const [mouse, setMouse] = useState({ x:0, y:0 });
  const [cpu,   setCpu]   = useState(21);

  const [connections, setConnections] = useState(() => {
    try { return JSON.parse(localStorage.getItem("oni_connections")) || DEFAULT_CONNECTIONS; }
    catch { return DEFAULT_CONNECTIONS; }
  });
  const [assignments, setAssignments] = useState(() => {
    try { return JSON.parse(localStorage.getItem("oni_assignments")) || DEFAULT_ASSIGNMENTS; }
    catch { return DEFAULT_ASSIGNMENTS; }
  });

  useEffect(() => { localStorage.setItem("oni_connections", JSON.stringify(connections)); }, [connections]);
  useEffect(() => { localStorage.setItem("oni_assignments", JSON.stringify(assignments)); }, [assignments]);
  useEffect(() => {
    const fn = e => setMouse({ x:e.clientX, y:e.clientY });
    window.addEventListener("mousemove", fn);
    return () => window.removeEventListener("mousemove", fn);
  }, []);
  useEffect(() => {
    const id = setInterval(() => setCpu(Math.floor(Math.random()*35+15)), 3000);
    return () => clearInterval(id);
  }, []);

  const updateConn = (id, patch) =>
    setConnections(cs => cs.map(c => c.id===id ? {...c,...patch} : c));
  const setAssign = (section, patch) =>
    setAssignments(a => ({ ...a, [section]: {...a[section],...patch} }));

  const chatA = assignments.chat;
  const chatC = connections.find(c => c.id===chatA?.connectionId);
  const topModelLabel = chatA?.model ? `${chatC?.icon||""} ${chatA.model}` : "NO MODEL";

  const goSettings = () => setTab("settings");

  return (
    <Ctx.Provider value={{ connections, assignments, updateConn, setAssign }}>
      <div className="oni-root">
        <MatrixRain />
        <div className="oni-layout">
          <TopBar cpu={cpu} modelLabel={topModelLabel} onSettings={goSettings} />
          <NavBar tab={tab} setTab={setTab} />
          <div className={`oni-main${tab==="camera"||tab==="settings"?" oni-main-full":""}`}>
            {tab!=="camera" && tab!=="settings" && <LeftSidebar setTab={setTab} />}
            <div className="oni-center">
              {tab==="chat"     && <ChatTab     mouse={mouse} goSettings={goSettings} />}
              {tab==="research" && <ResearchStub              goSettings={goSettings} />}
              {tab==="music"    && <MusicTab                  goSettings={goSettings} />}
              {tab==="photo"    && <PhotoTab                  goSettings={goSettings} />}
              {tab==="camera"   && <CameraStub                goSettings={goSettings} />}
              {tab==="code"     && <CodeTab                   goSettings={goSettings} />}
              {tab==="compare"  && <CompareTab                goSettings={goSettings} />}
              {tab==="settings" && <SettingsPage />}
            </div>
            {tab!=="camera" && tab!=="settings" && <RightSidebar />}
          </div>
          <BottomBar />
        </div>
      </div>
    </Ctx.Provider>
  );
}

// ═══════════════════════════════════════════════════════════
// TOPBAR
// ═══════════════════════════════════════════════════════════
function TopBar({ cpu, modelLabel, onSettings }) {
  return (
    <div className="topbar">
      <div className="logo-block">
        <span className="logo">ONI</span>
        <span className="logo-sub">// AI OPERATING SYSTEM</span>
      </div>
      <div className="sys-stats">
        <Stat label="STATUS" val={<><span className="pulse"/>ONLINE</>} />
        <Stat label="MEMORY" val="12.7 GB" />
        <Stat label="CPU"    val={`${cpu}%`} />
        <Stat label="MODEL"  val={modelLabel} />
      </div>
      <button className="settings-topbtn" onClick={onSettings}>
        <span className="settings-topbtn-icon">⚙</span>
        <span className="settings-topbtn-label">SETTINGS</span>
      </button>
    </div>
  );
}
function Stat({ label, val }) {
  return (
    <div className="stat-item">
      <div className="stat-label">{label}</div>
      <div className="stat-val">{val}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// NAVBAR
// ═══════════════════════════════════════════════════════════
function NavBar({ tab, setTab }) {
  return (
    <div className="navbar">
      {TABS.map(t => (
        <button key={t.id}
          className={`nav-btn nav-${t.color}${tab===t.id?" active":""}`}
          onClick={() => setTab(t.id)}>
          <span className="nav-icon">{t.icon}</span>{t.label}
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SETTINGS PAGE
// ═══════════════════════════════════════════════════════════
const SETTINGS_TABS = [
  { id:"connections", label:"MODEL CONNECTIONS", icon:"🔌" },
  { id:"ollama",      label:"OLLAMA",            icon:"🦙" },
  { id:"assignments", label:"SECTION DEFAULTS",  icon:"🎯" },
  { id:"apikeys",     label:"API KEYS",          icon:"🔑" },
  { id:"memory",      label:"MEMORY / CHROMA",   icon:"🧠" },
  { id:"search",      label:"SEARXNG SEARCH",    icon:"🔍" },
  { id:"system",      label:"SYSTEM",            icon:"⚙️" },
];

function SettingsPage() {
  const [stab, setStab] = useState("connections");
  return (
    <div className="settings-page">
      <div className="settings-header-bar">
        <div className="settings-title">⚙ SYSTEM SETTINGS</div>
        <div className="settings-sub">// MODEL CONNECTIONS · MEMORY · SEARCH · SYSTEM</div>
      </div>
      <div className="settings-body">
        <div className="settings-nav">
          {SETTINGS_TABS.map(t => (
            <button key={t.id}
              className={`stab-btn${stab===t.id?" active":""}`}
              onClick={() => setStab(t.id)}>
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
          <div className="settings-nav-footer">
            ONI OS v0.1.0<br/>MARATHON PROTOCOL
          </div>
        </div>
        <div className="settings-content">
          {stab==="connections" && <ConnectionsPane />}
          {stab==="ollama"      && <OllamaPane />}
          {stab==="assignments" && <AssignmentsPane />}
          {stab==="apikeys"     && <ApiKeysPane />}
          {stab==="memory"      && <MemoryPane />}
          {stab==="search"      && <SearchPane />}
          {stab==="system"      && <SystemPane />}
        </div>
      </div>
    </div>
  );
}

// ── CONNECTIONS ──────────────────────────────────────────────
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
        } else throw new Error("bad response");
      } else if (conn.type==="memory") {
        const r = await fetch(`${conn.url}/api/v1/heartbeat`, { signal:AbortSignal.timeout(4000) });
        updateConn(conn.id, { status: r.ok?"connected":"error" });
      } else if (conn.type==="search") {
        const r = await fetch(`${conn.url}/healthz`, { signal:AbortSignal.timeout(4000) });
        updateConn(conn.id, { status: r.ok?"connected":"error" });
      } else {
        updateConn(conn.id, { status: conn.apiKey?"connected":"error" });
      }
    } catch(e) { updateConn(conn.id, { status:"error" }); }
  };

  const groups = [
    { type:"local",  label:"LOCAL PROVIDERS" },
    { type:"cloud",  label:"CLOUD PROVIDERS" },
    { type:"image",  label:"IMAGE GENERATION" },
    { type:"music",  label:"MUSIC GENERATION" },
    { type:"vision", label:"VISION / AR" },
    { type:"memory", label:"MEMORY / DATABASE" },
    { type:"search", label:"SEARCH ENGINE" },
  ];

  return (
    <div className="settings-pane">
      <div className="sp-title">MODEL CONNECTIONS <span>// ALL PROVIDERS</span></div>
      <p className="sp-desc">Local providers run on your machine — no data leaves. Cloud APIs require keys. Hit TEST to verify each connection.</p>
      {groups.map(g => {
        const group = connections.filter(c => c.type===g.type);
        if (!group.length) return null;
        return (
          <div key={g.type} className="conn-group">
            <div className="conn-group-label">{g.label}</div>
            {group.map(conn => (
              <div key={conn.id} className={`conn-card status-border-${conn.status}`}>
                <div className="conn-card-row">
                  <span className="conn-icon">{conn.icon}</span>
                  <div className="conn-info">
                    <div className="conn-name">{conn.name}</div>
                    <div className="conn-url">{conn.url}</div>
                  </div>
                  <div className={`conn-badge status-${conn.status}`}>
                    {conn.status==="testing" ? "TESTING..." : conn.status.toUpperCase()}
                  </div>
                  <button className="btn-test" onClick={() => test(conn)}>
                    {conn.status==="testing" ? "..." : "TEST"}
                  </button>
                </div>
                {conn.status==="connected" && conn.models.length>0 && (
                  <div className="conn-models">
                    {conn.models.map(m => <span key={m} className="conn-model-pill">{m}</span>)}
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

// ── OLLAMA ───────────────────────────────────────────────────
function OllamaPane() {
  const { connections, updateConn } = useCtx();
  const ollama = connections.find(c => c.id==="ollama");
  const [url, setUrl]         = useState(ollama?.url||"http://localhost:11434");
  const [pulling, setPulling] = useState(null);
  const [pullLog, setPullLog] = useState([]);
  const [filter, setFilter]   = useState("all");
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [pullLog]);

  const saveAndTest = async () => {
    updateConn("ollama", { url });
    try {
      const r = await fetch(`${url}/api/tags`, { signal:AbortSignal.timeout(5000) });
      if (r.ok) {
        const d = await r.json();
        updateConn("ollama", { status:"connected", models:(d.models||[]).map(m=>m.name) });
        setPullLog(l => [...l, `✓ Connected — ${(d.models||[]).length} models found`]);
      } else throw new Error("bad response");
    } catch(e) {
      updateConn("ollama", { status:"error" });
      setPullLog(l => [...l, `✗ Cannot connect to ${url}`]);
    }
  };

  const pull = async (modelName) => {
    setPulling(modelName);
    setPullLog(l => [...l, `> Pulling ${modelName}...`]);
    try {
      const res = await fetch(`${ollama.url}/api/pull`, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ name:modelName, stream:false }),
      });
      if (res.ok) {
        setPullLog(l => [...l, `✓ ${modelName} ready`]);
        const r = await fetch(`${ollama.url}/api/tags`);
        if (r.ok) {
          const d = await r.json();
          updateConn("ollama", { models:(d.models||[]).map(m=>m.name), status:"connected" });
        }
      } else {
        setPullLog(l => [...l, `✗ Pull failed — is Ollama running?`]);
      }
    } catch(e) {
      setPullLog(l => [...l, `✗ Error: ${e.message}`]);
    }
    setPulling(null);
  };

  const deleteModel = async (modelName) => {
    try {
      await fetch(`${ollama.url}/api/delete`, {
        method:"DELETE",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ name:modelName }),
      });
      updateConn("ollama", { models: ollama.models.filter(m=>m!==modelName) });
    } catch(e) {}
  };

  const tags = ["all","chat","code","research","photo","memory"];
  const filtered = filter==="all" ? OLLAMA_CATALOG : OLLAMA_CATALOG.filter(m=>m.tags.includes(filter));

  return (
    <div className="settings-pane">
      <div className="sp-title">OLLAMA LOCAL MODELS <span>// SELF-HOSTED</span></div>
      <p className="sp-desc">Models run entirely on your machine. No data is sent anywhere. Your RTX 4060 can run 8B models at full speed.</p>

      <div className="sp-row">
        <span className="sp-label">OLLAMA URL</span>
        <input className="sp-input" value={url} onChange={e=>setUrl(e.target.value)} placeholder="http://localhost:11434"/>
        <button className="btn-sp green" onClick={saveAndTest}>CONNECT</button>
      </div>

      {ollama?.status==="connected" && (
        <div className="sp-section">
          <div className="sp-sublabel">INSTALLED ({ollama.models.length})</div>
          <div className="installed-models">
            {ollama.models.map(m => (
              <div key={m} className="installed-pill">
                <span>{m}</span>
                <button className="pill-del" onClick={()=>deleteModel(m)}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {pullLog.length>0 && (
        <div className="pull-log" ref={logRef}>
          {pullLog.map((l,i) => <div key={i}>{l}</div>)}
        </div>
      )}

      <div className="sp-section">
        <div className="sp-sublabel">MODEL CATALOG — CLICK TO PULL</div>
        <div className="catalog-filters">
          {tags.map(t => (
            <button key={t}
              className={`filter-pill${filter===t?" active":""}`}
              onClick={()=>setFilter(t)}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="catalog-list">
          {filtered.map(m => {
            const installed = ollama?.models?.some(im=>im.startsWith(m.name.split(":")[0]));
            return (
              <div key={m.name} className={`catalog-item${installed?" installed":""}`}>
                <div className="catalog-item-info">
                  <div className="catalog-item-name">{m.name}</div>
                  <div className="catalog-item-desc">{m.desc}</div>
                  <div className="catalog-item-tags">
                    {m.tags.map(t=><span key={t} className="catalog-tag">{t}</span>)}
                  </div>
                </div>
                <div className="catalog-item-right">
                  <div className="catalog-item-size">{m.size}</div>
                  {installed
                    ? <span className="catalog-installed">✓ INSTALLED</span>
                    : <button className="btn-pull"
                        disabled={pulling===m.name}
                        onClick={()=>pull(m.name)}>
                        {pulling===m.name ? "PULLING..." : "⬇ PULL"}
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

// ── ASSIGNMENTS ──────────────────────────────────────────────
const SECTION_META = [
  { id:"chat",     label:"CHAT AI",       icon:"👾", color:"green",  desc:"Conversation model" },
  { id:"research", label:"RESEARCH",      icon:"🔬", color:"yellow", desc:"Deep reasoning & analysis" },
  { id:"music",    label:"MUSIC AI",      icon:"🎵", color:"cyan",   desc:"Music generation" },
  { id:"photo",    label:"IMAGE & PHOTO", icon:"📷", color:"pink",   desc:"Image generation & vision" },
  { id:"camera",   label:"AR CAMERA",     icon:"🎥", color:"pink",   desc:"AR effect generation" },
  { id:"code",     label:"CODE",          icon:"⌨️", color:"lime",   desc:"Code completion & analysis" },
  { id:"compare",  label:"MODEL COMPARE", icon:"⚡", color:"purple", desc:"Benchmark runner" },
];

function AssignmentsPane() {
  const { connections, assignments, setAssign } = useCtx();

  const allModels = connections
    .filter(c => c.models.length>0)
    .flatMap(c => c.models.map(m => ({
      key:`${c.id}::${m}`,
      label:`${c.icon} ${m} (${c.name})`,
      connectionId:c.id,
      model:m,
    })));

  return (
    <div className="settings-pane">
      <div className="sp-title">SECTION DEFAULTS <span>// PER-TAB MODEL</span></div>
      <p className="sp-desc">Assign a model to each section. Models appear here after you connect a provider and hit TEST or CONNECT.</p>
      {allModels.length===0 && (
        <div className="sp-warning">
          ⚠ No models connected yet. Go to MODEL CONNECTIONS and test Ollama first.
        </div>
      )}
      <div className="assignments-grid">
        {SECTION_META.map(s => {
          const a = assignments[s.id] || { connectionId:"", model:"" };
          const current = a.model || "not set";
          return (
            <div key={s.id} className={`assign-card border-${s.color}`}>
              <div className="assign-top">
                <span className="assign-icon">{s.icon}</span>
                <div>
                  <div className={`assign-label color-${s.color}`}>{s.label}</div>
                  <div className="assign-desc">{s.desc}</div>
                </div>
              </div>
              {allModels.length>0
                ? <select
                    className={`assign-select color-${s.color}`}
                    value={a.connectionId&&a.model ? `${a.connectionId}::${a.model}` : ""}
                    onChange={e => {
                      if (!e.target.value) { setAssign(s.id,{connectionId:"",model:""}); return; }
                      const [cid,...mparts] = e.target.value.split("::");
                      setAssign(s.id,{connectionId:cid,model:mparts.join("::")});
                    }}>
                    <option value="">— select model —</option>
                    {allModels.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                : <div className="assign-empty">Connect a model provider first</div>
              }
              <div className="assign-current">ACTIVE: <span>{current}</span></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── API KEYS ─────────────────────────────────────────────────
function ApiKeysPane() {
  const { connections, updateConn } = useCtx();
  const cloudConns = connections.filter(c => !["local","vision"].includes(c.type));
  const [visible, setVisible] = useState({});

  return (
    <div className="settings-pane">
      <div className="sp-title">API KEYS <span>// STORED LOCALLY</span></div>
      <p className="sp-desc">Keys are saved in your browser localStorage only — never sent anywhere except directly to the provider API.</p>
      <div className="apikeys-list">
        {cloudConns.map(conn => (
          <div key={conn.id} className="apikey-row">
            <div className="apikey-info">
              <span className="conn-icon">{conn.icon}</span>
              <div>
                <div className="conn-name">{conn.name}</div>
                <div className="conn-url">{conn.url}</div>
              </div>
              {conn.status==="connected" && <div className="conn-badge status-connected">CONNECTED</div>}
            </div>
            <div className="apikey-input-row">
              <input
                type={visible[conn.id]?"text":"password"}
                className="sp-input key-input"
                placeholder={`${conn.name} API key...`}
                value={conn.apiKey}
                onChange={e=>updateConn(conn.id,{apiKey:e.target.value})}
              />
              <button className="btn-vis" onClick={()=>setVisible(v=>({...v,[conn.id]:!v[conn.id]}))}>
                {visible[conn.id]?"🙈":"👁️"}
              </button>
              <button className="btn-sp green"
                onClick={()=>updateConn(conn.id,{status:conn.apiKey?"connected":"unconfigured"})}>
                SAVE
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MEMORY ───────────────────────────────────────────────────
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
    <div className="settings-pane">
      <div className="sp-title">MEMORY / CHROMADB <span>// VECTOR STORAGE</span></div>
      <p className="sp-desc">ChromaDB stores research memories as vector embeddings for RAG. Run it in Docker alongside your app.</p>
      <div className="sp-code">docker run -p 8000:8000 chromadb/chroma</div>
      <div className="sp-row">
        <span className="sp-label">CHROMADB URL</span>
        <input className="sp-input" value={url} onChange={e=>setUrl(e.target.value)}/>
        <button className="btn-sp green" onClick={test}>TEST</button>
      </div>
      <div className={`conn-badge status-${chroma?.status||"unconfigured"}`} style={{marginTop:8,display:"inline-block"}}>
        {chroma?.status?.toUpperCase()||"UNCONFIGURED"}
      </div>
    </div>
  );
}

// ── SEARCH ───────────────────────────────────────────────────
function SearchPane() {
  const { connections, updateConn } = useCtx();
  const searxng = connections.find(c=>c.id==="searxng");
  const [url, setUrl] = useState(searxng?.url||"http://localhost:8080");

  const test = async () => {
    updateConn("searxng",{status:"testing"});
    try {
      const r = await fetch(`${url}/healthz`,{signal:AbortSignal.timeout(4000)});
      updateConn("searxng",{status:r.ok?"connected":"error",url});
    } catch { updateConn("searxng",{status:"error"}); }
  };

  return (
    <div className="settings-pane">
      <div className="sp-title">SEARXNG SEARCH <span>// PRIVATE SEARCH</span></div>
      <p className="sp-desc">SearXNG is a self-hosted meta search engine. The Research tab uses it to find real sources without tracking you.</p>
      <div className="sp-code">docker run -p 8080:8080 searxng/searxng</div>
      <div className="sp-row">
        <span className="sp-label">SEARXNG URL</span>
        <input className="sp-input" value={url} onChange={e=>setUrl(e.target.value)}/>
        <button className="btn-sp green" onClick={test}>TEST</button>
      </div>
      <div className={`conn-badge status-${searxng?.status||"unconfigured"}`} style={{marginTop:8,display:"inline-block"}}>
        {searxng?.status?.toUpperCase()||"UNCONFIGURED"}
      </div>
    </div>
  );
}

// ── SYSTEM ───────────────────────────────────────────────────
function SystemPane() {
  const { connections, assignments } = useCtx();
  const connected = connections.filter(c=>c.status==="connected").length;
  const assigned  = Object.values(assignments).filter(a=>a.model).length;

  const exportConfig = () => {
    const cfg = { connections, assignments, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(cfg,null,2)],{type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "oni-config.json";
    a.click();
  };

  const importConfig = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const cfg = JSON.parse(ev.target.result);
        if (cfg.connections) localStorage.setItem("oni_connections", JSON.stringify(cfg.connections));
        if (cfg.assignments) localStorage.setItem("oni_assignments", JSON.stringify(cfg.assignments));
        window.location.reload();
      } catch(e) { alert("Invalid config file"); }
    };
    reader.readAsText(file);
  };

  const clearAll = () => {
    if (!confirm("Reset all settings? This cannot be undone.")) return;
    localStorage.clear();
    window.location.reload();
  };

  return (
    <div className="settings-pane">
      <div className="sp-title">SYSTEM <span>// CONFIG & STATUS</span></div>
      <div className="system-stats-grid">
        <div className="sys-stat-card">
          <div className="sys-stat-val">{connected}</div>
          <div className="sys-stat-label">CONNECTED PROVIDERS</div>
        </div>
        <div className="sys-stat-card">
          <div className="sys-stat-val">{assigned}</div>
          <div className="sys-stat-label">SECTIONS WITH MODELS</div>
        </div>
        <div className="sys-stat-card">
          <div className="sys-stat-val">{connections.find(c=>c.id==="ollama")?.models?.length||0}</div>
          <div className="sys-stat-label">LOCAL MODELS</div>
        </div>
      </div>
      <div className="sp-section">
        <div className="sp-sublabel">CONFIG BACKUP</div>
        <div className="sp-row">
          <button className="btn-sp green" onClick={exportConfig}>⬇ EXPORT CONFIG</button>
          <label className="btn-sp green" style={{cursor:"pointer"}}>
            ⬆ IMPORT CONFIG
            <input type="file" accept=".json" style={{display:"none"}} onChange={importConfig}/>
          </label>
        </div>
      </div>
      <div className="sp-section">
        <div className="sp-sublabel">DANGER ZONE</div>
        <button className="btn-danger" onClick={clearAll}>✕ RESET ALL SETTINGS</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MODEL PICKER (used in each tab header)
// ═══════════════════════════════════════════════════════════
function ModelPicker({ section, color, goSettings }) {
  const { connections, assignments, setAssign } = useCtx();
  const a = assignments[section] || { connectionId:"", model:"" };
  const conn = connections.find(c=>c.id===a.connectionId);

  const allModels = connections
    .filter(c=>c.models.length>0)
    .flatMap(c=>c.models.map(m=>({
      key:`${c.id}::${m}`,
      label:`${c.icon} ${m}`,
      connectionId:c.id,
      model:m,
    })));

  if (!allModels.length) {
    return (
      <button className={`mpicker-empty color-${color}`} onClick={goSettings}>
        ⚙ CONNECT A MODEL
      </button>
    );
  }

  return (
    <div className="mpicker">
      <span className="mpicker-label">MODEL</span>
      <select
        className={`mpicker-select color-${color}`}
        value={a.connectionId&&a.model ? `${a.connectionId}::${a.model}` : ""}
        onChange={e => {
          if (!e.target.value) { setAssign(section,{connectionId:"",model:""}); return; }
          const [cid,...mparts] = e.target.value.split("::");
          setAssign(section,{connectionId:cid,model:mparts.join("::")});
        }}>
        <option value="">— select —</option>
        {allModels.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
      {a.model && <span className={`mpicker-active color-${color}`}>{conn?.icon} {a.model}</span>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// NO MODEL SPLASH
// ═══════════════════════════════════════════════════════════
function NoModel({ section, color, icon, goSettings }) {
  const { assignments } = useCtx();
  const a = assignments[section];
  if (a?.model) return null;
  return (
    <div className="no-model-splash">
      <div className="no-model-icon">{icon}</div>
      <div className={`no-model-title color-${color}`}>NO MODEL SELECTED</div>
      <div className="no-model-desc">Select a model above or configure one in Settings.</div>
      <button className={`no-model-btn color-${color}`} onClick={goSettings}>⚙ OPEN SETTINGS</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// LEFT SIDEBAR
// ═══════════════════════════════════════════════════════════
function LeftSidebar({ setTab }) {
  const tasks = [
    { name:"Quantum Gravity Paper", pct:87, cls:"green" },
    { name:"AI Consciousness Study", pct:61, cls:"yellow" },
    { name:"Dark Matter Analysis",   pct:33, cls:"pink" },
  ];
  const feed = [
    "[08:58] Library indexed 120 new papers",
    "[08:57] Brain linked 3 new concepts",
    "[08:56] Council review completed",
    "[08:55] Task updated",
    "[08:54] New document added",
    "[08:52] Music AI generated track",
    "[08:50] Model switched",
    "[08:48] Code analysis complete",
  ];
  return (
    <div className="sidebar-left">
      <div className="panel">
        <div className="panel-title">CORE <span>// ACTIVE</span></div>
        {[["📚","LIBRARY","42,731"],["🧠","BRAIN","NEURAL MAP"],["🖼️","GALLERY","1,293"],
          ["📄","DOCUMENTS","247"],["✅","TASKS","3 RUNNING"],["⚙️","COUNCIL","5 MEMBERS"]
        ].map(([icon,label,count])=>(
          <div className="panel-item" key={label}>
            <span className="pi-icon">{icon}</span>
            <span className="pi-label">{label}</span>
            <span className="pi-count">{count}</span>
          </div>
        ))}
      </div>
      <div className="panel">
        <div className="panel-title">ACTIVE TASKS <span>3 RUNNING</span></div>
        {tasks.map(t=>(
          <div className="task-item" key={t.name}>
            <div className="task-header">
              <span className="task-name">{t.name}</span>
              <span className="task-pct">{t.pct}%</span>
            </div>
            <div className="progress-bar">
              <div className={`progress-fill ${t.cls}`} style={{width:t.pct+"%"}}/>
            </div>
          </div>
        ))}
      </div>
      <div className="panel feed-panel">
        <div className="panel-title">FEED <span>// LIVE</span></div>
        {feed.map((f,i)=><div className="feed-item" key={i}>{f}</div>)}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// RIGHT SIDEBAR
// ═══════════════════════════════════════════════════════════
function RightSidebar() {
  const tools=[["🔍","WEB SEARCH",false],["📄","PDF EXTRACT",true],["⛏️","DATA MINER",true],
               ["🗺️","CITATION MAP",true],["🔗","CONCEPT LINKER",true],["⌨️","CODE ANALYZER",true],
               ["📊","VISUALIZER",true],["📝","REPORT BUILDER",true]];
  const council=[["👹","ALPHA ONI","LEAD ANALYST"],["👺","BETA ONI","CRITIC"],
                 ["😤","GAMMA ONI","SKEPTIC"],["🤖","DELTA ONI","DATA WIZARD"],
                 ["📜","EPSILON ONI","ARCHIVIST"]];
  return (
    <div className="sidebar-right">
      <div className="panel"><div className="panel-title">TOOLS <span>// SUITE</span></div></div>
      {tools.map(([icon,name,active])=>(
        <div className="tool-row" key={name}>
          <div className="tool-name"><span className="tool-icon">{icon}</span>{name}</div>
          <div className={`badge ${active?"badge-active":"badge-off"}`}>{active?"ACTIVE":"OFF"}</div>
        </div>
      ))}
      <div className="panel" style={{marginTop:8}}>
        <div className="panel-title">COUNCIL <span>5 ONLINE</span></div>
      </div>
      {council.map(([icon,name,role])=>(
        <div className="council-member" key={name}>
          <div className="oni-avatar">{icon}</div>
          <div className="member-info">
            <div className="member-name">{name}</div>
            <div className="member-role">{role}</div>
          </div>
          <div className="member-dot"/>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// BOTTOM BAR
// ═══════════════════════════════════════════════════════════
function BottomBar() {
  return (
    <div className="bottombar">
      <span className="bottom-side">マラソンを走る</span>
      <span className="bottom-marquee">✦ RUN THE MARATHON ✦</span>
      <span className="bottom-side">永遠に前進</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// CHAT TAB
// ═══════════════════════════════════════════════════════════
function ChatTab({ mouse, goSettings }) {
  const { connections, assignments } = useCtx();
  const [messages, setMessages] = useState([
    { role:"ai", text:"Chat mode initialized. Select a model above to begin." }
  ]);
  const [input,     setInput]     = useState("");
  const [streaming, setStreaming] = useState(false);
  const endRef = useRef(null);

  useEffect(()=>{ endRef.current?.scrollIntoView({behavior:"smooth"}); },[messages]);

  const a    = assignments.chat;
  const conn = connections.find(c=>c.id===a?.connectionId);

  const send = async () => {
    const text = input.trim();
    if (!text||streaming) return;
    setInput("");
    setMessages(m=>[...m,{role:"user",text}]);
    setStreaming(true);

    if (!a?.model||!conn) {
      setMessages(m=>[...m,{role:"ai",text:"⚠ No model selected. Use the model picker above or open Settings."}]);
      setStreaming(false); return;
    }

    const history = messages.slice(-8).map(m=>({role:m.role==="user"?"user":"assistant",content:m.text}));

    try {
      const endpoint = conn.type==="local"
        ? `${conn.url}/v1/chat/completions`
        : `${conn.url}/chat/completions`;

      const res = await fetch(endpoint, {
        method:"POST",
        headers:{"Content-Type":"application/json",...(conn.apiKey?{"Authorization":`Bearer ${conn.apiKey}`}:{})},
        body: JSON.stringify({
          model:a.model,
          messages:[...history,{role:"user",content:text}],
          stream:true,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setMessages(m=>[...m,{role:"ai",text:"",streaming:true}]);
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      while (true) {
        const {done,value} = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split("\n").filter(l=>l.startsWith("data: "));
        for (const line of lines) {
          const data = line.slice(6);
          if (data==="[DONE]") continue;
          try {
            const delta = JSON.parse(data).choices?.[0]?.delta?.content||"";
            full += delta;
            setMessages(m=>[...m.slice(0,-1),{role:"ai",text:full,streaming:true}]);
          } catch(e){}
        }
      }
      setMessages(m=>[...m.slice(0,-1),{role:"ai",text:full}]);
    } catch(e) {
      setMessages(m=>[...m,{role:"ai",text:`✗ ${e.message}`}]);
    }
    setStreaming(false);
  };

  return (
    <div className="tab-chat">
      <div className="tab-header-row">
        <div>
          <div className="tab-title green">CHAT MODE</div>
          <div className="tab-sub">// THINK. REASON. CREATE.</div>
        </div>
        <ModelPicker section="chat" color="green" goSettings={goSettings}/>
      </div>
      <div className="floating-head"
        style={{transform:`translate(calc(-50% + ${mouse.x*.015}px),calc(-50% + ${mouse.y*.015}px))`}}>
        ( O N I )
      </div>
      <NoModel section="chat" color="green" icon="👾" goSettings={goSettings}/>
      <div className="messages-area">
        {messages.map((m,i)=>(
          <div key={i} className={`msg msg-${m.role}`}>
            <div className="msg-sender">{m.role==="ai"?"ONI // AI":"YOU"}</div>
            {m.text}{m.streaming&&<span className="blink-cursor">▌</span>}
          </div>
        ))}
        <div ref={endRef}/>
      </div>
      <div className="input-area">
        <button className="btn-icon">📎</button>
        <button className="btn-icon">🎤</button>
        <textarea className="chat-input" value={input}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
          placeholder="Send a message..." disabled={streaming}/>
        <button className="btn-send green" onClick={send} disabled={streaming||!input.trim()}>
          {streaming?"▌":"SEND ▶"}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// RESEARCH STUB (full version coming soon)
// ═══════════════════════════════════════════════════════════
function ResearchStub({ goSettings }) {
  return (
    <div className="tab-stub">
      <div className="tab-header-row">
        <div>
          <div className="tab-title yellow">RESEARCH MODE</div>
          <div className="tab-sub">// BUILD. ANALYZE. DISCOVER. EVOLVE.</div>
        </div>
        <ModelPicker section="research" color="yellow" goSettings={goSettings}/>
      </div>
      <div className="stub-center">
        <pre className="oni-ascii-big">{`
 ██████╗ ███╗   ██╗██╗
██╔═══██╗████╗  ██║██║
██║   ██║██╔██╗ ██║██║
██║   ██║██║╚██╗██║██║
╚██████╔╝██║ ╚████║██║
 ╚═════╝ ╚═╝  ╚═══╝╚═╝
    鬼  RESEARCH CORE  鬼
`}</pre>
        <div className="stub-label">RESEARCH TAB COMING SOON</div>
        <div className="stub-sub">Quick Study · Deep Research · Brain / Memory</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MUSIC TAB
// ═══════════════════════════════════════════════════════════
function MusicTab({ goSettings }) {
  const [playing, setPlaying] = useState(false);
  const [activeGenres, setActiveGenres] = useState(["AMBIENT"]);
  const GENRES = ["AMBIENT","DARK SYNTH","TRAP","LO-FI","ORCHESTRAL","GLITCH","JAZZ","METAL"];
  return (
    <div className="tab-music">
      <div className="tab-header-row">
        <div>
          <div className="tab-title cyan">MUSIC AI</div>
          <div className="tab-sub cyan">// GENERATE. COMPOSE. TRANSFORM.</div>
        </div>
        <ModelPicker section="music" color="cyan" goSettings={goSettings}/>
      </div>
      <div className="music-body">
        <Waveform playing={playing}/>
        <div className="music-controls">
          {["⏮","⏪"].map(c=><button key={c} className="ctrl-btn cyan">{c}</button>)}
          <button className="ctrl-btn cyan play" onClick={()=>setPlaying(p=>!p)}>{playing?"⏸":"▶"}</button>
          {["⏩","⏭","🔀"].map(c=><button key={c} className="ctrl-btn cyan">{c}</button>)}
        </div>
        <div className="music-prompt-area">
          <input className="music-input" placeholder="Describe the music... e.g. dark synth ambient with glitchy drums"/>
          <div className="genre-pills">
            {GENRES.map(g=>(
              <span key={g}
                className={`genre-pill${activeGenres.includes(g)?" active":""}`}
                onClick={()=>setActiveGenres(a=>a.includes(g)?a.filter(x=>x!==g):[...a,g])}>
                {g}
              </span>
            ))}
          </div>
          <button className="btn-action cyan full">⚡ GENERATE TRACK</button>
        </div>
      </div>
    </div>
  );
}

function Waveform({ playing }) {
  const bars = Array.from({length:64},()=>({
    h:Math.random()*60+10,
    dur:0.5+Math.random()*1.5,
    delay:Math.random(),
    op:0.3+Math.random()*0.7
  }));
  return (
    <div className="waveform">
      {bars.map((b,i)=>(
        <div key={i} className="wbar" style={{
          height:b.h+"%",
          animationDuration:b.dur+"s",
          animationDelay:b.delay+"s",
          opacity:b.op,
          animationPlayState:playing?"running":"paused"
        }}/>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PHOTO TAB
// ═══════════════════════════════════════════════════════════
function PhotoTab({ goSettings }) {
  const [activeTool, setActiveTool] = useState("GENERATE");
  const [image, setImage] = useState(null);
  const fileRef = useRef(null);
  const TOOLS = ["GENERATE","EDIT","INPAINT","UPSCALE","REMOVE BG","STYLE TRANSFER"];
  const onFile = f => {
    if (!f||!f.type.startsWith("image/")) return;
    const r=new FileReader(); r.onload=e=>setImage(e.target.result); r.readAsDataURL(f);
  };
  return (
    <div className="tab-photo">
      <div className="tab-header-row">
        <div className="tab-title pink">IMAGE &amp; PHOTO AI</div>
        <ModelPicker section="photo" color="pink" goSettings={goSettings}/>
      </div>
      <div className="photo-toolbar">
        {TOOLS.map(t=>(
          <button key={t} className={`photo-tool-btn${activeTool===t?" active":""}`}
            onClick={()=>setActiveTool(t)}>{t}
          </button>
        ))}
      </div>
      <div className="photo-canvas"
        onDragOver={e=>e.preventDefault()}
        onDrop={e=>{e.preventDefault();onFile(e.dataTransfer.files[0]);}}>
        {image
          ? <img src={image} alt="uploaded" className="photo-preview"/>
          : <div className="photo-dropzone" onClick={()=>fileRef.current.click()}>
              <span className="drop-icon">🖼️</span>
              DROP IMAGE HERE OR CLICK TO UPLOAD
              <span className="drop-sub">PNG / JPG / WEBP</span>
            </div>
        }
        <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}}
          onChange={e=>onFile(e.target.files[0])}/>
      </div>
      <div className="input-area">
        <input className="chat-input" style={{height:38}} placeholder="Describe image to generate or edit..."/>
        <button className="btn-send pink">⚡ GO</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// CAMERA STUB
// ═══════════════════════════════════════════════════════════
function CameraStub({ goSettings }) {
  return (
    <div className="tab-stub">
      <div className="tab-header-row">
        <div>
          <div className="tab-title pink">AR CAMERA</div>
          <div className="tab-sub pink">// TRACK. AUGMENT. CREATE.</div>
        </div>
        <ModelPicker section="camera" color="pink" goSettings={goSettings}/>
      </div>
      <div className="stub-center">
        <div style={{fontSize:64}}>🎥</div>
        <div className="stub-label">AR CAMERA COMING BACK SOON</div>
        <div className="stub-sub">Hand tracking · GPU effects · AI-tuned shaders</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// CODE TAB
// ═══════════════════════════════════════════════════════════
const DEFAULT_CODE=`def analyze_data(dataset):
    import numpy as np
    results = []
    for point in dataset:
        tensor = np.array(point['coords'])
        eigenvalues = np.linalg.eigvals(tensor)
        results.append({'eigenvalues': eigenvalues})
    return results
`;

function CodeTab({ goSettings }) {
  const [activeFile, setActiveFile] = useState("main.py");
  const [code, setCode] = useState(DEFAULT_CODE);
  const output = `> Running...\n> Dataset loaded\n✓ Complete in 0.847s`;
  return (
    <div className="tab-code">
      <div className="code-topbar">
        <span className="tab-title lime" style={{fontSize:10,marginRight:10}}>CODE</span>
        {["main.py","utils.js","+ NEW"].map(f=>(
          <button key={f} className={`code-file-tab${activeFile===f?" active":""}`}
            onClick={()=>setActiveFile(f)}>{f}
          </button>
        ))}
        <div style={{flex:1}}/>
        <ModelPicker section="code" color="lime" goSettings={goSettings}/>
      </div>
      <div className="code-editor-area">
        <div className="code-pane">
          <div className="code-pane-header lime">EDITOR // {activeFile}</div>
          <textarea className="code-editor" value={code}
            onChange={e=>setCode(e.target.value)} spellCheck={false}/>
        </div>
        <div className="code-pane">
          <div className="code-pane-header" style={{color:"rgba(127,255,0,0.4)"}}>OUTPUT</div>
          <pre className="code-output">{output}</pre>
        </div>
      </div>
      <div className="code-actions">
        {["▶ RUN","✨ AI COMPLETE","🔍 EXPLAIN","🐛 DEBUG","📝 DOCUMENT","🔄 REFACTOR"].map(l=>(
          <button key={l} className="btn-action lime">{l}</button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// COMPARE TAB
// ═══════════════════════════════════════════════════════════
const MODELS_DATA=[
  {name:"GPT-4o",           speed:"Fast",  ctx:"128k",vision:true, cost:"$5.00"},
  {name:"Claude 3.5 Sonnet",speed:"Fast",  ctx:"200k",vision:true, cost:"$3.00",star:true},
  {name:"Gemini 1.5 Pro",   speed:"Med",   ctx:"1M",  vision:true, cost:"$3.50"},
  {name:"Llama 3.1 405B",   speed:"Slow",  ctx:"128k",vision:false,cost:"$0.90"},
  {name:"DeepSeek R1",      speed:"Med",   ctx:"64k", vision:false,cost:"$0.55"},
  {name:"Mistral Large",    speed:"Fast",  ctx:"128k",vision:false,cost:"$2.00"},
];

function CompareTab({ goSettings }) {
  return (
    <div className="tab-compare">
      <div className="tab-title purple" style={{marginBottom:16}}>⚡ MODEL COMPARISON MATRIX</div>
      <div className="compare-grid">
        {MODELS_DATA.map(m=>(
          <div key={m.name} className={`model-card${m.star?" featured":""}`}>
            <div className="model-card-name">{m.name}{m.star?" ★":""}</div>
            {[["SPEED",m.speed],["CONTEXT",m.ctx],["VISION",m.vision?"✓":"✗"],["COST/1M",m.cost]].map(([k,v])=>(
              <div className="model-metric" key={k}>
                <span className="metric-label">{k}</span>
                <span className="metric-val">{v}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="compare-prompt-area">
        <div className="compare-prompt-label">RUN SAME PROMPT ACROSS ALL MODELS</div>
        <textarea className="compare-input" placeholder="Enter a prompt to benchmark..."/>
        <div className="compare-actions">
          <button className="btn-action purple primary">⚡ RUN ALL MODELS</button>
          <button className="btn-action purple">SELECT MODELS</button>
          <button className="btn-action purple">EXPORT RESULTS</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MATRIX RAIN
// ═══════════════════════════════════════════════════════════
function MatrixRain() {
  useEffect(()=>{
    const canvas = document.getElementById("matrix-canvas");
    const ctx    = canvas.getContext("2d");
    const resize = ()=>{ canvas.width=window.innerWidth; canvas.height=window.innerHeight; };
    resize();
    window.addEventListener("resize",resize);
    const chars = "01ONIΣ∆☠█▒▓鬼研";
    let drops = Array(Math.floor(window.innerWidth/14)).fill(1);
    const draw = ()=>{
      ctx.fillStyle="rgba(0,0,0,0.07)";
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.font="13px monospace";
      drops.forEach((y,i)=>{
        ctx.fillStyle=Math.random()>.95?"#ffffff":"rgba(57,255,20,0.3)";
        ctx.fillText(chars[Math.floor(Math.random()*chars.length)],i*14,y*14);
        if(y*14>canvas.height&&Math.random()>.975) drops[i]=0;
        drops[i]++;
      });
    };
    const id=setInterval(draw,40);
    return()=>{ clearInterval(id); window.removeEventListener("resize",resize); };
  },[]);
  return <canvas id="matrix-canvas" className="matrix-canvas"/>;
}
