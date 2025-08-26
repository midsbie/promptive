import { TimeProvider } from "./time.js";

/**
 * Merge strategy:
 * - Identity: by (title, content) OR by id when both present.
 * - Prefer the record with the newer updated_at.
 * - Preserve higher used_times and latest last_used.
 * - Ensure required fields exist post-merge.
 */
export function mergePrompts(base, incoming) {
  const byKey = new Map();

  function keyOf(p) {
    // If both id and core fields exist, allow id to short-circuit;
    // otherwise fall back to semantic key (title+content).
    return p.id ? `id:${p.id}` : `tc:${p.title}::${p.content}`;
  }

  const upsert = (p) => {
    const k = keyOf(p);
    const prev = byKey.get(k);
    if (!prev) {
      byKey.set(k, { ...normalizePrompt(p) });
      return;
    }
    // Choose newer
    const newer = isNewer(p, prev) ? p : prev;
    // Accumulate usage metadata conservatively
    const used_times = Math.max(prev.used_times || 0, p.used_times || 0);
    const last_used = latestIso(prev.last_used, p.last_used);
    byKey.set(k, { ...normalizePrompt(newer), used_times, last_used });
  };

  base.forEach(upsert);
  incoming.forEach(upsert);

  return Array.from(byKey.values());
}

function isNewer(a, b) {
  const ta = Date.parse(a.updated_at || 0);
  const tb = Date.parse(b.updated_at || 0);
  return ta > tb;
}

function latestIso(a, b) {
  const ta = a ? Date.parse(a) : 0;
  const tb = b ? Date.parse(b) : 0;
  if (ta === 0 && tb === 0) return null;
  return ta >= tb ? a : b;
}

function normalizePrompt(p) {
  const now = TimeProvider.nowIso();
  return {
    id: p.id || "",
    title: p.title || "",
    content: p.content || "",
    tags: Array.isArray(p.tags) ? p.tags : [],
    created_at: p.created_at || now,
    updated_at: p.updated_at || now,
    last_used: p.last_used ?? null,
    used_times: Number.isFinite(p.used_times) ? p.used_times : 0,
  };
}
