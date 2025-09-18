import { MSG, createMessage, sendToTab } from "../lib/messaging";

import { TabManager } from "./TabManager";

export class Commands {
  static async openPromptSelector(tabId?: number): Promise<void> {
    if (!tabId) {
      const tab = await TabManager.getActiveTab();
      if (!tab?.id) return;
      tabId = tab.id;
    }

    await sendToTab(tabId, createMessage(MSG.OPEN_POPOVER));
  }
}
