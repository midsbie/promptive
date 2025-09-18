import { MSG, createMessage, sendToTab } from "../lib/messaging";

import { TabService } from "./TabService";

export class Commands {
  static async openPromptSelector(tabId?: number): Promise<void> {
    if (!tabId) {
      const tab = await TabService.getActiveTab();
      if (!tab?.id) return;
      tabId = tab.id;
    }

    await sendToTab(tabId, createMessage(MSG.OPEN_POPOVER));
  }
}
