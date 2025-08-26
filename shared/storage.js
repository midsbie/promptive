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
  /**
   * @param {'local'|'sync'} area
   * @param {string} namespace
   */
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

  /** @param {string|string[]} key */
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

  /** @param {Record<string, any>} obj */
  async set(obj) {
    const payload = {};
    for (const [k, v] of Object.entries(obj)) payload[this._ns(k)] = v;
    return this.api.set(payload);
  }

  /** @param {string|string[]} key */
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

/** Feature-detect sync availability at runtime */
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

/**
 * Repository is the business logic façade used by the rest of the extension.
 * It hides cross-store merge, seeding, and conflict resolution.
 */
export class PromptRepository {
  constructor() {
    this.STORAGE_KEY = "prompts";
    this.VERSION_KEY = "storage_version";
    this.NAMESPACE = "promptlib";
    this.local = new LocalStorageAdapter(this.NAMESPACE);
    /** @type {SyncStorageAdapter|null} */
    this.sync = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) {
      logger.warn("PromptRepository already initialized");
      return;
    }

    // Detect sync
    if (await isSyncAvailable()) {
      this.sync = new SyncStorageAdapter(this.NAMESPACE);
      logger.info("Sync storage available; enabling cloud backup.");
    } else {
      logger.warn("Sync storage unavailable; falling back to local-only.");
    }

    const localData = (await this.local.get(this.STORAGE_KEY))[this.STORAGE_KEY] || [];
    const syncData = this.sync
      ? (await this.sync.get(this.STORAGE_KEY))[this.STORAGE_KEY] || []
      : [];

    let resolved = [];
    if (localData.length === 0 && syncData.length === 0) {
      // Fresh install or post-uninstall re-install with no sync data
      resolved = defaultSeed();
      await this._writeAll(resolved);
    } else if (localData.length === 0 && syncData.length > 0) {
      // Recovered from cloud
      resolved = syncData;
      await this.local.set({ [this.STORAGE_KEY]: resolved });
    } else if (localData.length > 0 && syncData.length === 0) {
      // Local only (no sync or first time enabling sync)
      resolved = localData;
      await this._writeSyncIfAvailable(resolved);
    } else {
      // Both exist -> merge
      resolved = mergePrompts(localData, syncData);
      await this._writeAll(resolved);
    }

    // Version stamp (simple numeric; bump when schema changes)
    await this.local.set({ [this.VERSION_KEY]: 1 });
    await this._writeSyncIfAvailable({ [this.VERSION_KEY]: 1 });

    this.initialized = true;
  }

  /** @returns {Promise<import('./types.js').Prompt[]>} */
  async getAllPrompts() {
    const { [this.STORAGE_KEY]: prompts = [] } = await this.local.get(this.STORAGE_KEY);
    return prompts;
  }

  /** @param {string} id */
  async getPrompt(id) {
    const prompts = await this.getAllPrompts();
    return prompts.find((p) => p.id === id);
  }

  /**
   * Creates or updates a prompt; updates timestamps, keeps usage meta.
   * @param {Partial<import('./types.js').Prompt>} prompt
   * @returns {Promise<import('./types.js').Prompt[]>}
   */
  async savePrompt(prompt) {
    const prompts = await this.getAllPrompts();
    const now = TimeProvider.nowIso();

    if (prompt.id) {
      const idx = prompts.findIndex((p) => p.id === prompt.id);
      if (idx !== -1) {
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

    await this._writeAll(prompts);
    return prompts;
  }

  /** @param {string} id */
  async deletePrompt(id) {
    const prompts = await this.getAllPrompts();
    const filtered = prompts.filter((p) => p.id !== id);
    await this._writeAll(filtered);
    return filtered;
  }

  /** @param {string} id */
  async recordUsage(id) {
    const prompts = await this.getAllPrompts();
    const p = prompts.find((x) => x.id === id);
    if (p) {
      p.last_used = TimeProvider.nowIso();
      p.used_times = (p.used_times || 0) + 1;
      await this._writeAll(prompts);
    }
  }

  /**
   * @param {{version:number, prompts: import('./types.js').Prompt[]}} importData
   * @returns {Promise<import('./types.js').Prompt[]>}
   */
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

    await this._writeAll(merged);
    return merged;
  }

  /** @returns {Promise<import('./types.js').ExportBundle>} */
  async exportPrompts() {
    const prompts = await this.getAllPrompts();
    return {
      version: 1,
      exported_at: TimeProvider.nowIso(),
      prompts,
    };
  }

  // --- internals ---

  /** @param {any} promptsOrObject */
  async _writeAll(promptsOrObject) {
    if (Array.isArray(promptsOrObject)) {
      await this.local.set({ [this.STORAGE_KEY]: promptsOrObject });
      await this._writeSyncIfAvailable({ [this.STORAGE_KEY]: promptsOrObject });
    } else {
      await this.local.set(promptsOrObject);
      await this._writeSyncIfAvailable(promptsOrObject);
    }
  }

  /** @param {any} obj */
  async _writeSyncIfAvailable(obj) {
    if (!this.sync) return;
    try {
      await this.sync.set(obj);
    } catch (e) {
      // Non-fatal: keep local as source of truth when sync fails (quota/offline)
      logger.warn("Sync write failed, continuing with local-only:", e?.message ?? e);
    }
  }
}
