/**
 * ONI // MEMORY STORE
 * 
 * All memory read/write logic. No UI. Pure data layer.
 * 
 * A memory entry:
 * {
 *   id: string (timestamp-based)
 *   content: string
 *   model: string (which model generated it)
 *   connectionId: string
 *   auto_tag: string[] (AI-generated, always preserved)
 *   user_tag: string[] | null (user override)
 *   source: "chat"|"research"|"upload"|"notes"|"manual"
 *   sentiment: "positive"|"negative"|"neutral"
 *   prompt_context: string (what question triggered it)
 *   topic: string (short title)
 *   size_bytes: number
 *   created_at: string (ISO)
 *   section: string (which tool section it came from)
 * }
 */

const STORAGE_KEY    = "oni_memories";
const USAGE_KEY      = "oni_model_usage";
const SETTINGS_KEY   = "oni_connections";
const ASSIGN_KEY     = "oni_assignments";

// ── READ ────────────────────────────────────────────────────
export function getAllMemories() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

export function getMemoriesByTag(tag) {
  return getAllMemories().filter(m => getActiveTag(m).includes(tag));
}

export function getMemoriesByModel(modelName) {
  return getAllMemories().filter(m => m.model === modelName);
}

export function getMemoriesBySection(section) {
  return getAllMemories().filter(m => m.section === section);
}

export function searchMemories(query) {
  const q = query.toLowerCase();
  return getAllMemories().filter(m =>
    m.content.toLowerCase().includes(q) ||
    m.topic?.toLowerCase().includes(q) ||
    getActiveTag(m).some(t => t.toLowerCase().includes(q))
  );
}

// Returns the tag actually used (user_tag if set, else auto_tag)
export function getActiveTag(memory) {
  return memory.user_tag || memory.auto_tag || [];
}

// Get all unique tags across all memories
export function getAllTags() {
  const all = getAllMemories().flatMap(m => getActiveTag(m));
  return [...new Set(all)].sort();
}

// ── WRITE ───────────────────────────────────────────────────
export function saveMemory(entry) {
  const memories = getAllMemories();
  const full = {
    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
    content: entry.content || "",
    model: entry.model || "unknown",
    connectionId: entry.connectionId || "",
    auto_tag: entry.auto_tag || [],
    user_tag: null, // always starts null — user can override
    source: entry.source || "chat",
    sentiment: entry.sentiment || "neutral",
    prompt_context: entry.prompt_context || "",
    topic: entry.topic || entry.content.slice(0,60),
    size_bytes: new Blob([entry.content]).size,
    created_at: new Date().toISOString(),
    section: entry.section || "chat",
  };
  memories.push(full);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(memories));
  return full;
}

export function updateMemoryTags(id, userTags) {
  const memories = getAllMemories();
  const idx = memories.findIndex(m => m.id === id);
  if (idx === -1) return;
  memories[idx].user_tag = userTags;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(memories));
  return memories[idx];
}

export function resetMemoryTags(id) {
  return updateMemoryTags(id, null); // null = use auto_tag
}

export function deleteMemory(id) {
  const memories = getAllMemories().filter(m => m.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(memories));
}

export function clearAllMemories() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
}

// ── MODEL USAGE TRACKING ────────────────────────────────────
export function recordModelUsage(modelName, connectionId, sectionId) {
  const usage = getModelUsage();
  const key = modelName;
  if (!usage[key]) {
    usage[key] = {
      model: modelName,
      connectionId,
      promptCount: 0,
      totalTokensEstimate: 0,
      sections: {},
      firstUsed: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
    };
  }
  usage[key].promptCount++;
  usage[key].lastUsed = new Date().toISOString();
  usage[key].sections[sectionId] = (usage[key].sections[sectionId] || 0) + 1;
  localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
}

export function getModelUsage() {
  try { return JSON.parse(localStorage.getItem(USAGE_KEY)) || {}; }
  catch { return {}; }
}

export function getModelRanking() {
  const usage  = getModelUsage();
  const memories = getAllMemories();

  return Object.values(usage)
    .map(u => {
      const mems = memories.filter(m => m.model === u.model);
      const totalBytes = mems.reduce((sum, m) => sum + (m.size_bytes || 0), 0);
      return { ...u, memoryCount: mems.length, totalBytes };
    })
    .sort((a, b) => b.promptCount - a.promptCount);
}

