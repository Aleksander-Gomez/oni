import { useState, useRef, useEffect } from "react";
import { getModelRanking, formatBytes, getAllMemories } from "./MemoryStore.js";
import BrainViz from "./BrainViz.jsx";

// ─── FLOAT WINDOW ────────────────────────────────────────────
function FloatWindow({ title, onClose, children }) {
  const [pos,  setPos]  = useState({ x:100, y:80 });
  const [size, setSize] = useState({ w:500, h:440 });

  const onDragStart = (e) => {
    e.preventDefault();
    const startX=e.clientX-pos.x, startY=e.clientY-pos.y;
    const move = e => setPos({x:e.clientX-startX, y:e.clientY-startY});
    const up   = () => { window.removeEventListener("mousemove",move); window.removeEventListener("mouseup",up); };
    window.addEventListener("mousemove",move);
    window.addEventListener("mouseup",up);
  };

  const onResizeStart = (e) => {
    e.stopPropagation(); e.preventDefault();
    const startX=e.clientX, startY=e.clientY, startW=size.w, startH=size.h;
    const move = e => setSize({ w:Math.max(320,startW+(e.clientX-startX)), h:Math.max(200,startH+(e.clientY-startY)) });
    const up   = () => { window.removeEventListener("mousemove",move); window.removeEventListener("mouseup",up); };
    window.addEventListener("mousemove",move);
    window.addEventListener("mouseup",up);
  };

  return (
    <div className="float-window" style={{left:pos.x, top:pos.y, width:size.w, height:size.h}}>
      <div className="float-header" onMouseDown={onDragStart}>
        <span className="float-title">{title}</span>
        <button className="float-close" onMouseDown={e=>e.stopPropagation()} onClick={onClose}>✕</button>
      </div>
      <div className="float-body">{children}</div>
      <div className="float-resize" onMouseDown={onResizeStart}>⤡</div>
    </div>
  );
}

