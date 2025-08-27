/** ----------------------- Messaging ----------------------- */
// Duplicate of ../lib/messaging.js
const MSG = {
  GET_PROMPTS: "PROMPTIVE/GET_PROMPTS",
  RECORD_PROMPT_USAGE: "PROMPTIVE/RECORD_PROMPT_USAGE",
  QUERY_STATUS: "PROMPTIVE/QUERY_STATUS",
  OPEN_POPOVER: "PROMPTIVE/OPEN_POPOVER",
  INSERT_PROMPT: "PROMPTIVE/INSERT_PROMPT",
};

function isMessage(msg) {
  return typeof msg === "object" && msg !== null && typeof msg.type === "string";
}

function createMessage(type, payload = {}) {
  return { type, ...payload };
}

/** ----------------------- Logging ----------------------- */
// Duplicate of ../lib/logging.js
class Logger {
  constructor(namespace) {
    this.namespace = namespace;
  }

  debug(...args) {
    this._log('debug', ...args);
  }

  log(...args) {
    this._log('log', ...args);
  }

  info(...args) {
    this._log('info', ...args);
  }

  warn(...args) {
    this._log('warn', ...args);
  }

  error(...args) {
    this._log('error', ...args);
  }

  _log(fn, ...args) {
    // eslint-disable-next-line no-console
    console[fn](`[${this.namespace}]`, ...args);
  }
}

const logger = new Logger("content-script");

/** ----------------------- Utilities ----------------------- */

class ToastService {
  static show(message, { durationMs = 3000 } = {}) {
    const toast = document.createElement("div");
    toast.className = "promptive-toast";
    toast.textContent = message;
    toast.setAttribute("role", "alert");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);

    // trigger transition
    requestAnimationFrame(() => toast.classList.add("show"));

    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, durationMs);
  }
}

class CursorPositionManager {
  static getPosition(el) {
    if (!el) return null;

    try {
      // Handle INPUT/TEXTAREA elements
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        return {
          type: "input",
          start: el.selectionStart ?? 0,
          end: el.selectionEnd ?? 0,
        };
      }

      // Handle contentEditable elements
      if (el.isContentEditable || el.getAttribute?.("contenteditable")) {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
          return { type: "contenteditable", range: null };
        }

        const range = selection.getRangeAt(0);
        // Store range as serializable data
        return {
          type: "contenteditable",
          range: {
            startContainer: range.startContainer,
            startOffset: range.startOffset,
            endContainer: range.endContainer,
            endOffset: range.endOffset,
            collapsed: range.collapsed,
          },
        };
      }
    } catch (e) {
      logger.warn("Failed to get cursor position", e);
    }

    return null;
  }

  static setPosition(el, position) {
    if (!el || !position) return;

    try {
      if (position.type === "input") {
        // Restore INPUT/TEXTAREA selection
        if (typeof position.start === "number" && typeof position.end === "number") {
          el.selectionStart = position.start;
          el.selectionEnd = position.end;
        }
      } else if (position.type === "contenteditable" && position.range) {
        // Restore contentEditable selection
        const { startContainer, startOffset, endContainer, endOffset } = position.range;

        // Verify containers are still connected to DOM
        if (!startContainer?.isConnected || !endContainer?.isConnected) {
          return;
        }

        const selection = window.getSelection();
        const range = document.createRange();

        range.setStart(
          startContainer,
          Math.min(startOffset, startContainer.textContent?.length ?? 0)
        );
        range.setEnd(endContainer, Math.min(endOffset, endContainer.textContent?.length ?? 0));

        selection.removeAllRanges();
        selection.addRange(range);
      }
    } catch (e) {
      logger.warn("Failed to set cursor position", e);
    }
  }
}

const escapeHtml = (text = "") => {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
};

const toParagraphHtml = (text) => {
  // Convert plaintext with newlines into <p> blocks, preserving empty lines
  return text
    .split("\n")
    .map((line) => (line.trim() === "" ? "<p><br></p>" : `<p>${escapeHtml(line)}</p>`))
    .join("");
};

/** ----------------------- Messaging ----------------------- */

class BackgroundAPI {
  async getPrompts() {
    return browser.runtime.sendMessage(createMessage(MSG.GET_PROMPTS));
  }

  async recordUsage(promptId) {
    return browser.runtime.sendMessage(createMessage(MSG.RECORD_PROMPT_USAGE, { promptId }));
  }
}

