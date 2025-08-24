import { FuzzySearch } from "../shared/fuzzy-search.js";
import { PromptStorage } from "../shared/storage.js";

class PromptLibrarySidebar {
  constructor() {
    this.storage = new PromptStorage();
    this.fuzzySearch = new FuzzySearch();
    this.prompts = [];
    this.editingPrompt = null;
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
    // Add prompt button
    document.getElementById("addPromptBtn").addEventListener("click", () => {
      this.openModal();
    });

    // Search input
    document.getElementById("searchInput").addEventListener("input", (e) => {
      this.handleSearch(e.target.value);
    });

    // Import/Export
    document.getElementById("importBtn").addEventListener("click", () => {
      document.getElementById("importFile").click();
    });

    document.getElementById("importFile").addEventListener("change", async (e) => {
      await this.handleImport(e.target.files[0]);
    });

    document.getElementById("exportBtn").addEventListener("click", async () => {
      await this.handleExport();
    });

    // Modal form
    document.getElementById("promptForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      await this.savePrompt();
    });

    document.getElementById("cancelBtn").addEventListener("click", () => {
      this.closeModal();
    });

    // Close modal on Escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isModalOpen()) {
        this.closeModal();
      }
    });

    // Click outside modal to close
    document.getElementById("promptModal").addEventListener("click", (e) => {
      if (e.target.id === "promptModal") {
        this.closeModal();
      }
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

    container.innerHTML = prompts
      .map(
        (prompt) => `
      <div class="prompt-item" role="listitem">
        <div class="prompt-header">
          <div class="prompt-title">${this.escapeHtml(prompt.title)}</div>
          <div class="prompt-actions">
            <button class="prompt-btn" data-action="use" data-id="${prompt.id}" aria-label="Use prompt">Use</button>
            <button class="prompt-btn" data-action="edit" data-id="${prompt.id}" aria-label="Edit prompt">Edit</button>
            <button class="prompt-btn" data-action="delete" data-id="${prompt.id}" aria-label="Delete prompt">Delete</button>
          </div>
        </div>
        <div class="prompt-content">${this.escapeHtml(prompt.content)}</div>

        <!-- Tags Row -->
        ${
          prompt.tags && prompt.tags.length > 0
            ? `
          <div class="prompt-tags-row">
            <div class="prompt-tags">
              ${prompt.tags.map((tag) => `<span class="tag">${this.escapeHtml(tag)}</span>`).join("")}
            </div>
          </div>
        `
            : ""
        }

        <!-- Stats Row -->
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
                ? `
              <span class="stat-separator">•</span>
              <span class="stat-item">
                <svg class="stat-icon" width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                  <polyline points="12,6 12,12 16,14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                ${new Date(prompt.last_used).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            `
                : ""
            }
          </div>
        </div>
      </div>
    `
      )
      .join("");

    // Add event listeners to action buttons
    container.querySelectorAll(".prompt-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const action = e.target.dataset.action;
        const id = e.target.dataset.id;

        if (action === "use") {
          await this.usePrompt(id);
        } else if (action === "edit") {
          await this.editPrompt(id);
        } else if (action === "delete") {
          await this.deletePrompt(id);
        }
      });
    });
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

    // Copy to clipboard
    await navigator.clipboard.writeText(prompt.content);
    this.showToast("Prompt copied to clipboard");

    // Refresh to show updated usage stats
    await this.loadPrompts();
  }

  async editPrompt(id) {
    const prompt = this.prompts.find((p) => p.id === id);
    if (!prompt) return;

    this.editingPrompt = prompt;
    this.openModal(prompt);
  }

  async deletePrompt(id) {
    if (confirm("Are you sure you want to delete this prompt?")) {
      await this.storage.deletePrompt(id);
      await this.loadPrompts();
      this.showToast("Prompt deleted");
    }
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

    // Trap focus
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

    const promptData = {
      title,
      content,
      tags,
    };

    if (this.editingPrompt) {
      promptData.id = this.editingPrompt.id;
    }

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

  showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => {
      toast.classList.remove("show");
    }, 3000);
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
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize
new PromptLibrarySidebar();
