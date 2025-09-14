import browser, { Menus, Storage, Tabs } from "webextension-polyfill";

import { commands } from "../lib/commands";
import { MSG, createMessage, sendToTab } from "../lib/messaging";
import { PromptRepository } from "../lib/storage";

import { ContextMenuService } from "./ContextMenuService";
import { logger } from "./logger";

/**
 * Centralized event handlers to keep background bootstrap tidy.
 */
export class Handlers {
  private repo: PromptRepository;
  private menus: ContextMenuService;

  constructor(repo: PromptRepository, menus: ContextMenuService) {
    this.repo = repo;
    this.menus = menus;
  }

  onStorageChanged = async (changes: Record<string, Storage.StorageChange>, area: string) => {
    if (area === "local" && changes[PromptRepository.getStorageKey()]) {
      await this.menus.rebuild();
    }
  };

  onActionClicked = async (tab: Tabs.Tab) => {
    await sendToTab(tab.id!, createMessage(MSG.OPEN_POPOVER));
  };

  onCommand = async (command: string) => {
    if (command === commands.OPEN_PROMPT_SELECTOR) {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      await sendToTab(tab.id, createMessage(MSG.OPEN_POPOVER));
    }
  };

  onContextMenuClick = async (info: Menus.OnClickData, tab?: Tabs.Tab) => {
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
        await sendToTab(tab.id, createMessage(MSG.OPEN_POPOVER));
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
    await sendToTab(tab.id, createMessage(MSG.INSERT_PROMPT, { prompt }));
  };
}
