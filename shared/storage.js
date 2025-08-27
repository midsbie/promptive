import { IdGenerator } from "./id.js";
import { Logger } from "./logging.js";
import { mergePrompts } from "./merge.js";
import { defaultSeed } from "./seed.js";
import { TimeProvider } from "./time.js";

const logger = new Logger("storage");

/**
 * Unified minimal interface over WebExtensions storage areas.
 * Adapters expose get/set/remove for namespaced keys.
 */
class BaseStorageAdapter {
  constructor(area, namespace = "") {
    this.area = area;
    this.namespace = namespace;
    this.api = browser?.storage?.[area];
    if (!this.api) {
      throw new Error(`browser.storage.${area} not available`);
    }
  }

  _ns(key) {
    return this.namespace ? `${this.namespace}:${key}` : key;
  }

  async get(key) {
    const keys = Array.isArray(key) ? key.map((k) => this._ns(k)) : this._ns(key);
    const out = await this.api.get(keys);
    // Strip namespace on return
    if (Array.isArray(key)) {
      return key.reduce((acc, k) => {
        acc[k] = out[this._ns(k)];
        return acc;
      }, {});
    }
    return { [key]: out[this._ns(key)] };
  }

  async set(obj) {
    const payload = {};
    for (const [k, v] of Object.entries(obj)) payload[this._ns(k)] = v;
    return this.api.set(payload);
  }

  async remove(key) {
    const keys = Array.isArray(key) ? key.map((k) => this._ns(k)) : [this._ns(key)];
    return this.api.remove(keys);
  }
}

export class LocalStorageAdapter extends BaseStorageAdapter {
  constructor(namespace = "") {
    super("local", namespace);
  }
}
export class SyncStorageAdapter extends BaseStorageAdapter {
  constructor(namespace = "") {
    super("sync", namespace);
  }
}

export async function isSyncAvailable() {
  try {
    if (!browser?.storage?.sync) return false;
    // Quota touch (no-op write/read to validate permissions)
    const pingKey = "__ping__";
    await browser.storage.sync.set({ [pingKey]: 1 });
    await browser.storage.sync.remove(pingKey);
    return true;
  } catch (e) {
    logger.warn("Sync storage not available:", e?.message ?? e);
    return false;
  }
}

class PromptRepositoryLoader {
  constructor(backends) {
    this.backends = backends;
  }

  async load() {
    const dataset = [];
    for (const backend of this.backends) {
      try {
        const state = await this._readFromBackend(backend);
        if (state != null) dataset.push(state);
      } catch (e) {
        logger.warn(`Read failed from ${backend.area}:`, e?.message ?? e);
        return null;
      }
    }

    if (dataset.length < 1) return null;

    const state = dataset.reduce((p, c) => (c.updatedAt > p.updatedAt ? c : p), dataset[0]);
    logger.info(`Loaded ${state.prompts.length} prompts from ${state.backend.area} backend`);
    return state.prompts;
  }

  async _readFromBackend(backend) {
    const state = await backend.get([
      PromptRepository.STORAGE_KEY,
      PromptRepository.VERSION_KEY,
      PromptRepository.UPDATED_AT_KEY,
    ]);
    const {
      [PromptRepository.STORAGE_KEY]: prompts,
      [PromptRepository.VERSION_KEY]: version,
      [PromptRepository.UPDATED_AT_KEY]: updatedAt,
    } = state;
    if (typeof version !== "number") {
      logger.warn(`Missing or invalid VERSION_KEY in ${backend.area}; skipping backend`);
      return null;
    } else if (version !== PromptRepository.VERSION) {
      logger.warn(
        `Unsupported version in ${backend.area} (${version}); expected ${PromptRepository.VERSION}`
      );
      return null;
    }

    if (typeof updatedAt !== "string" || !updatedAt) {
      logger.warn(`Missing or invalid UPDATED_AT_KEY in ${backend.area}; skipping backend`);
      return null;
    }

    if (!Array.isArray(prompts) || prompts.length < 1) {
      logger.info(`Invalid or no prompts found in ${backend.area}; skipping`);
      return null;
    }

    const ts = Date.parse(updatedAt);
    if (!Number.isFinite(ts) || ts <= 0) {
      logger.warn(
        `Invalid ${PromptRepository.UPDATED_AT_KEY} key in ${backend.area}: ${updatedAt}; skipping`
      );
      return null;
    }

    return { backend, prompts, version, updatedAt: ts };
  }
}

/**
 * Repository is the business logic façade used by the rest of the extension.
 * It hides cross-store merge, seeding, and conflict resolution.
 */
export class PromptRepository {
  static NAMESPACE = "promptive";
  static STORAGE_KEY = "prompts";
  static VERSION_KEY = "version";
  static UPDATED_AT_KEY = "updated_at";
  static VERSION = 1;