// ─── LIBRARY CONTENT ─────────────────────────────────────────
function LibraryContent() {
  const [mems,    setMems]    = useState([]);
  const [filter,  setFilter]  = useState("all");
  const [search,  setSearch]  = useState("");
  const [editId,  setEditId]  = useState(null);
  const [editTags,setEditTags]= useState("");

  useEffect(() => {
    setMems(getAllMemories().slice().reverse());
  }, []);

  const filtered = mems.filter(m => {
    const tags = m.user_tag||m.auto_tag||[];
    if (filter!=="all" && !tags.includes(filter)) return false;
    if (search && !m.content.toLowerCase().includes(search.toLowerCase()) && !tags.join(" ").includes(search.toLowerCase())) return false;
    return true;
  });

  const allTags = [...new Set(mems.flatMap(m=>m.user_tag||m.auto_tag||[]))];

  const saveTagEdit = (m) => {
    const newTags = editTags.split(",").map(t=>t.trim()).filter(Boolean);
    import("./MemoryStore.js").then(ms => {
      ms.updateMemoryTags(m.id, newTags);
      setMems(ms.getAllMemories().slice().reverse());
    });
    setEditId(null);
  };

  if (mems.length===0) return (
    <div className="lib-empty">
      No memories yet.<br/>Rate responses 👍 in chat to save them here.
    </div>
  );

  return (
    <div className="lib-container">
      <div className="lib-toolbar">
        <input className="lib-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..."/>
        <select className="lib-filter" value={filter} onChange={e=>setFilter(e.target.value)}>
          <option value="all">All tags</option>
          {allTags.map(t=><option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="lib-list">
        {filtered.map(m => {
          const tags = m.user_tag||m.auto_tag||[];
          const isEditing = editId===m.id;
          return (
            <div key={m.id} className="lib-item">
              <div className="lib-item-meta">
                <span className="lib-source">{m.source}</span>
                <span className="lib-date">{new Date(m.created_at).toLocaleDateString()}</span>
                <span className={`lib-sent${m.sentiment==="positive"?" pos":m.sentiment==="negative"?" neg":""}`}>
                  {m.sentiment==="positive"?"👍":m.sentiment==="negative"?"👎":""}
                </span>
              </div>
              {isEditing ? (
                <div className="lib-tag-edit">
                  <input className="lib-tag-input" value={editTags} onChange={e=>setEditTags(e.target.value)} placeholder="tag1, tag2, tag3"/>
                  <button className="lib-tag-save" onClick={()=>saveTagEdit(m)}>SAVE</button>
                  <button className="lib-tag-cancel" onClick={()=>setEditId(null)}>✕</button>
                  <button className="lib-tag-reset" onClick={()=>{
                    import("./MemoryStore.js").then(ms=>{ms.resetMemoryTags(m.id);setMems(ms.getAllMemories().slice().reverse());});
                    setEditId(null);
                  }}>RESET TO AI</button>
                </div>
              ) : (
                <div className="lib-tags" onClick={()=>{setEditId(m.id);setEditTags(tags.join(", "));}}>
                  {tags.map(t=><span key={t} className="lib-tag">{t}</span>)}
                  <span className="lib-tag-edit-hint">✎</span>
                </div>
              )}
              <div className="lib-text">{m.content.slice(0,180)}{m.content.length>180?"...":""}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── MAIN SIDEBAR ─────────────────────────────────────────────
export default function LeftSidebar({ goSettings }) {
  const [showBrain, setShowBrain] = useState(false);
  const [showLib,   setShowLib]   = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [notes,     setNotes]     = useState(() => localStorage.getItem("oni_notes")||"");

  const ranking  = getModelRanking();
  const maxCount = ranking[0]?.promptCount || 1;
  const COLORS   = ["#39ff14","#e8ff00","#00f5ff","#ff2d7b","#bf00ff"];

  const saveNotes = v => { setNotes(v); localStorage.setItem("oni_notes",v); };

  return (
    <>
      <div className="sidebar-left">
        {/* CORE */}
        <div className="sidebar-section">
          <div className="sidebar-label">CORE</div>
          {[
            { icon:"🧠", label:"Brain",   action:()=>setShowBrain(true) },
            { icon:"📚", label:"Library", action:()=>setShowLib(true)   },
            { icon:"📝", label:"Notes",   action:()=>setShowNotes(true) },
            { icon:"⚙️", label:"Models",  action:()=>goSettings("connections") },
          ].map(item => (
            <button key={item.label} className="sidebar-item" onClick={item.action}>
              <span className="si-icon">{item.icon}</span>
              <span className="si-label">{item.label}</span>
            </button>
          ))}
        </div>

        {/* MODEL RANKER */}
        <div className="sidebar-section ranker-section">
          <div className="sidebar-label">MODEL USAGE</div>
          {ranking.length===0
            ? <div className="ranker-empty">Start chatting to see rankings.</div>
            : ranking.map((r,i) => {
                const pct = Math.max(4, Math.round((r.promptCount/maxCount)*100));
                const col = COLORS[i%COLORS.length];
                return (
                  <div key={r.model} className="ranker-item">
                    <div className="ranker-top">
                      <span className="ranker-num">#{i+1}</span>
                      <span className="ranker-name" title={r.model}>{r.model.split(":")[0]}</span>
                      <span className="ranker-pts">{r.promptCount}p</span>
                    </div>
                    <div className="ranker-track">
                      <div className="ranker-fill" style={{width:pct+"%",background:col,boxShadow:`0 0 5px ${col}`}}/>
                    </div>
                    <div className="ranker-meta">
                      <span>{r.memoryCount} saved</span>
                      <span>{formatBytes(r.totalBytes)}</span>
                    </div>
                  </div>
                );
              })
          }
        </div>
      </div>

      {showBrain  && <BrainViz onClose={()=>setShowBrain(false)}/>}
      {showLib    && <FloatWindow title="📚 LIBRARY" onClose={()=>setShowLib(false)}><LibraryContent/></FloatWindow>}
      {showNotes  && (
        <FloatWindow title="📝 NOTES" onClose={()=>setShowNotes(false)}>
          <textarea className="notes-textarea" value={notes} onChange={e=>saveNotes(e.target.value)} placeholder="Write anything. Stored locally."/>
        </FloatWindow>
      )}
    </>
  );
}
