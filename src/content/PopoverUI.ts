import { Prompt } from "../lib/storage";
import { HtmlEscaper } from "../lib/string";

interface PromptListItem extends Prompt {
  escapedTitle: string;
  escapedContent: string;
  escapedTags: string[];
}

// Search function type
export type SearchFunction = (query: string, items: PromptListItem[]) => PromptListItem[];

// PopoverUI constructor dependencies
export interface PopoverDependencies {
  searchFn: SearchFunction;
  onSelect: (prompt: Prompt) => void;
  onClose: () => void;
}

export class PopoverUI {
  private searchFn: SearchFunction;
  private onSelect: (prompt: Prompt) => void;
  private onClose: () => void;

  private root: HTMLElement | null = null;
  private searchInput: HTMLInputElement | null = null;
  private listEl: HTMLElement | null = null;

  private allPrompts: PromptListItem[] = [];
  private filtered: PromptListItem[] = [];
  private selectedIndex: number = 0;

  constructor({ searchFn, onSelect, onClose }: PopoverDependencies) {
    this.searchFn = searchFn;
    this.onSelect = onSelect;
    this.onClose = onClose;
  }

  open(prompts: Prompt[]): void {
    this.close(); // ensure only one

    this.allPrompts = (prompts ?? []).map((p) => ({
      ...p,
      escapedTitle: HtmlEscaper.escape(p.title || ""),
      escapedContent: HtmlEscaper.escape(p.content || ""),
      escapedTags: (p.tags || []).map((t) => HtmlEscaper.escape(t)),
    }));

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
    this.searchInput = wrapper.querySelector(".plp-search") as HTMLInputElement;
    this.listEl = wrapper.querySelector(".plp-list") as HTMLElement;

    // Event wiring
    this.searchInput.addEventListener("input", (e) => {
      this.filtered = this._filter((e.target as HTMLInputElement).value);
      this.selectedIndex = 0;
      this._rerenderList();
    });
    this.searchInput.addEventListener("keydown", this._onKeyDown);
    wrapper.querySelector(".plp-close")!.addEventListener("click", () => this.close());
    this.listEl.addEventListener("click", this._onListClick);

    // Global listeners
    document.addEventListener("keydown", this._onDocKeyDown);
    document.addEventListener("click", this._onDocClick, true); // capture to beat page handlers

    // Focus the search box
    this.searchInput.focus();
  }

  close(): void {
    if (!this.root) return;

    document.removeEventListener("keydown", this._onDocKeyDown);
    document.removeEventListener("click", this._onDocClick, true);

    this.root.remove();
    this.root = null;
    this.searchInput = null;
    this.listEl = null;
    this.onClose?.();
  }

  private _filter(query: string): PromptListItem[] {
    const q = (query || "").trim();
    if (!q) return [...this.allPrompts];

    try {
      return this.searchFn(q, this.allPrompts);
    } catch {
      // Defensive: fall back to simple contains
      const lq = q.toLowerCase();
      return this.allPrompts.filter((p) => {
        const t = (p.title || "").toLowerCase();
        const c = (p.content || "").toLowerCase();
        const tags = (p.tags || []).join(" ").toLowerCase();
        return t.includes(lq) || c.includes(lq) || tags.includes(lq);
      });
    }
  }

  private _renderList(): string {
    if (!this.filtered.length) {
      return `<div class="plp-empty">No prompts found</div>`;
    }

    return this.filtered
      .map((p, i) => {
        const sel = i === this.selectedIndex;
        const aria = sel ? `aria-selected="true"` : `aria-selected="false"`;
        const classes = `plp-item ${sel ? "plp-selected" : ""}`;

        const tags = p.escapedTags?.length
          ? `<div class="plp-item-tags">${p.escapedTags
              .map((t) => `<span class="plp-tag">${t}</span>`)
              .join("")}</div>`
          : "";

        return `
            <div class="${classes}" data-index="${i}" role="option" ${aria} tabindex="-1">
              <div class="plp-item-title">${p.escapedTitle || ""}</div>
              <div class="plp-item-content">${(p.escapedContent || "").slice(0, 100)}...</div>
              ${tags}
            </div>
          `;
      })
      .join("");
  }

  private _rerenderList(): void {
    if (!this.listEl) return;

    this.listEl.innerHTML = this._renderList();
    // Ensure selected is visible
    const selected = this.listEl.querySelector(".plp-item.plp-selected");
    (selected as HTMLElement)?.scrollIntoView({ block: "nearest" });
  }

  private _onListClick = (e: MouseEvent): void => {
    const target = e.target as HTMLElement;
    const item = target.closest(".plp-item") as HTMLElement;
    if (!item) return;

    const idx = Number(item.dataset.index);
    const prompt = this.filtered[idx];
    if (prompt) this.onSelect?.(prompt);
  };

  private _onKeyDown = (e: KeyboardEvent): void => {
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
  };

  private _onDocKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") this.close();
  };

  private _onDocClick = (e: MouseEvent): void => {
    // Robust outside-click detection (supports shadow DOM)
    if (!this.root) return;
    const path = e.composedPath?.() ?? [];
    if (!path.includes(this.root)) {
      this.close();
    }
  };
}