// ── AUTO-TAGGING ────────────────────────────────────────────
export async function autoTag(content, conn, modelName) {
  if (!conn || !modelName) return ["general"];
  try {
    const endpoint = conn.type === "local"
      ? `${conn.url}/v1/chat/completions`
      : `${conn.url}/chat/completions`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(conn.apiKey ? { "Authorization": `Bearer ${conn.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: modelName,
        messages: [{
          role: "user",
          content: `Suggest 1-3 short category tags for this text. Tags should be single words or short 2-word phrases. Respond with ONLY a JSON array, nothing else. Example: ["coding","react","hooks"]\n\nText: ${content.slice(0, 500)}`
        }],
        stream: false,
        temperature: 0.3,
        max_tokens: 60,
      }),
    });
    if (!res.ok) return ["general"];
    const data = await res.json();
    const raw  = data.choices?.[0]?.message?.content || "[]";
    const match = raw.match(/\[[\s\S]*?\]/);
    if (!match) return ["general"];
    const tags = JSON.parse(match[0]);
    return Array.isArray(tags) ? tags.slice(0, 3).map(t => String(t).toLowerCase().trim()) : ["general"];
  } catch(e) {
    return ["general"];
  }
}

// ── GRAPH DATA FOR 3D VIZ ───────────────────────────────────
export function getGraphData() {
  const memories = getAllMemories();
  const usage    = getModelUsage();

  // Build nodes
  const nodes = [];
  const edges = [];

  // Model nodes
  const models = [...new Set(memories.map(m => m.model).filter(Boolean))];
  models.forEach((modelName, i) => {
    const mems = memories.filter(m => m.model === modelName);
    const u    = usage[modelName] || {};
    nodes.push({
      id: `model_${modelName}`,
      type: "model",
      label: modelName.split(":")[0],
      fullLabel: modelName,
      count: mems.length,
      promptCount: u.promptCount || 0,
      size: Math.max(0.8, Math.min(2.5, 0.5 + mems.length * 0.05)),
      color: MODEL_COLORS[i % MODEL_COLORS.length],
    });
  });

  // Tag nodes + edges model→tag
  const tagMap = {};
  memories.forEach(mem => {
    const tags = getActiveTag(mem);
    tags.forEach(tag => {
      if (!tagMap[tag]) tagMap[tag] = { models: new Set(), count: 0 };
      tagMap[tag].count++;
      if (mem.model) tagMap[tag].models.add(mem.model);
    });
  });

  Object.entries(tagMap).forEach(([tag, data]) => {
    nodes.push({
      id: `tag_${tag}`,
      type: "tag",
      label: tag,
      count: data.count,
      size: Math.max(0.3, Math.min(1.2, 0.2 + data.count * 0.08)),
      color: "#00f5ff",
    });

    // edges from each model to this tag
    data.models.forEach(modelName => {
      const tagMems = memories.filter(m => m.model === modelName && getActiveTag(m).includes(tag));
      edges.push({
        id: `${modelName}_${tag}`,
        source: `model_${modelName}`,
        target: `tag_${tag}`,
        weight: tagMems.length,
      });
    });
  });

  // Tag→tag edges where memories share multiple tags
  const tagList = Object.keys(tagMap);
  for (let i = 0; i < tagList.length; i++) {
    for (let j = i + 1; j < tagList.length; j++) {
      const shared = memories.filter(m => {
        const mt = getActiveTag(m);
        return mt.includes(tagList[i]) && mt.includes(tagList[j]);
      }).length;
      if (shared > 0) {
        edges.push({
          id: `tag_${tagList[i]}_${tagList[j]}`,
          source: `tag_${tagList[i]}`,
          target: `tag_${tagList[j]}`,
          weight: shared,
          type: "tag-tag",
        });
      }
    }
  }

  return { nodes, edges };
}

const MODEL_COLORS = [
  "#39ff14", "#e8ff00", "#ff2d7b", "#00f5ff",
  "#bf00ff", "#7fff00", "#ff8c00", "#ff69b4",
];

// ── CHROMADB SYNC ───────────────────────────────────────────
export async function pushToChromaDB(memory, chromaUrl = "http://localhost:8000") {
  try {
    // Ensure collection exists
    await fetch(`${chromaUrl}/api/v1/collections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "oni_memories", metadata: { description: "ONI context memory" } }),
    }).catch(() => {}); // ignore if already exists

    // Add document
    const res = await fetch(`${chromaUrl}/api/v1/collections/oni_memories/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documents: [memory.content],
        ids: [memory.id],
        metadatas: [{
          model: memory.model,
          source: memory.source,
          section: memory.section,
          tags: getActiveTag(memory).join(","),
          sentiment: memory.sentiment,
          created_at: memory.created_at,
          topic: memory.topic,
        }],
      }),
    });
    return res.ok;
  } catch(e) {
    return false;
  }
}

export async function queryChromaDB(query, chromaUrl = "http://localhost:8000", nResults = 5) {
  try {
    const res = await fetch(`${chromaUrl}/api/v1/collections/oni_memories/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query_texts: [query], n_results: nResults }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.documents?.[0] || [];
  } catch(e) {
    return [];
  }
}

// Format bytes to human readable
export function formatBytes(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
