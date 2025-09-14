import browser from "webextension-polyfill";

import { SearchService } from "../lib/services";
import { Prompt, PromptRepository } from "../lib/storage";

import { MenuController } from "./MenuController";
import { ModalController } from "./ModalController";
import { PromptRenderer } from "./PromptRenderer";
import { logger } from "./logger";
import { ClipboardService, ImportExportService, ToastService } from "./services";

interface UndoDeletePending {
  prompt: Prompt;
  timerId: number;
}

interface PromptiveSidebarDependencies {
  repository?: PromptRepository;
  search?: SearchService;
  renderer?: PromptRenderer;
  menu?: MenuController;
  modal?: ModalController;
  toasts?: ToastService;
  clipboard?: ClipboardService;
  importerExporter?: ImportExportService | null;
}

class UndoDeleteManager {
  private toasts: ToastService;
  private repo: PromptRepository;
  private pending: Map<string, UndoDeletePending>;

  constructor(toasts: ToastService, repo: PromptRepository) {
    this.toasts = toasts;
    this.repo = repo;
    this.pending = new Map<string, UndoDeletePending>();
  }

  async deleteAndOfferUndo(prompt: Prompt, refresh: () => Promise<void>): Promise<void> {
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
  private repo: PromptRepository;
  private search: SearchService;
  private renderer: PromptRenderer;
  private menu: MenuController;
  private modal: ModalController;
  private toasts: ToastService;
  private clipboard: ClipboardService;
  private importExport: ImportExportService;
  private undoDelete: UndoDeleteManager;
  private prompts: Prompt[];
  private editingPrompt: Prompt | null;

  constructor({
    repository = new PromptRepository(),
    search = new SearchService(),
    renderer = new PromptRenderer(),
    menu = new MenuController(),
    modal = new ModalController(),
    toasts = new ToastService(),
    clipboard = new ClipboardService(),
    importerExporter = null,
  }: PromptiveSidebarDependencies = {}) {
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
    this.prompts = [];
    this.editingPrompt = null;

    // init
    this.init().catch((e) => {
      logger.error("Initialization failed", e);
      this.toasts.show("Failed to initialize prompts");
    });

    logger.info("initialized");
  }

  // --- lifecycle ---
  async init(): Promise<void> {
    await this.repo.initialize();
    await this.loadAndRender();
    this.bindDom();

    // Listen to storage changes (local or sync)
    browser?.storage?.onChanged?.addListener((changes, area) => {
      // Noting that here we are reacting to BOTH local and sync changes, unlike in background's
      // `handleStorageChanged`.
      if ((area === "local" || area === "sync") && changes[PromptRepository.getStorageKey()]) {
        this.loadAndRender();
      }
    });
  }

  async loadAndRender(): Promise<void> {
    this.prompts = await this.repo.getAllPrompts();
    this.render(this.prompts);
  }

  render(prompts: Prompt[]): void {
    const container = document.getElementById("promptList")!;
    container.innerHTML = this.renderer.list(prompts);
    // per-card: use
    container.querySelectorAll(".use-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id!;
        await this.usePrompt(id);
      });
    });
    // kebab menus
    this.menu.bind(container, async (action, id) => {
      if (action === "edit") this.navigateToEditor(id);
      if (action === "delete") await this.deletePrompt(id);
    });
  }

  // --- event binding ---
  bindDom(): void {
    document
      .getElementById("addPromptBtn")!
      .addEventListener("click", () => this.navigateToEditor());

    (document.getElementById("searchInput") as HTMLInputElement).addEventListener("input", (e) => {
      const q = (e.target as HTMLInputElement).value;
      const results = this.search.search(q, this.prompts);
      this.render(results);
    });

    document.getElementById("importBtn")!.addEventListener("click", () => {
      (document.getElementById("importFile") as HTMLInputElement).click();
    });
    (document.getElementById("importFile") as HTMLInputElement).addEventListener(
      "change",
      async (e) => {
        const files = (e.target as HTMLInputElement).files;
        if (files && files[0]) {
          await this.importExport.importFromFile(files[0]);
          await this.loadAndRender();
        }
      }
    );

    document.getElementById("exportBtn")!.addEventListener("click", async () => {
      await this.importExport.exportToDownload();
    });

    (document.getElementById("promptForm") as HTMLFormElement).addEventListener(
      "submit",
      async (e) => {
        e.preventDefault();
        await this.savePrompt();
      }
    );

    this.modal.bind();
  }

  // --- user actions (facade methods kept compatible) ---
  async usePrompt(id: string): Promise<void> {
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

  navigateToEditor(id?: string): void {
    const path = id ? `/editor/${id}` : "/editor/new";
    (window as any).router?.navigate(path);
  }

  async deletePrompt(id: string): Promise<void> {
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

  openModal(prompt: Prompt | null = null): void {
    this.modal.open({
      title: prompt ? "Edit Prompt" : "Add Prompt",
      fields: {
        title: prompt?.title ?? "",
        content: prompt?.content ?? "",
        tags: prompt?.tags ?? [],
      },
    });
  }

  closeModal(): void {
    this.modal.close();
    this.editingPrompt = null;
  }

  isModalOpen(): boolean {
    return this.modal.isOpen();
  }

  async savePrompt(): Promise<void> {
    const title = (document.getElementById("promptTitle") as HTMLInputElement).value.trim();
    const content = (document.getElementById("promptContent") as HTMLTextAreaElement).value.trim();
    const tags = (document.getElementById("promptTags") as HTMLInputElement).value
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t);

    if (!title || !content) return;

    const payload: any = { title, content, tags };
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
