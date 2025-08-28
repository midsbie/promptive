import { MSG, createMessage, send } from "../lib/messaging";

export class ContentStatusProbe {
  async isActive(_tabId: number): Promise<boolean> {
    try {
      const res = await send(createMessage(MSG.QUERY_STATUS));
      return !!res?.active;
    } catch {
      // No receiver / restricted page / timeout → treat as not active
      return false;
    }
  }
}