/** ----------------------- Insertion Strategies ----------------------- */

class InsertionStrategy {
  canHandle(_element) {
    return false;
  }

  insert(_element, _text) {
    return false;
  }
}

class InputTextareaStrategy extends InsertionStrategy {
  canHandle(el) {
    return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
  }

  insert(el, text) {
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const value = el.value ?? "";
    el.value = value.slice(0, start) + text + value.slice(end);
    const caret = start + text.length;
    el.selectionStart = el.selectionEnd = caret;
    el.focus();

    // Notify reactive frameworks
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
}

class ContentEditableStrategy extends InsertionStrategy {
  canHandle(el) {
    return (
      !!el &&
      (el.isContentEditable ||
        el.getAttribute?.("contenteditable") === "true" ||
        el.getAttribute?.("contenteditable") === "plaintext-only")
    );
  }

  insert(el, text) {
    if (!el) return false;

    if (document.activeElement !== el) {
      logger.warn("Target element is not focused; insertion may be out of place");
      el.focus();
    }

    // plaintext-only hosts MUST ignore HTML
    const isPlainTextOnly = el.getAttribute?.("contenteditable") === "plaintext-only";
    if (isPlainTextOnly) {
      logger.log('Target is contenteditable="plaintext-only"; inserting as plain text');
      return this._insertPlainText(el, text);
    }

    const html = toParagraphHtml(text);
    // First choice: insertHTML command
    if (document.queryCommandSupported?.("insertHTML")) {
      logger.log("Using execCommand('insertHTML') for insertion");
      try {
        document.execCommand("insertHTML", false, html);
        this._dispatchInput(el, "insertFromPaste"); // notify reactive frameworks/editors
        return true;
      } catch (_) {
        /* continue */
      }
    }

    // Last resort: plain text
    logger.warn("Falling back to range-based plain text insertion");
    return this._insertPlainText(el, text);
  }

  _insertPlainText(el, text) {
    if (document.queryCommandSupported?.("insertText")) {
      try {
        document.execCommand("insertText", false, text);
        this._dispatchInput(el, "insertText");
        return true;
      } catch (_) {
        /* fall through */
      }
    }

    // Range-based plain text
    try {
      const sel = window.getSelection?.();
      if (!sel || sel.rangeCount === 0) {
        const r = document.createRange();
        r.selectNodeContents(el);
        r.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(r);
      }

      const range = window.getSelection().getRangeAt(0);
      range.deleteContents();

      const tn = document.createTextNode(text);
      range.insertNode(tn);
      range.setStartAfter(tn);
      range.setEndAfter(tn);
      sel.removeAllRanges();
      sel.addRange(range);

      this._dispatchInput(el, "insertText");
      return true;
    } catch (_) {
      return false;
    }
  }

  _dispatchInput(el, inputType = "insertText") {
    // Generic change/input for frameworks
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));

    // Try to provide richer signal when supported
    try {
      el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType }));
    } catch (e) {
      logger.error("Failed to dispatch rich InputEvent", e);
    }
  }
}

class ClipboardWriter {
  write(text) {
    // Never throws; failures are acceptable as last resort.
    navigator.clipboard.writeText(text).then(
      () => ToastService.show("Prompt copied to clipboard"),
      () => ToastService.show("Failed to copy to clipboard")
    );
    return true;
  }
}

class TextInserter {
  /** @param {InsertionStrategy[]} strategies */
  constructor(strategies) {
    this.strategies = strategies;
  }

  canHandle(target) {
    for (const s of this.strategies) {
      try {
        if (s.canHandle(target)) return true;
      } catch (e) {
        logger.error("Failed to determine strategy capability", e);
      }
    }
    return false;
  }

  insert(target, text) {
    if (!target) return false;

    for (const s of this.strategies) {
      try {
        if (s.canHandle(target)) {
          const ok = s.insert(target, text);
          if (ok) return true;
        }
      } catch (e) {
        logger.error("Insertion strategy error", e);
      }
    }

    return false;
  }
}

/** ----------------------- Popover UI ----------------------- */

