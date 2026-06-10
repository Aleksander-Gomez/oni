import { useState, useRef, useEffect } from "react";
import { saveMemory, autoTag, recordModelUsage, queryChromaDB } from "./MemoryStore.js";

const SYSTEM_PROMPT = `You are ONI, a personal AI assistant running locally. Be direct and helpful. When you reference stored context, briefly mention it so the user understands their data is being used.`;

const COUNCIL_ROLES = [
  { id:"researcher", name:"RESEARCHER", icon:"🔬", color:"#e8ff00",
    prompt:(t,h)=>`You are a rigorous researcher. Find and summarize key information about: "${t}"${h.length?`\n\nPrior findings:\n${h.map(r=>`[${r.role}]: ${r.content.slice(0,300)}`).join("\n")}`:""}`},
  { id:"critic",     name:"CRITIC",     icon:"⚔️", color:"#ff2d7b",
    prompt:(t,h)=>`You are a critical analyst. Challenge the research about "${t}" — find gaps, weak claims, missing perspectives:\n${h.map(r=>`[${r.role}]: ${r.content.slice(0,300)}`).join("\n")}`},
  { id:"synthesizer",name:"SYNTHESIZER",icon:"⚡", color:"#00f5ff",
    prompt:(t,h)=>`You are a synthesis expert. Integrate all findings about "${t}" into a clear, actionable summary:\n${h.map(r=>`[${r.role}]: ${r.content.slice(0,300)}`).join("\n")}`},
  { id:"archivist",  name:"ARCHIVIST",  icon:"📜", color:"#39ff14",
    prompt:(t,h)=>`Extract the 5-10 most important facts from this research about "${t}" as a numbered list. Each fact should stand alone:\n${h.map(r=>`[${r.role}]: ${r.content.slice(0,300)}`).join("\n")}`},
];

