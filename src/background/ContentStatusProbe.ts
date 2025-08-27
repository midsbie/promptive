import { MSG, createMessage } from "../lib/messaging.js";

interface StatusResponse {
  active?: boolean;
}

export class ContentStatusProbe {
  async isActive(tabId: number): Promise<boolean> {
    try {
      const res = (await browser.tabs.sendMessage(tabId, createMessage(MSG.QUERY_STATUS))) as StatusResponse;
      return !!res?.active;
    } catch {
      // No receiver / restricted page / timeout → treat as not active
      return false;
    }
  }
}