class PopoverUI {
  /**
   * @param {object} deps
   * @param {(query:string, list:any[]) => any[]} deps.searchFn
   * @param {(prompt:any) => void} deps.onSelect
   * @param {() => void} deps.onClose
   */
  constructor({ searchFn, onSelect, onClose }) {
    this.searchFn = searchFn;
    this.onSelect = onSelect;
    this.onClose = onClose;

    this.root = null;
    this.searchInput = null;
    this.listEl = null;

    this.allPrompts = [];
    this.filtered = [];
    this.selectedIndex = 0;

    // bound handlers
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onDocKeyDown = this._onDocKeyDown.bind(this);
    this._onDocClick = this._onDocClick.bind(this);
    this._onListClick = this._onListClick.bind(this);
  }

  open(prompts) {
    this.close(); // ensure only one
    this.allPrompts = prompts ?? [];
    this.filtered = [...this.allPrompts];
    this.selectedIndex = 0;

    const wrapper = document.createElement("div");
    wrapper.className = "promptive-popover";
    wrapper.innerHTML = `
        <div class="plp-container" role="dialog" aria-modal="true" aria-label="Prompt Library">
          <div class="plp-header">
            <input type="text" class="plp-search" placeholder="Search prompts..." autocomplete="off" aria-label="Search prompts" />
            <button class="plp-close" aria-label="Close">×</button>
          </div>
          <div class="plp-list" role="listbox" aria-label="Prompts">
            ${this._renderList()}
          </div>
        </div>
      `;

    document.body.appendChild(wrapper);

    this.root = wrapper;
    this.searchInput = wrapper.querySelector(".plp-search");
    this.listEl = wrapper.querySelector(".plp-list");

    // Event wiring
    this.searchInput.addEventListener("input", (e) => {
      const q = e.target.value;
      this.filtered = this._filter(q);
      this.selectedIndex = 0;
      this._rerenderList();
    });
    this.searchInput.addEventListener("keydown", this._onKeyDown);
    wrapper.querySelector(".plp-close").addEventListener("click", () => this.close());
    this.listEl.addEventListener("click", this._onListClick);

    // Global listeners
    document.addEventListener("keydown", this._onDocKeyDown);
    document.addEventListener("click", this._onDocClick, true); // capture to beat page handlers

    // Focus the search box
    this.searchInput.focus();
  }

  close() {
    if (!this.root) return;
    document.removeEventListener("keydown", this._onDocKeyDown);
    document.removeEventListener("click", this._onDocClick, true);
    this.root.remove();
    this.root = null;
    this.searchInput = null;
    this.listEl = null;
    this.onClose?.();
  }

  _filter(query) {
    const q = (query || "").trim();
    if (!q) return [...this.allPrompts];
    try {
      return this.searchFn(q, this.allPrompts);
    } catch {
      // Defensive: fall back to simple contains
      const lower = q.toLowerCase();
      return this.allPrompts.filter((p) => {
        const t = (p.title || "").toLowerCase();
        const c = (p.content || "").toLowerCase();
        const tags = (p.tags || []).join(" ").toLowerCase();
        return t.includes(lower) || c.includes(lower) || tags.includes(lower);
      });
    }
  }

  _renderList() {
    if (!this.filtered.length) {
      return `<div class="plp-empty">No prompts found</div>`;
    }
    return this.filtered
      .map((p, i) => {
        const sel = i === this.selectedIndex;
        const aria = sel ? `aria-selected="true"` : `aria-selected="false"`;
        const classes = `plp-item ${sel ? "plp-selected" : ""}`;
        const tags = p.tags?.length
          ? `<div class="plp-item-tags">${p.tags
            .map((t) => `<span class="plp-tag">${escapeHtml(t)}</span>`)
            .join("")}</div>`
          : "";
        return `
            <div class="${classes}" data-index="${i}" role="option" ${aria} tabindex="-1">
              <div class="plp-item-title">${escapeHtml(p.title || "")}</div>
              <div class="plp-item-content">${escapeHtml((p.content || "").slice(0, 100))}...</div>
              ${tags}
            </div>
          `;
      })
      .join("");
  }

  _rerenderList() {
    if (!this.listEl) return;
    this.listEl.innerHTML = this._renderList();
    // Ensure selected is visible
    const selected = this.listEl.querySelector(".plp-item.plp-selected");
    selected?.scrollIntoView({ block: "nearest" });
  }

  _onListClick(e) {
    const item = e.target.closest(".plp-item");
    if (!item) return;
    const idx = Number(item.dataset.index);
    const prompt = this.filtered[idx];
    if (prompt) this.onSelect?.(prompt);
  }

