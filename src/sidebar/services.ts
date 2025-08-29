import type { Logger } from "../lib/logging";
import { PromptRepository } from "../lib/storage";
import { ToastOptions } from "../lib/typedefs";

export class ToastService {
  private _timer?: number;

  show(message: string, options: ToastOptions | null = null): void {
    const toast = document.getElementById("toast")!;
    toast.innerHTML = "";
    toast.textContent = message;
    toast.classList.add("show");

    if (options?.actionLabel && typeof options.onAction === "function") {
      const btn = document.createElement("button");
      btn.className = "toast-action";
      btn.textContent = options.actionLabel;
      btn.addEventListener("click", options.onAction);
      toast.appendChild(btn);
    }

    clearTimeout(this._timer);
    this._timer = setTimeout(() => toast.classList.remove("show"), 3500);
  }
}

export class ClipboardService {
  async copy(text: string): Promise<void> {
    await navigator.clipboard.writeText(text);
  }
}

export class ImportExportService {
  private repo: PromptRepository;
  private toast: ToastService;
  private logger: Logger;

  constructor(repo: PromptRepository, toast: ToastService, logger: Logger) {
    this.repo = repo;
    this.toast = toast;
    this.logger = logger;
  }

  async importFromFile(file: File | null): Promise<void> {
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await this.repo.importPrompts(data);
      this.toast.show("Prompts imported successfully");
    } catch (e: any) {
      this.logger.error("Import failed", e);
      this.toast.show("Failed to import prompts: " + (e?.message ?? e));
    }
  }

  async exportToDownload(): Promise<void> {
    const data = await this.repo.exportPrompts();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prompts-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.toast.show("Prompts exported");
  }
}
