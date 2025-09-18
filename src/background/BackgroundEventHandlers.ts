import browser, { Menus, Storage, Tabs } from "webextension-polyfill";

import { commands } from "../lib/commands";
import { MSG, createMessage, sendToTab } from "../lib/messaging";
import { PromptRepository } from "../lib/storage";

import { Commands } from "./Commands";
import { ContextMenuService } from "./ContextMenuService";
import { logger } from "./logger";

export class BackgroundEventHandlers {
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
    if (!tab.id) {
      logger.warn("Ignoring action click with no tab id");
      return;
    }

    await sendToTab(tab.id, createMessage(MSG.OPEN_POPOVER));
  };

  onCommand = async (command: string) => {
    switch (command) {
      case commands.OPEN_PROMPT_SELECTOR:
        await Commands.openPromptSelector();
        return;

      default:
        logger.warn("Ignoring unknown command:", command);
        return;
    }
  };

  onContextMenuClick = async (info: Menus.OnClickData, tab?: Tabs.Tab) => {
    if (!tab?.id) {
      logger.warn("Ignoring context menu click with no tab id");
      return;
    }

    const { menuItemId } = info;

    switch (menuItemId) {
      case commands.OPEN_PROMPT_SELECTOR:
        await Commands.openPromptSelector(tab.id);
        return;

      case commands.MANAGE_PROMPTS:
        await browser.sidebarAction.open();
        return;
    }

    if (typeof menuItemId !== "string" || !menuItemId.startsWith(commands.SELECT_PROMPT_PREFIX)) {
      logger.warn("Ignoring unknown context menu item:", menuItemId);
      return;
    }

    const promptId = menuItemId.slice(commands.SELECT_PROMPT_PREFIX.length);
    const prompt = await this.repo.getPrompt(promptId);
    if (!prompt) {
      logger.warn("Prompt not found for id:", promptId);
      return;
    }

    await this.repo.recordUsage(promptId);
    await sendToTab(tab.id, createMessage(MSG.INSERT_PROMPT, { prompt }));
  };

  onTabUpdated = async (_tabId: number): Promise<void> => {
    // We were previously enabling/disabling the icon based on whether the content script was
    // present back when we did not have a popup to show. We do have a popup now, but still keeping
    // this event handler as it may prove useful in the future.
  };
}