export default function ChatMain({ connections, assignments, onGoResearch, onSaveToBrain }) {
  const [messages,        setMessages]        = useState([
    { id:"init", role:"ai", text:"ONI initialized. Select a model to begin.\n\nAll processing is local — no data leaves your machine.", model:"", memories:[] }
  ]);
  const [input,           setInput]           = useState("");
  const [streaming,       setStreaming]        = useState(false);
  const [researchMode,    setResearchMode]     = useState(false);
  const [researchTopic,   setResearchTopic]    = useState("");
  const [researchRounds,  setResearchRounds]   = useState(3);
  const [researchRunning, setResearchRunning]  = useState(false);
  const [feedbackPending, setFeedbackPending]  = useState(null);
  const [mouse,           setMouse]            = useState({x:0,y:0});
  const endRef   = useRef(null);
  const abortRef = useRef(null);

  const a    = assignments?.chat || { connectionId:"", model:"" };
  const conn = connections?.find(c => c.id===a.connectionId);

  useEffect(()=>{
    const fn=e=>setMouse({x:e.clientX,y:e.clientY});
    window.addEventListener("mousemove",fn);
    return()=>window.removeEventListener("mousemove",fn);
  },[]);

  useEffect(()=>{ endRef.current?.scrollIntoView({behavior:"smooth"}); },[messages]);

  // ── MEMORY RETRIEVAL ───────────────────────────────────
  const getContext = async (query) => {
    const cc = connections?.find(c=>c.id==="chromadb");
    if (!cc||cc.status!=="connected") return [];
    return queryChromaDB(query, cc.url, 3);
  };

  // ── CALL MODEL (streaming) ─────────────────────────────
  const callModel = async (msgs, onToken) => {
    if (!conn||!a.model) throw new Error("No model configured");
    const endpoint = conn.type==="local"
      ? `${conn.url}/v1/chat/completions`
      : `${conn.url}/chat/completions`;
    const res = await fetch(endpoint, {
      method:"POST",
      signal: abortRef.current?.signal,
      headers:{"Content-Type":"application/json",...(conn.apiKey?{"Authorization":`Bearer ${conn.apiKey}`}:{})},
      body:JSON.stringify({ model:a.model, messages:msgs, stream:true, temperature:0.7 }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const reader=res.body.getReader(), dec=new TextDecoder();
    let full="";
    while(true){
      const {done,value}=await reader.read(); if(done) break;
      for(const line of dec.decode(value).split("\n").filter(l=>l.startsWith("data: "))){
        const d=line.slice(6); if(d==="[DONE]") continue;
        try{ const delta=JSON.parse(d).choices?.[0]?.delta?.content||""; full+=delta; onToken(full); }catch{}
      }
    }
    return full;
  };

  // ── SEND CHAT ──────────────────────────────────────────
  const send = async () => {
    const text=input.trim(); if(!text||streaming) return;
    setInput("");
    const userMsg={ id:`u_${Date.now()}`, role:"user", text };
    setMessages(m=>[...m, userMsg]);
    setStreaming(true);

    if (!a.model||!conn) {
      setMessages(m=>[...m,{id:`e_${Date.now()}`,role:"ai",text:"⚠ No model selected. Use the model picker above.",model:"",memories:[]}]);
      setStreaming(false); return;
    }

    const memCtx = await getContext(text);
    const history = messages.slice(-8).filter(m=>m.role!=="system").map(m=>({
      role:m.role==="user"?"user":"assistant", content:m.text
    }));
    const sys = memCtx.length>0
      ? `${SYSTEM_PROMPT}\n\nRELEVANT STORED CONTEXT:\n${memCtx.map((m,i)=>`[${i+1}] ${m}`).join("\n")}`
      : SYSTEM_PROMPT;

    recordModelUsage(a.model, a.connectionId, "chat");
    abortRef.current = new AbortController();
    const aiId=`ai_${Date.now()}`;
    setMessages(m=>[...m,{id:aiId,role:"ai",text:"",model:a.model,memories:memCtx,streaming:true}]);

    try {
      const full = await callModel(
        [{role:"system",content:sys},...history,{role:"user",content:text}],
        (t)=>setMessages(m=>[...m.slice(0,-1),{id:aiId,role:"ai",text:t,model:a.model,memories:memCtx,streaming:true}])
      );
      setMessages(m=>[...m.slice(0,-1),{id:aiId,role:"ai",text:full,model:a.model,memories:memCtx,streaming:false,canRate:true}]);
    } catch(e){
      if(e.name!=="AbortError")
        setMessages(m=>[...m.slice(0,-1),{id:aiId,role:"ai",text:`✗ ${e.message}`,model:a.model,memories:[]}]);
    }
    setStreaming(false);
  };

  // ── RATING ─────────────────────────────────────────────
  const rate = async (msgId, sentiment) => {
    const msg=messages.find(m=>m.id===msgId); if(!msg) return;
    setMessages(m=>m.map(x=>x.id===msgId?{...x,rated:sentiment,canRate:false}:x));
    const ctx=messages.find((_,i,arr)=>arr[i+1]?.id===msgId);
    const tags=await autoTag(msg.text,conn,a.model);
    await saveMemory({content:msg.text,model:a.model,connectionId:a.connectionId,auto_tag:tags,source:"chat",sentiment,prompt_context:ctx?.text||"",section:"chat"});
    if(sentiment==="negative") setFeedbackPending({msgId,text:msg.text,prompt:ctx?.text||""});
  };

  // ── RESEARCH ───────────────────────────────────────────
  const runResearch = async () => {
    const topic=researchTopic.trim(); if(!topic||!a.model) return;
    setResearchRunning(true); setResearchMode(false);

    // Add topic message to chat
    setMessages(m=>[...m,{id:`u_r_${Date.now()}`,role:"user",text:`Research: ${topic} (${researchRounds} rounds)`}]);

    const rA=assignments?.research||a;
    const rConn=connections?.find(c=>c.id===rA.connectionId)||conn;
    const rModel=rA.model||a.model;

    const roles=COUNCIL_ROLES.slice(0,Math.min(researchRounds,3));
    const finalRoles=[...roles.filter(r=>r.id!=="archivist"),COUNCIL_ROLES[3]];
    const history=[];

    for(const role of finalRoles){
      const rid=`r_${role.id}_${Date.now()}`;
      setMessages(m=>[...m,{id:rid,role:"ai",text:"",model:rModel,memories:[],streaming:true,roleLabel:`${role.icon} ${role.name}`,roleColor:role.color}]);
      abortRef.current=new AbortController();
      try{
        const prompt=role.prompt(topic,history);
        const endpoint=rConn.type==="local"?`${rConn.url}/v1/chat/completions`:`${rConn.url}/chat/completions`;
        const res=await fetch(endpoint,{method:"POST",signal:abortRef.current.signal,headers:{"Content-Type":"application/json",...(rConn.apiKey?{"Authorization":`Bearer ${rConn.apiKey}`}:{})},body:JSON.stringify({model:rModel,messages:[{role:"user",content:prompt}],stream:true,temperature:0.8})});
        if(!res.ok) throw new Error(`HTTP ${res.status}`);
        const reader=res.body.getReader(),dec=new TextDecoder();
        let full="";
        while(true){
          const{done,value}=await reader.read(); if(done) break;
          for(const line of dec.decode(value).split("\n").filter(l=>l.startsWith("data: "))){
            const d=line.slice(6); if(d==="[DONE]") continue;
            try{const delta=JSON.parse(d).choices?.[0]?.delta?.content||"";full+=delta;setMessages(m=>[...m.slice(0,-1),{id:rid,role:"ai",text:full,model:rModel,memories:[],streaming:true,roleLabel:`${role.icon} ${role.name}`,roleColor:role.color}]);}catch{}
          }
        }
        history.push({role:role.name,content:full});
        setMessages(m=>[...m.slice(0,-1),{id:rid,role:"ai",text:full,model:rModel,memories:[],streaming:false,roleLabel:`${role.icon} ${role.name}`,roleColor:role.color,canRate:true}]);
        // auto save archivist to brain
        if(role.id==="archivist"&&onSaveToBrain) await onSaveToBrain(full,"research",topic);
      }catch(e){
        if(e.name!=="AbortError") setMessages(m=>[...m.slice(0,-1),{id:rid,role:"ai",text:`✗ ${e.message}`,model:rModel,memories:[]}]);
        break;
      }
    }
    setResearchRunning(false);
    setResearchTopic("");
  };

  const modelLabel = a.model
    ? `${connections?.find(c=>c.id===a.connectionId)?.icon||"🤖"} ${a.model}`
    : null;

  return (
    <div className="chat-main">
      {/* Floating head */}
      <div className="floating-head" style={{transform:`translate(calc(-50% + ${mouse.x*.01}px),calc(-50% + ${mouse.y*.01}px))`}}>
        ( O N I )
      </div>

      {/* Messages */}
      <div className="messages-area">
        {messages.map(m=>(
          <div key={m.id} className={`msg msg-${m.role}`}>
            <div className="msg-header">
              {m.roleLabel
                ? <span className="msg-role-label" style={{color:m.roleColor}}>{m.roleLabel}</span>
                : <span className="msg-sender">{m.role==="ai"?`ONI${m.model?` // ${m.model.split(":")[0]}`:""}` :"YOU"}</span>
              }
              {m.memories?.length>0 && (
                <span className="msg-mem-badge" title="Used stored memories as context">
                  🧠 {m.memories.length}
                </span>
              )}
            </div>
            <div className="msg-text">
              {m.text}{m.streaming&&<span className="blink">▌</span>}
            </div>
            {m.canRate&&!m.rated&&(
              <div className="msg-rating">
                <button className="btn-rate pos" onClick={()=>rate(m.id,"positive")} title="Good — save to Brain">👍</button>
                <button className="btn-rate neg" onClick={()=>rate(m.id,"negative")} title="Poor — suggest research">👎</button>
                <span className="rating-hint">rate to save to brain</span>
              </div>
            )}
            {m.rated&&(
              <div className="msg-rated">
                {m.rated==="positive"?"✓ saved to brain":"✗ flagged"}
              </div>
            )}
          </div>
        ))}
        <div ref={endRef}/>
      </div>

      {/* 👎 research suggestion */}
      {feedbackPending&&(
        <div className="feedback-popup">
          <div className="fp-text">That response wasn't great. Research this topic to improve future answers?</div>
          <div className="fp-actions">
            <button className="fp-yes" onClick={()=>{
              setResearchTopic(feedbackPending.prompt||feedbackPending.text.slice(0,80));
              setResearchMode(true);
              setFeedbackPending(null);
            }}>🔬 OPEN RESEARCH</button>
            <button className="fp-no" onClick={()=>setFeedbackPending(null)}>DISMISS</button>
          </div>
        </div>
      )}

      {/* Research mode panel */}
      {researchMode&&(
        <div className="research-bar">
          <div className="research-bar-header">
            <span className="research-bar-title">🔬 RESEARCH MODE</span>
            <button className="research-bar-close" onClick={()=>setResearchMode(false)}>✕</button>
          </div>
          <div className="research-bar-body">
            <input className="research-topic-input"
              value={researchTopic}
              onChange={e=>setResearchTopic(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter")runResearch();}}
              placeholder="Topic to research..."
              autoFocus/>
            <div className="research-bar-controls">
              <label className="research-rounds-label">ROUNDS</label>
              <input type="number" className="research-rounds-input"
                value={researchRounds} min={1} max={6}
                onChange={e=>setResearchRounds(Math.max(1,Math.min(6,parseInt(e.target.value)||1)))}/>
              <button className="btn-research-run"
                onClick={runResearch}
                disabled={!researchTopic.trim()||!a.model||researchRunning}>
                ▶ RUN
              </button>
            </div>
            <div className="research-bar-hint">
              Each round: Researcher → Critic → Synthesizer → Archivist (auto-saved to Brain)
            </div>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="chat-input-area">
        {!modelLabel&&(
          <div className="no-model-hint">⚙ Open Settings → Ollama to connect a local model</div>
        )}
        <div className="input-row">
          <button className="btn-attach" title="Attach file">📎</button>
          <textarea
            className="chat-input"
            value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
            placeholder={modelLabel?"Message ONI...":"Connect a model first..."}
            disabled={streaming||!a.model||researchRunning}
          />
          <div className="input-right-btns">
            <button
              className={`btn-research-toggle${researchMode?" active":""}`}
              onClick={()=>setResearchMode(m=>!m)}
              title="Research mode">
              🔬
            </button>
            {streaming||researchRunning
              ? <button className="btn-stop" onClick={()=>abortRef.current?.abort()}>■</button>
              : <button className="btn-send" onClick={send} disabled={!input.trim()||!a.model}>▶</button>
            }
          </div>
        </div>
        {modelLabel&&(
          <div className="model-status">
            <span className={`model-status-dot${conn?.type==="local"?" local":""}`}/>
            {conn?.type==="local"&&<span className="local-label">LOCAL</span>}
            <span className="model-status-name">{modelLabel}</span>
          </div>
        )}
      </div>
    </div>
  );
}
