import browser from "webextension-polyfill";

import { MSG, createMessage, sendToTab } from "./messaging";

export class ContentStatusProbe {
  async findFirstActive(): Promise<number | null> {
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
      const tabId = tab.id;
      if (!tabId) continue;

      const ok = await this.isActive(tabId);
      if (ok) return tabId;
    }
    return null;
  }

  async isActive(tabId: number): Promise<boolean> {
    try {
      const res = await sendToTab(tabId, createMessage(MSG.QUERY_STATUS));
      return !!res?.active;
    } catch {
      // No receiver / restricted page / timeout → treat as not active
      return false;
    }
  }
}
