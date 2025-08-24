import { FuzzySearch } from "../shared/fuzzy-search.js";
import { PromptStorage } from "../shared/storage.js";

class PromptLibrarySidebar {
  constructor() {
    this.storage = new PromptStorage();
    this.fuzzySearch = new FuzzySearch();
    this.prompts = [];
    this.editingPrompt = null;

    // Track pending deletes for Undo
    this.pendingDeletes = new Map(); // id -> { prompt, timerId }

    this.init();
  }

  async init() {
    await this.storage.initialize();
    await this.loadPrompts();
    this.setupEventListeners();
    this.setupStorageListener();
  }

  async loadPrompts() {
    this.prompts = await this.storage.getAllPrompts();
    this.renderPrompts();
  }

  setupEventListeners() {
    document.getElementById("addPromptBtn").addEventListener("click", () => {
      this.openModal();
    });

    document.getElementById("searchInput").addEventListener("input", (e) => {
      this.handleSearch(e.target.value);
    });

    document.getElementById("importBtn").addEventListener("click", () => {
      document.getElementById("importFile").click();
    });

    document.getElementById("importFile").addEventListener("change", async (e) => {
      await this.handleImport(e.target.files[0]);
    });

    document.getElementById("exportBtn").addEventListener("click", async () => {
      await this.handleExport();
    });

    document.getElementById("promptForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      await this.savePrompt();
    });

