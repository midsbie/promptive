import { MSG, createMessage } from "../shared/messages.js";

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
      if (!tab?.id) {
        logger.warn("Ignoring context menu click with no tab id");
        return;
      }

      const { menuItemId } = info;

      switch (info.menuItemId) {
        case "manage-prompts":
          await browser.sidebarAction.open();
          return;

        case "more-prompts":
          await browser.tabs.sendMessage(tab.id, createMessage(MSG.OPEN_POPOVER));
          return;
      }

      if (typeof menuItemId !== "string" || !menuItemId.startsWith("prompt-")) {
        logger.warn("Ignoring unknown context menu item:", menuItemId);
        return;
      }

      const promptId = menuItemId.slice("prompt-".length);
      const prompt = await this.repo.getPrompt(promptId);
      if (!prompt) {
        logger.warn("Prompt not found for id:", promptId);
        return;
      }

      await this.repo.recordUsage(promptId);
      await browser.tabs.sendMessage(
        tab.id,
        createMessage(MSG.INSERT_PROMPT, { prompt: prompt.content })
      );
    });

    browser.action.onClicked.addListener(async (tab) => {
      await browser.tabs.sendMessage(tab.id, createMessage(MSG.OPEN_POPOVER));
    });

    browser.commands.onCommand.addListener(async (command) => {
      if (command === "open-prompt-selector") {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        await browser.tabs.sendMessage(tab.id, createMessage(MSG.OPEN_POPOVER));
      }
    });
  }
}
