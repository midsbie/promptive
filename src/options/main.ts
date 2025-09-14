import browser, { Commands } from "webextension-polyfill";

import { commands } from "../lib/commands";
import { AppSettings, SettingsRepository } from "../lib/settings";

import { logger } from "./logger";

class OptionsPage {
  private repo = new SettingsRepository();
  private settings: AppSettings;

  // Elements
  private shortcutInput = document.getElementById("shortcut") as HTMLInputElement;
  private statusEl = document.getElementById("status") as HTMLElement;
  private contextMenuLimitInput = document.getElementById("contextMenuLimit") as HTMLInputElement;
  private contextMenuSortSelect = document.getElementById("contextMenuSort") as HTMLSelectElement;

  async initialize(): Promise<void> {
    await this.repo.initialize();
    this.settings = this.repo.get();

    this.loadShortcut();
    this.renderSettings();
    this.bindEvents();
  }

  private renderSettings(): void {
    this.contextMenuLimitInput.value = String(this.settings.contextMenu.limit);
    this.contextMenuSortSelect.value = this.settings.contextMenu.sort;
  }

  private async saveSettings(): Promise<void> {
    const newLimit = parseInt(this.contextMenuLimitInput.value, 10);
    const newSort = this.contextMenuSortSelect.value as AppSettings["contextMenu"]["sort"];

    this.settings.contextMenu.limit = isNaN(newLimit) ? 10 : newLimit;
    this.settings.contextMenu.sort = newSort;

    await this.repo.save(this.settings);
    this.showStatus("Settings saved!");
  }

  private loadShortcut(): void {
    browser.commands.getAll().then((all: Commands.Command[]) => {
      const command = all.find((c) => c.name === commands.OPEN_PROMPT_SELECTOR);
      if (command && command.shortcut) {
        this.shortcutInput.value = command.shortcut;
      }
    });
  }

  private bindEvents(): void {
    this.shortcutInput.addEventListener("keydown", this.handleShortcutKeydown);
    this.contextMenuLimitInput.addEventListener("input", () => this.saveSettings());
    this.contextMenuSortSelect.addEventListener("change", () => this.saveSettings());
  }

  private handleShortcutKeydown = async (e: KeyboardEvent): Promise<void> => {
    e.preventDefault();

    const keys: string[] = [];
    if (e.ctrlKey) keys.push("Ctrl");
    if (e.altKey) keys.push("Alt");
    if (e.shiftKey) keys.push("Shift");
    if (e.metaKey) keys.push("Command");

    if (!["Control", "Alt", "Shift", "Meta"].includes(e.key)) {
      keys.push(e.key.toUpperCase());
    }

    if (keys.length < 2) {
      logger.warn("Ignoring shortcut with less than 2 keys");
      return;
    }

    const shortcut = keys.join("+");
    this.shortcutInput.value = shortcut;

    try {
      await browser.commands.update({
        name: commands.OPEN_PROMPT_SELECTOR,
        shortcut: shortcut,
      });
      this.showStatus("Shortcut updated successfully!");
    } catch (err: any) {
      this.showStatus("Error: " + err.message, true);
    }
  };

  private showStatus(message: string, isError: boolean = false): void {
    this.statusEl.textContent = message;
    this.statusEl.style.color = isError ? "#e74c3c" : "#27ae60";
    setTimeout(() => {
      this.statusEl.textContent = "";
    }, 3000);
  }
}

// Initialize the page
document.addEventListener("DOMContentLoaded", () => {
  new OptionsPage().initialize().catch(logger.error);
});