    document.getElementById("cancelBtn").addEventListener("click", () => {
      this.closeModal();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isModalOpen()) {
        this.closeModal();
      }
    });

    document.getElementById("promptModal").addEventListener("click", (e) => {
      if (e.target.id === "promptModal") {
        this.closeModal();
      }
    });

    // Close any open kebab menus when clicking outside
    document.addEventListener("click", (e) => {
      const openMenus = document.querySelectorAll(".menu.open");
      openMenus.forEach((menu) => {
        const wrapper = menu.closest(".menu-wrapper");
        if (wrapper && !wrapper.contains(e.target)) {
          this.closeMenu(wrapper);
        }
      });
    });
  }

  setupStorageListener() {
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.prompts) {
        this.loadPrompts();
      }
    });
  }

  renderPrompts(prompts = this.prompts) {
    const container = document.getElementById("promptList");

    if (prompts.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No prompts yet</h3>
          <p>Click "Add" to create your first prompt</p>
        </div>
      `;
      return;
    }

    container.innerHTML = prompts.map((prompt) => this.renderPromptItem(prompt)).join("");

    // Wire up per-card actions via delegation
    container.querySelectorAll(".use-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const id = e.currentTarget.dataset.id;
        await this.usePrompt(id);
      });
    });

    container.querySelectorAll(".kebab-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const wrapper = e.currentTarget.closest(".menu-wrapper");
        const expanded = e.currentTarget.getAttribute("aria-expanded") === "true";
        // Close any other open menus first
        document.querySelectorAll(".menu.open").forEach((m) => {
          const w = m.closest(".menu-wrapper");
          if (w !== wrapper) this.closeMenu(w);
        });
        if (expanded) this.closeMenu(wrapper);
        else this.openMenu(wrapper);
      });

      // Keyboard support to open menu
      btn.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const wrapper = e.currentTarget.closest(".menu-wrapper");
          const expanded = e.currentTarget.getAttribute("aria-expanded") === "true";
          if (expanded) this.closeMenu(wrapper);
          else {
            this.openMenu(wrapper);
            // focus first item
            const firstItem = wrapper.querySelector(".menu-item");
            firstItem?.focus();
          }
        }
      });
    });

    container.querySelectorAll(".menu").forEach((menu) => {
      // Click handlers
      menu.addEventListener("click", async (e) => {
        const btn = e.target.closest(".menu-item");
        if (!btn) return;
        const id = btn.dataset.id;
        const action = btn.dataset.action;
        if (action === "edit") {
          await this.editPrompt(id);
        } else if (action === "delete") {
          await this.deletePrompt(id);
        }
        // Close menu after action
        const wrapper = menu.closest(".menu-wrapper");
        this.closeMenu(wrapper);
      });

      // Keyboard navigation
      menu.addEventListener("keydown", (e) => {
        const items = Array.from(menu.querySelectorAll(".menu-item"));
        const currentIndex = items.indexOf(document.activeElement);
        if (e.key === "ArrowDown") {
          e.preventDefault();
          const next = items[(currentIndex + 1) % items.length];
          next.focus();
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          const prev = items[(currentIndex - 1 + items.length) % items.length];
          prev.focus();
        } else if (e.key === "Home") {
          e.preventDefault();
          items[0]?.focus();
        } else if (e.key === "End") {
          e.preventDefault();
          items[items.length - 1]?.focus();
        } else if (e.key === "Escape") {
          e.preventDefault();
          const wrapper = menu.closest(".menu-wrapper");
          this.closeMenu(wrapper);
          wrapper.querySelector(".kebab-btn")?.focus();
        }
      });
    });
  }

  renderPromptItem(prompt) {
    const lastUsed = prompt.last_used
      ? new Date(prompt.last_used).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "";

    return `
      <div class="prompt-item" role="listitem">
        <div class="prompt-header">
          <div class="prompt-title">${this.escapeHtml(prompt.title)}</div>
          <div class="prompt-actions">
            <!-- Use (icon button w/ tooltip) -->
            <button class="icon-btn use-btn ghost"
                    data-id="${prompt.id}"
                    aria-label="Use prompt"
                    data-tooltip="Use">
              ${this.iconInsert()}
            </button>

            <!-- Kebab (overflow menu) -->
            <div class="menu-wrapper">
              <button class="icon-btn kebab-btn ghost"
                      aria-label="More actions"
                      aria-haspopup="menu"
                      aria-expanded="false"
                      data-tooltip="More">
                ${this.iconKebab()}
              </button>
              <div class="menu" role="menu" aria-hidden="true">
                <button class="menu-item" role="menuitem" data-action="edit" data-id="${prompt.id}">
                  ${this.iconEdit()}
                  <span>Edit</span>
                </button>
                <div class="menu-sep" role="separator"></div>
                <button class="menu-item danger" role="menuitem" data-action="delete" data-id="${prompt.id}">
                  ${this.iconTrash()}
                  <span>Delete</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="prompt-content">${this.escapeHtml(prompt.content)}</div>

        ${
          prompt.tags && prompt.tags.length
            ? `<div class="prompt-tags-row">
               <div class="prompt-tags">
                 ${prompt.tags.map((t) => `<span class="tag">${this.escapeHtml(t)}</span>`).join("")}
               </div>
             </div>`
            : ""
        }

        <div class="prompt-stats-row">
          <div class="prompt-stats">
            <span class="stat-item">
              <svg class="stat-icon" width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M3 3v18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              ${prompt.used_times || 0} times
            </span>
            ${
              prompt.last_used
                ? `<span class="stat-separator">•</span>
                 <span class="stat-item">
                   <svg class="stat-icon" width="12" height="12" viewBox="0 0 24 24" fill="none">
                     <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                     <polyline points="12,6 12,12 16,14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                   </svg>
                   ${lastUsed}
                 </span>`
                : ""
            }
          </div>
        </div>
      </div>
    `;
  }

  openMenu(wrapper) {
    const btn = wrapper.querySelector(".kebab-btn");
    const menu = wrapper.querySelector(".menu");
    btn.setAttribute("aria-expanded", "true");
    menu.classList.add("open");
    menu.setAttribute("aria-hidden", "false");
  }

  closeMenu(wrapper) {
    if (!wrapper) return;
    const btn = wrapper.querySelector(".kebab-btn");
    const menu = wrapper.querySelector(".menu");
    btn?.setAttribute("aria-expanded", "false");
    menu?.classList.remove("open");
    menu?.setAttribute("aria-hidden", "true");
  }

  handleSearch(query) {
    if (!query.trim()) {
      this.renderPrompts();
      return;
    }
    const results = this.fuzzySearch.search(query, this.prompts);
    this.renderPrompts(results);
  }

  async usePrompt(id) {
    const prompt = this.prompts.find((p) => p.id === id);
    if (!prompt) return;

    await this.storage.recordUsage(id);

    await navigator.clipboard.writeText(prompt.content);
    this.showToast("Prompt copied to clipboard");

    await this.loadPrompts();
  }

  async editPrompt(id) {
    const prompt = this.prompts.find((p) => p.id === id);
    if (!prompt) return;

    this.editingPrompt = prompt;
    this.openModal(prompt);
  }

  async deletePrompt(id) {
    const prompt = this.prompts.find((p) => p.id === id);
    if (!prompt) return;

    // Remove immediately from storage/UI
    await this.storage.deletePrompt(id);
    await this.loadPrompts();

    // Setup Undo window
    const timerId = setTimeout(() => {
      // finalize (nothing to do, already deleted)
      this.pendingDeletes.delete(id);
    }, 6000);

    this.pendingDeletes.set(id, { prompt, timerId });

    this.showToast(`Deleted "${prompt.title}"`, {
      actionLabel: "Undo",
      onAction: async () => {
        const pending = this.pendingDeletes.get(id);
        if (pending) {
          clearTimeout(pending.timerId);
          this.pendingDeletes.delete(id);
          // Restore prompt with same id
          await this.storage.savePrompt({ ...prompt, id: prompt.id });
          await this.loadPrompts();
          this.showToast("Restored");
        }
      },
    });
  }

  openModal(prompt = null) {
    const modal = document.getElementById("promptModal");
    const title = document.getElementById("modalTitle");

    if (prompt) {
      title.textContent = "Edit Prompt";
      document.getElementById("promptTitle").value = prompt.title;
      document.getElementById("promptContent").value = prompt.content;
      document.getElementById("promptTags").value = prompt.tags ? prompt.tags.join(", ") : "";
    } else {
      title.textContent = "Add Prompt";
      document.getElementById("promptForm").reset();
    }

    modal.classList.add("active");
    document.getElementById("promptTitle").focus();

    this.trapFocus(modal);
  }

  closeModal() {
    document.getElementById("promptModal").classList.remove("active");
    this.editingPrompt = null;
  }

  isModalOpen() {
    return document.getElementById("promptModal").classList.contains("active");
  }

  async savePrompt() {
    const title = document.getElementById("promptTitle").value.trim();
    const content = document.getElementById("promptContent").value.trim();
    const tags = document
      .getElementById("promptTags")
      .value.split(",")
      .map((t) => t.trim())
      .filter((t) => t);

    if (!title || !content) return;

    const promptData = { title, content, tags };
    if (this.editingPrompt) promptData.id = this.editingPrompt.id;

    await this.storage.savePrompt(promptData);
    await this.loadPrompts();
    this.closeModal();
    this.showToast(this.editingPrompt ? "Prompt updated" : "Prompt added");
  }

  async handleImport(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await this.storage.importPrompts(data);
      await this.loadPrompts();
      this.showToast("Prompts imported successfully");
    } catch (error) {
      this.showToast("Failed to import prompts: " + error.message);
    }
  }

  async handleExport() {
    const data = await this.storage.exportPrompts();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prompts-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast("Prompts exported");
  }

  showToast(message, options = null) {
    const toast = document.getElementById("toast");
    toast.innerHTML = ""; // reset
    toast.textContent = message;
    toast.classList.add("show");

    if (options?.actionLabel && typeof options.onAction === "function") {
      const btn = document.createElement("button");
      btn.className = "toast-action";
      btn.textContent = options.actionLabel;
      btn.addEventListener("click", () => {
        options.onAction();
      });
      toast.appendChild(btn);
    }

    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, 3500);
  }

  trapFocus(element) {
    const focusableElements = element.querySelectorAll(
      'button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    element.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        if (e.shiftKey) {
          if (document.activeElement === firstFocusable) {
            e.preventDefault();
            lastFocusable.focus();
          }
        } else {
          if (document.activeElement === lastFocusable) {
            e.preventDefault();
            firstFocusable.focus();
          }
        }
      }
    });
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
  }

  /* ---------- SVG Icons ---------- */
  iconKebab() {
    return `
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="5" r="2" fill="currentColor"></circle>
        <circle cx="12" cy="12" r="2" fill="currentColor"></circle>
        <circle cx="12" cy="19" r="2" fill="currentColor"></circle>
      </svg>`;
  }

  // “Insert” / “Use” icon: arrow into a square
  iconInsert() {
    return `
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14 3h5v18H5V3h5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
        <path d="M12 11V4m0 7l3-3m-3 3L9 8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>`;
  }

  iconEdit() {
    return `
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" fill="currentColor"></path>
        <path d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"></path>
      </svg>`;
  }

  iconTrash() {
    return `
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 6h18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"></path>
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"></path>
        <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"></path>
        <path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"></path>
      </svg>`;
  }
}

// Initialize
new PromptLibrarySidebar();
