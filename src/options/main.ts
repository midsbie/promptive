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

  // Batch Sending Elements
  private promptivdMaxMessageCharsInput = document.getElementById(
    "promptivdMaxMessageChars"
  ) as HTMLInputElement;
  private contentTypeRadios = document.querySelectorAll(
    'input[name="contentType"]'
  ) as NodeListOf<HTMLInputElement>;
  private batchModeRadios = document.querySelectorAll(
    'input[name="batchMode"]'
  ) as NodeListOf<HTMLInputElement>;
  private framingEnabledCheckbox = document.getElementById("framingEnabled") as HTMLInputElement;
  private framingModeSelect = document.getElementById("framingMode") as HTMLSelectElement;
  private framingTextInput = document.getElementById("framingText") as HTMLInputElement;
  private showProgressWidgetCheckbox = document.getElementById(
    "showProgressWidget"
  ) as HTMLInputElement;

  async initialize(): Promise<void> {
    this.notificationCtl = new NotificationController(
      document.getElementById("status") as HTMLElement
    );

    await this.repo.initialize();
    this.settings = this.repo.get();

    this.promptivdStatusCtl = new PromptivdStatusController(
      document.getElementById("promptivd-status-indicator") as HTMLDivElement,
      document.getElementById("promptivd-status-text") as HTMLSpanElement,
      document.getElementById("promptivd-toggle-btn") as HTMLButtonElement,
      document.getElementById("promptivd-connect-btn") as HTMLButtonElement,
      this.repo
    );
    this.promptivdStatusCtl.initialize();

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

    // Batch settings
    this.promptivdMaxMessageCharsInput.value = String(this.settings.promptivd.maxMessageChars);
    this.setRadioValue(this.contentTypeRadios, this.settings.promptivd.contentType);
    this.setRadioValue(this.batchModeRadios, this.settings.promptivd.batchMode);
    this.framingEnabledCheckbox.checked = this.settings.promptivd.framing.enabled;
    this.framingModeSelect.value = this.settings.promptivd.framing.mode;
    this.framingTextInput.value = this.settings.promptivd.framing.text;
    this.showProgressWidgetCheckbox.checked = this.settings.promptivd.showProgressWidget;
  }

  private getFormSettings(): AppSettings {
    const limit = parseInt(this.contextMenuLimitInput.value, 10);
    const maxChars = parseInt(this.promptivdMaxMessageCharsInput.value, 10);

    // IMPORTANT: keep the structure in sync with AppSettings to prevent key order issues or the
    //            first time saveSettings is called, it will always think settings have changed.
    return {
      contextMenu: {
        limit: isNaN(limit) ? 10 : limit,
        sort: this.contextMenuSortSelect.value as AppSettings["contextMenu"]["sort"],
      },
      promptivd: {
        enabled: this.settings.promptivd.enabled,
        daemonAddress: this.promptivdDaemonAddressInput.value.trim() || DEFAULT_DAEMON_ADDRESS,
        maxMessageChars: isNaN(maxChars) ? 10000 : Math.max(500, Math.min(50000, maxChars)),
        contentType: this.getRadioValue(
          this.contentTypeRadios
        ) as AppSettings["promptivd"]["contentType"],
        framing: {
          enabled: this.framingEnabledCheckbox.checked,
          mode: this.framingModeSelect.value as AppSettings["promptivd"]["framing"]["mode"],
          text: this.framingTextInput.value,
        },
        batchMode: this.getRadioValue(
          this.batchModeRadios
        ) as AppSettings["promptivd"]["batchMode"],
        showProgressWidget: this.showProgressWidgetCheckbox.checked,
      },
    };
  }

  private async saveSettings(): Promise<void> {
    const newSettings = this.getFormSettings();
    if (JSON.stringify(newSettings) === JSON.stringify(this.settings)) return;

    this.settings = newSettings;
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

    // Batch settings events
    this.promptivdMaxMessageCharsInput.addEventListener("change", () => this.saveSettings());
    this.contentTypeRadios.forEach((r) => r.addEventListener("change", () => this.saveSettings()));
    this.batchModeRadios.forEach((r) => r.addEventListener("change", () => this.saveSettings()));
    this.framingEnabledCheckbox.addEventListener("change", () => this.saveSettings());
    this.framingModeSelect.addEventListener("change", () => this.saveSettings());
    this.framingTextInput.addEventListener("blur", () => this.saveSettings());
    this.showProgressWidgetCheckbox.addEventListener("change", () => this.saveSettings());
  }

  private setRadioValue(radios: NodeListOf<HTMLInputElement>, value: string): void {
    radios.forEach((r) => {
      if (r.value === value) r.checked = true;
    });
  }

  private getRadioValue(radios: NodeListOf<HTMLInputElement>): string {
    let value = "";
    radios.forEach((r) => {
      if (r.checked) value = r.value;
    });
    return value;
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
