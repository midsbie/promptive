import browser, { Menus, Storage, Tabs } from "webextension-polyfill";

import { commands } from "../lib/commands";
import { MSG, createMessage, sendToTab } from "../lib/messaging";
import { PromptRepository } from "../lib/storage";

import { Commands } from "./Commands";
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
      await Commands.openPromptSelector();
    }
  };

  onContextMenuClick = async (info: Menus.OnClickData, tab?: Tabs.Tab) => {
    if (!tab?.id) {
      logger.warn("Ignoring context menu click with no tab id");
      return;
    }

    const { menuItemId } = info;

    switch (info.menuItemId) {
      case Commands.CMD_OPEN_PROMPT_SELECTOR:
        await Commands.openPromptSelector(tab.id);
        return;

      case Commands.CMD_MANAGE_PROMPTS:
        await browser.sidebarAction.open();
        return;
    }

    if (
      typeof menuItemId !== "string" ||
      !menuItemId.startsWith(Commands.CMD_SELECT_PROMPT_PREFIX)
    ) {
      logger.warn("Ignoring unknown context menu item:", menuItemId);
      return;
    }

    const promptId = menuItemId.slice(Commands.CMD_SELECT_PROMPT_PREFIX.length);
    const prompt = await this.repo.getPrompt(promptId);
    if (!prompt) {
      logger.warn("Prompt not found for id:", promptId);
      return;
    }

    await this.repo.recordUsage(promptId);
    await sendToTab(tab.id, createMessage(MSG.INSERT_PROMPT, { prompt }));
  };
}
