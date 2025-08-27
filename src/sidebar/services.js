import { FuzzySearch } from "../lib/search.js";

export class ToastService {
  show(message, options = null) {
    const toast = document.getElementById("toast");
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
  async copy(text) {
    await navigator.clipboard.writeText(text);
  }
}

export class SearchService {
  constructor(fuzzy = new FuzzySearch()) {
    this.fuzzy = fuzzy;
  }

  search(query, prompts) {
    if (!query || !query.trim()) return prompts;
    return this.fuzzy.search(query, prompts);
  }
}

export class ImportExportService {
  constructor(repo, toast, logger) {
    this.repo = repo;
    this.toast = toast;
    this.logger = logger;
  }

  async importFromFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await this.repo.import(data);
      this.toast.show("Prompts imported successfully");
    } catch (e) {
      this.logger.error("Import failed", e);
      this.toast.show("Failed to import prompts: " + (e?.message ?? e));
    }
  }

  async exportToDownload() {
    const data = await this.repo.export();
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