  _onKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      this.selectedIndex = Math.min(this.selectedIndex + 1, this.filtered.length - 1);
      this._rerenderList();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
      this._rerenderList();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const p = this.filtered[this.selectedIndex];
      if (p) this.onSelect?.(p);
    } else if (e.key === "Escape") {
      e.preventDefault();
      this.close();
    }
  }

  _onDocKeyDown(e) {
    if (e.key === "Escape") this.close();
  }

  _onDocClick(e) {
    // Robust outside-click detection (supports shadow DOM)
    if (!this.root) return;
    const path = e.composedPath?.() ?? [];
    if (!path.includes(this.root)) {
      this.close();
    }
  }
}

/** ----------------------- Controller ----------------------- */

class ContentController {
  constructor() {
    this.api = new BackgroundAPI();

    this.textInserter = new TextInserter([
      new InputTextareaStrategy(),
      new ContentEditableStrategy(),
    ]);

    this.clipboardWriter = new ClipboardWriter();

    this.popover = null;
    this.targetElement = null;
    this.targetCursorPosition = null;

    // Bind for runtime listener
    this._onRuntimeMessage = this._onRuntimeMessage.bind(this);
    browser.runtime.onMessage.addListener(this._onRuntimeMessage);

    logger.info("initialized");
  }

  async _onRuntimeMessage(message) {
    if (!isMessage(message)) {
      logger.warn("Ignoring non-message:", message);
      return;
    }

    switch (message.type) {
      case MSG.QUERY_STATUS:
        return Promise.resolve({ active: true });

      case MSG.OPEN_POPOVER:
        await this.openPopover();
        return;

      case MSG.INSERT_PROMPT:
        // Direct insertion path (bypassing popover)
        this._rememberTarget(document.activeElement);
        this._insertAndNotify(message.prompt);
        this._clearTarget();
        return;

      default:
        logger.warn("Unknown message:", message);
        return;
    }
  }

  async openPopover() {
    if (this.popover) {
      logger.warn("Refusing to open popover: already open");
      return;
    }

    // Remember where to insert *before* opening UI
    this._rememberTarget(document.activeElement);

    const prompts = await this.api.getPrompts();

    // Lazy init popover to wire handlers with dependencies
    this.popover = new PopoverUI({
      searchFn: simpleSearch,
      onSelect: async (prompt) => {
        await this.api.recordUsage(prompt.id);
        this._restoreTarget();
        this._insertAndNotify(prompt.content);
        this.popover?.close(); // will trigger onClose
      },
      onClose: () => {
        this._restoreTarget();
        this._clearTarget();
        this.popover = null;
      },
    });

    this.popover.open(prompts);
  }

  _insertAndNotify(text) {
    const target = this.targetElement;
    const ok = this.textInserter.insert(target, text);
    if (ok) {
      ToastService.show("Prompt inserted");
      return;
    }

    this.clipboardWriter.write(text);
    ToastService.show("Copied to clipboard");
  }

  _rememberTarget(el) {
    const acceptable = this.textInserter.canHandle(el);
    if (!acceptable) {
      this.targetElement = null;
      this.targetCursorPosition = null;
      return;
    }

    this.targetElement = el;
    this.targetCursorPosition = CursorPositionManager.getPosition(el);
  }

  _restoreTarget() {
    if (!this.targetElement?.isConnected) {
      return false;
    }

    try {
      // Focus the element
      if (typeof this.targetElement.focus === "function") {
        this.targetElement.focus();
      }

      // Restore cursor position
      if (this.targetCursorPosition) {
        CursorPositionManager.setPosition(this.targetElement, this.targetCursorPosition);
      }

      return true;
    } catch (e) {
      logger.warn("Failed to restore target", e);
      return false;
    }
  }

  _clearTarget() {
    this.targetElement = null;
    this.targetCursorPosition = null;
  }
}

/** ----------------------- Search (pluggable) ----------------------- */

function simpleSearch(query, items) {
  const q = query.toLowerCase();
  return items.filter((item) => {
    const title = (item.title || "").toLowerCase();
    const content = (item.content || "").toLowerCase();
    const tags = (item.tags || []).join(" ").toLowerCase();
    return title.includes(q) || content.includes(q) || tags.includes(q);
  });
}

/** ----------------------- Boot ----------------------- */

// Instantiate controller once; content scripts may run per page
new ContentController();
