import { PromptRepository } from "../lib/storage.js";

import { MenuController } from "./MenuController.js";
import { ModalController } from "./ModalController.js";
import { PromptRenderer } from "./PromptRenderer.js";
import { logger } from "./logger.js";
import { ClipboardService, ImportExportService, SearchService, ToastService } from "./services.js";

class UndoDeleteManager {
  constructor(toasts, repo) {
    this.toasts = toasts;
    this.repo = repo;
    this.pending = new Map(); // id -> { prompt, timerId }
  }

  async deleteAndOfferUndo(prompt, refresh) {
    await this.repo.deletePrompt(prompt.id);
    await refresh();

    const timerId = setTimeout(() => {
      this.pending.delete(prompt.id);
    }, 6000);

    this.pending.set(prompt.id, { prompt, timerId });

    this.toasts.show(`Deleted "${prompt.title}"`, {
      actionLabel: "Undo",
      onAction: async () => {
        const p = this.pending.get(prompt.id);
        if (!p) return;

        clearTimeout(p.timerId);
        this.pending.delete(prompt.id);
        await this.repo.savePrompt({ ...prompt, id: prompt.id });
        await refresh();
        this.toasts.show("Restored");
      },
    });
  }
}

export class PromptiveSidebar {
  constructor({
    repository = new PromptRepository(),
    search = new SearchService(),
    renderer = new PromptRenderer(),
    menu = new MenuController(),
    modal = new ModalController(),
    toasts = new ToastService(),
    clipboard = new ClipboardService(),
    importerExporter = null,
  } = {}) {
    // collaborators
    this.repo = repository;
    this.search = search;
    this.renderer = renderer;
    this.menu = menu;
    this.modal = modal;
    this.toasts = toasts;
    this.clipboard = clipboard;
    this.importExport = importerExporter || new ImportExportService(this.repo, this.toasts, logger);
    this.undoDelete = new UndoDeleteManager(this.toasts, this.repo);

    // state
    this.prompts = /** @type {Prompt[]} */ ([]);
    this.editingPrompt = /** @type {Prompt|null} */ (null);

    // init
    this.init().catch((e) => {
      logger.error("Initialization failed", e);
      this.toasts.show("Failed to initialize prompts");
    });

    logger.info("initialized");
  }

  // --- lifecycle ---
  async init() {
    await this.repo.initialize();
    await this.loadAndRender();
    this.bindDom();

    // Listen to storage changes (local or sync)
    browser.storage.onChanged.addListener((changes, area) => {
      if ((area === "local" || area === "sync") && changes.prompts) {
        this.loadAndRender();
      }
    });
  }

  async loadAndRender() {
    this.prompts = await this.repo.getAllPrompts();
    this.render(this.prompts);
  }

  render(prompts) {
    const container = document.getElementById("promptList");
    container.innerHTML = this.renderer.list(prompts);
    // per-card: use
    container.querySelectorAll(".use-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const id = e.currentTarget.dataset.id;
        await this.usePrompt(id);
      });
    });
    // kebab menus
    this.menu.bind(container, async (action, id) => {
      if (action === "edit") await this.editPrompt(id);
      if (action === "delete") await this.deletePrompt(id);
    });
  }

  // --- event binding ---
  bindDom() {
    document.getElementById("addPromptBtn").addEventListener("click", () => this.openModal());

    document.getElementById("searchInput").addEventListener("input", (e) => {
      const q = e.target.value;
      const results = this.search.search(q, this.prompts);
      this.render(results);
    });

    document.getElementById("importBtn").addEventListener("click", () => {
      document.getElementById("importFile").click();
    });
    document.getElementById("importFile").addEventListener("change", async (e) => {
      await this.importExport.importFromFile(e.target.files[0]);
      await this.loadAndRender();
    });

    document.getElementById("exportBtn").addEventListener("click", async () => {
      await this.importExport.exportToDownload();
    });

    document.getElementById("promptForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      await this.savePrompt();
    });

    this.modal.bind();
  }

  // --- user actions (facade methods kept compatible) ---
  async usePrompt(id) {
    const prompt = this.prompts.find((p) => p.id === id);
    if (!prompt) return;
    try {
      await this.repo.recordUsage(id);
      await this.clipboard.copy(prompt.content);
      this.toasts.show("Prompt copied to clipboard");
      await this.loadAndRender();
    } catch (e) {
      logger.error("usePrompt failed", e);
      this.toasts.show("Failed to use prompt");
    }
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
    try {
      await this.undoDelete.deleteAndOfferUndo(prompt, async () => {
        await this.loadAndRender();
      });
    } catch (e) {
      logger.error("deletePrompt failed", e);
      this.toasts.show("Failed to delete prompt");
    }
  }

  openModal(prompt = null) {
    this.modal.open({
      title: prompt ? "Edit Prompt" : "Add Prompt",
      fields: {
        title: prompt?.title ?? "",
        content: prompt?.content ?? "",
        tags: prompt?.tags ?? [],
      },
    });
  }

  closeModal() {
    this.modal.close();
    this.editingPrompt = null;
  }

  isModalOpen() {
    return this.modal.isOpen();
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

    const payload = { title, content, tags };
    if (this.editingPrompt) payload.id = this.editingPrompt.id;

    try {
      await this.repo.savePrompt(payload);
      await this.loadAndRender();
      this.closeModal();
      this.toasts.show(this.editingPrompt ? "Prompt updated" : "Prompt added");
    } catch (e) {
      logger.error("savePrompt failed", e);
      this.toasts.show("Failed to save prompt");
    }
  }
}