  constructor() {
    this.backends = [];
    this.primary = new LocalStorageAdapter(PromptRepository.NAMESPACE); // always available in extensions
    this.sync = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) {
      logger.warn("PromptRepository already initialized");
      return;
    }

    this.backends = [this.primary];

    // Detect and append sync as a writer if available
    if (await isSyncAvailable()) {
      const sync = new SyncStorageAdapter(PromptRepository.NAMESPACE);
      this.backends.push(sync);
      this.sync = sync; // compat
      logger.info("Sync storage available; enabling cloud backup.");
    } else {
      logger.warn("Sync storage unavailable; falling back to local-only.");
    }

    const loader = new PromptRepositoryLoader(this.backends);
    let prompts = await loader.load();
    if (prompts == null || prompts.length < 1) {
      prompts = defaultSeed(); // fresh install
    }

    await this._persistPrompts(prompts);
    this.initialized = true;
  }

  async getAllPrompts() {
    try {
      const { [PromptRepository.STORAGE_KEY]: prompts = [] } = await this.primary.get(
        PromptRepository.STORAGE_KEY
      );
      return Array.isArray(prompts) ? prompts : [];
    } catch (e) {
      logger.warn("Primary read failed; returning empty list:", e?.message ?? e);
      return [];
    }
  }

  async getPrompt(id) {
    const prompts = await this.getAllPrompts();
    return prompts.find((p) => p.id === id);
  }

  /**
   * Creates or updates a prompt; updates timestamps, keeps usage meta.
   */
  async savePrompt(prompt) {
    const prompts = await this.getAllPrompts();
    const now = TimeProvider.nowIso();

    if (prompt.id) {
      const idx = prompts.findIndex((p) => p.id === prompt.id);
      if (idx >= 0) {
        const preserve = prompts[idx];
        prompts[idx] = {
          ...preserve,
          ...prompt,
          updated_at: now,
          // Preserve usage counters unless explicitly provided
          used_times: Number.isFinite(prompt.used_times) ? prompt.used_times : preserve.used_times,
          last_used: prompt.last_used !== undefined ? prompt.last_used : preserve.last_used,
        };
      } else {
        // Unknown id -> treat as create
        prompts.push({
          id: prompt.id,
          title: prompt.title || "",
          content: prompt.content || "",
          tags: Array.isArray(prompt.tags) ? prompt.tags : [],
          created_at: now,
          updated_at: now,
          last_used: null,
          used_times: 0,
        });
      }
    } else {
      prompts.push({
        id: IdGenerator.newId(),
        title: prompt.title || "",
        content: prompt.content || "",
        tags: Array.isArray(prompt.tags) ? prompt.tags : [],
        created_at: now,
        updated_at: now,
        last_used: null,
        used_times: 0,
      });
    }

    await this._persistPrompts(prompts);
    return prompts;
  }

  async deletePrompt(id) {
    const prompts = await this.getAllPrompts();
    const filtered = prompts.filter((p) => p.id !== id);
    await this._persistPrompts(filtered);
    return filtered;
  }

  async recordUsage(id) {
    const prompts = await this.getAllPrompts();
    const p = prompts.find((x) => x.id === id);
    if (!p) {
      logger.error(`recordUsage: unknown prompt id ${id}`);
      return;
    }

    p.last_used = TimeProvider.nowIso();
    p.used_times = (p.used_times || 0) + 1;
    await this._persistPrompts(prompts);
  }

  async importPrompts(importData) {
    if (!importData?.version || !Array.isArray(importData.prompts)) {
      throw new Error("Invalid import format");
    }

    const current = await this.getAllPrompts();

    // Merge by id/title+content; newer updated_at wins; keep usage max.
    const merged = mergePrompts(current, importData.prompts).map((p) => {
      // Ensure we always have an id (generate if absent in import)
      if (!p.id || p.id.trim() === "") {
        return { ...p, id: IdGenerator.newId() };
      }
      return p;
    });

    await this._persistPrompts(merged);
    return merged;
  }

  async exportPrompts() {
    const prompts = await this.getAllPrompts();
    return {
      version: 1,
      exported_at: TimeProvider.nowIso(),
      prompts,
    };
  }

  // --- internals ---
  async _persistPrompts(prompts) {
    if (!Array.isArray(prompts)) {
      logger.error("_persistPrompts expects array");
      return;
    }

    await this._writeToBackends({
      [PromptRepository.VERSION_KEY]: PromptRepository.VERSION,
      [PromptRepository.STORAGE_KEY]: prompts,
      [PromptRepository.UPDATED_AT_KEY]: TimeProvider.nowIso(),
    });
  }

  async _writeToBackends(obj) {
    for (const b of this.backends) {
      try {
        await b.set(obj);
      } catch (e) {
        // Non-fatal: keep going so other backends are updated
        logger.warn(`Write failed to ${b.area} backend; continuing:`, e?.message ?? e);
      }
    }
  }
}
