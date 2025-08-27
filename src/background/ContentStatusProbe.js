import { withTimeout } from "../lib/async.js";
import { MSG, createMessage } from "../lib/messaging.js";

export class ContentStatusProbe {
  async isActive(tabId) {
    try {
      const res = await withTimeout(
        browser.tabs.sendMessage(tabId, createMessage(MSG.QUERY_STATUS)),
        100
      );
      return !!res?.active;
    } catch {
      // No receiver / restricted page / timeout → treat as not active
      return false;
    }
  }
}
