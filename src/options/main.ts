import browser, { Commands } from "webextension-polyfill";

import { commands } from "../lib/commands";
import { MSG, Message } from "../lib/messaging";
import { AppSettings, DEFAULT_DAEMON_ADDRESS, SettingsRepository } from "../lib/settings";

import { PromptivdStatusController } from "./PromptivdStatusController";
import { logger } from "./logger";

class NotificationController {
  private statusEl: HTMLElement;
  private timeoutId: number | null = null;

  constructor(element: HTMLElement) {
    if (!element) {
      throw new Error("Status element not found for NotificationController");
    }
    this.statusEl = element;
  }

  show(message: string, { isError = false, duration = 2000 } = {}): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    this.statusEl.textContent = message;
    this.statusEl.className = "status" + (isError ? " error" : "");
    this.statusEl.style.display = "block";

    this.timeoutId = window.setTimeout(() => {
      this.statusEl.textContent = "";
      this.statusEl.style.display = "none";
      this.timeoutId = null;
    }, duration);
  }
}

class OptionsPage {
  private repo = new SettingsRepository();
  private settings: AppSettings;
  private notificationCtl: NotificationController;
  private lastCommittedShortcut: string | null = null;
  private promptivdStatusCtl: PromptivdStatusController;

  // Elements
  private shortcutInput = document.getElementById("shortcut") as HTMLInputElement;
  private shortcutHelp = document.getElementById("shortcutHelp") as HTMLElement;
  private contextMenuLimitInput = document.getElementById("contextMenuLimit") as HTMLInputElement;
  private contextMenuSortSelect = document.getElementById("contextMenuSort") as HTMLSelectElement;
  private promptivdDaemonAddressInput = document.getElementById(
    "promptivdDaemonAddress"
  ) as HTMLInputElement;

  async initialize(): Promise<void> {
    this.notificationCtl = new NotificationController(
      document.getElementById("status") as HTMLElement
    );

    this.promptivdStatusCtl = new PromptivdStatusController(
      document.getElementById("promptivd-status-indicator") as HTMLDivElement,
      document.getElementById("promptivd-status-text") as HTMLSpanElement,
      document.getElementById("promptivd-connect-btn") as HTMLButtonElement
    );
    this.promptivdStatusCtl.initialize();

    await this.repo.initialize();
    this.settings = this.repo.get();

    this.loadShortcut();
    this.renderSettings();
    this.bindEvents();

    browser.runtime.onMessage.addListener(this.onMessage);
  }

  private onShortcutKeydown = async (e: KeyboardEvent): Promise<void> => {
    e.preventDefault();

    // Cancel recording?
    if (e.key === "Escape") {
      this.shortcutInput.value = this.lastCommittedShortcut ?? "";
      this.setShortcutState(null, "");
      return;
    }

    const keys: string[] = [];
    if (e.ctrlKey) keys.push("Ctrl");
    if (e.altKey) keys.push("Alt");
    if (e.shiftKey) keys.push("Shift");
    if (e.metaKey) keys.push("Command");

    if (!["Control", "Alt", "Shift", "Meta"].includes(e.key)) {
      keys.push(e.key.toUpperCase());
    }

    // We are composing a chord if only modifiers were pressed
    if (keys.length === 0) {
      this.setShortcutState("pending", "Press a letter or number to complete");
      return;
    }

    // Not enough keys for a valid chord
    if (keys.length < 2) {
      this.setShortcutState("invalid", "Use at least two keys (e.g., Alt+Shift+P)");
      return;
    }

    const shortcut = keys.join("+");
    this.shortcutInput.value = shortcut;

    try {
      await browser.commands.update({
        name: commands.OPEN_PROMPT_SELECTOR,
        shortcut: shortcut,
      });
      this.lastCommittedShortcut = shortcut;
      this.setShortcutState("valid", "Shortcut updated successfully!");
      // Briefly show success then clear highlight
      window.setTimeout(() => this.setShortcutState(null, ""), 1200);
    } catch {
      // Invalid or disallowed chord; inform the user inline
      this.setShortcutState("invalid", "This key combination isn’t allowed by Firefox");
    }
  };

  private onMessage = (msg: Message): void => {
    switch (msg.action) {
      case MSG.PROMPTIVD_STATUS_CHANGED:
        this.promptivdStatusCtl.updateStatus(msg.state);
        return;
    }
  };

  private renderSettings(): void {
    this.contextMenuLimitInput.value = String(this.settings.contextMenu.limit);
    this.contextMenuSortSelect.value = this.settings.contextMenu.sort;
    this.promptivdDaemonAddressInput.value = this.settings.promptivd.daemonAddress;
  }

  private async saveSettings(): Promise<void> {
    const newLimit = parseInt(this.contextMenuLimitInput.value, 10);
    const newSort = this.contextMenuSortSelect.value as AppSettings["contextMenu"]["sort"];
    const newDaemonAddress = this.promptivdDaemonAddressInput.value.trim();

    this.settings.contextMenu.limit = isNaN(newLimit) ? 10 : newLimit;
    this.settings.contextMenu.sort = newSort;
    this.settings.promptivd.daemonAddress = newDaemonAddress || DEFAULT_DAEMON_ADDRESS;

    await this.repo.save(this.settings);
    this.notificationCtl.show("Settings saved!");
  }

  private loadShortcut(): void {
    browser.commands.getAll().then((all: Commands.Command[]) => {
      const command = all.find((c) => c.name === commands.OPEN_PROMPT_SELECTOR);
      if (command && command.shortcut) {
        this.shortcutInput.value = command.shortcut;
        this.lastCommittedShortcut = command.shortcut;
      }
    });
  }

  private bindEvents(): void {
    this.shortcutInput.addEventListener("keydown", this.onShortcutKeydown);
    this.shortcutInput.addEventListener("focus", () =>
      this.setShortcutState("pending", "Press keys to set shortcut")
    );
    this.shortcutInput.addEventListener("blur", () => this.setShortcutState(null, ""));
    this.contextMenuLimitInput.addEventListener("input", () => this.saveSettings());
    this.contextMenuSortSelect.addEventListener("change", () => this.saveSettings());
    this.promptivdDaemonAddressInput.addEventListener("blur", () => this.saveSettings());
  }

  private setShortcutState(state: "valid" | "invalid" | "pending" | null, message: string): void {
    const el = this.shortcutInput;
    el.classList.remove("is-valid", "is-invalid", "is-pending");
    this.shortcutHelp.classList.remove("success", "error");

    if (state === "valid") {
      el.classList.add("is-valid");
      this.shortcutHelp.textContent = message;
      this.shortcutHelp.classList.add("success");
    } else if (state === "invalid") {
      el.classList.add("is-invalid");
      this.shortcutHelp.textContent = message;
      this.shortcutHelp.classList.add("error");
    } else if (state === "pending") {
      el.classList.add("is-pending");
      this.shortcutHelp.textContent = message;
    } else {
      this.shortcutHelp.textContent = message || "";
    }
  }
}

// Initialize the page
document.addEventListener("DOMContentLoaded", () => {
  new OptionsPage().initialize().catch(logger.error);
});
