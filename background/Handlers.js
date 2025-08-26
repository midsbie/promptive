import { logger } from "./logger.js";

/**
 * Centralized event handlers to keep background bootstrap tidy.
 */
export class Handlers {
  constructor(repo, menus) {
    this.repo = repo;
    this.menus = menus;
  }

  attachAll() {
    browser.runtime.onInstalled.addListener(async () => {
      logger.info("Extension installed");
    });

    browser.storage.onChanged.addListener(async (changes, area) => {
      const key = "promptlib:prompts"; // namespaced key written by adapters
      if (area === "local" && (changes.prompts || changes[key])) {
        await this.menus.rebuild();
      }
      // No need to rebuild on sync changes directly; local is the UI source of truth.
    });

    browser.contextMenus.onClicked.addListener(async (info, tab) => {
      if (info.menuItemId === "manage-prompts") {
        await browser.sidebarAction.open();
      } else if (info.menuItemId === "more-prompts") {
        await browser.tabs.sendMessage(tab.id, { action: "openPopover" });
      } else if (typeof info.menuItemId === "string" && info.menuItemId.startsWith("prompt-")) {
        const promptId = info.menuItemId.slice("prompt-".length);
        const prompt = await this.repo.getPrompt(promptId);
        if (prompt) {
          await this.repo.recordUsage(promptId);
          await browser.tabs.sendMessage(tab.id, {
            action: "insertPrompt",
            prompt: prompt.content,
          });
        }
      }
    });

    browser.action.onClicked.addListener(async (tab) => {
      await browser.tabs.sendMessage(tab.id, { action: "openPopover" });
    });

    browser.commands.onCommand.addListener(async (command) => {
      if (command === "open-prompt-selector") {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        await browser.tabs.sendMessage(tab.id, { action: "openPopover" });
      }
    });
  }
}
