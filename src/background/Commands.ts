import browser from "webextension-polyfill";

import { MSG, createMessage, sendToTab } from "../lib/messaging";

import { logger } from "./logger";

export class Commands {
  static async getActiveTab(): Promise<browser.Tabs.Tab | undefined> {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      return tabs[0];
    } catch {
      logger.warn("Failed to get active tab");
      return null;
    }
  }

  static async openPromptSelector(tabId?: number): Promise<void> {
    if (!tabId) {
      const tab = await Commands.getActiveTab();
      if (!tab?.id) return;
      tabId = tab.id;
    }

    await sendToTab(tabId, createMessage(MSG.OPEN_POPOVER));
  }
}
