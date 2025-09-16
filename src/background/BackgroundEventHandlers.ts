import browser, { Menus, Storage, Tabs } from "webextension-polyfill";

import { commands } from "../lib/commands";
import { MSG, createMessage, sendToTab } from "../lib/messaging";
import { SettingsRepository } from "../lib/settings";
import { PromptRepository } from "../lib/storage";

import { Commands } from "./Commands";
import { ContextMenuService } from "./ContextMenuService";
import { logger } from "./logger";

export class BackgroundEventHandlers extends EventTarget {
  static readonly EVENT_SETTINGS_CHANGE = "settings-change";

  private repo: PromptRepository;
  private menus: ContextMenuService;

  constructor(repo: PromptRepository, menus: ContextMenuService) {
    super();

    this.repo = repo;
    this.menus = menus;
  }

  onStorageChanged = async (changes: Record<string, Storage.StorageChange>, area: string) => {
    if (area !== "local") return;

    // If settings changed, publish event
    if (changes[SettingsRepository.getStorageKey()]) {
      logger.debug("Settings changed, re-initializing context menu");
      this.dispatchEvent(new Event(BackgroundEventHandlers.EVENT_SETTINGS_CHANGE));
    }

    if (changes[PromptRepository.getStorageKey()]) {
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

    switch (menuItemId) {
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

  async onTabUpdated(_tabId: number): Promise<void> {
    // We were previously enabling/disabling the icon based on whether the content script was
    // present back when we did not have a popup to show. We do have a popup now, but still keeping
    // this event handler as it may prove useful in the future.
  }
}
