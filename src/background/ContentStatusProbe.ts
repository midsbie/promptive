import { MSG, createMessage, sendToTab } from "../lib/messaging";

export class ContentStatusProbe {
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
