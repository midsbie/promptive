import { Provider } from "../../lib/providers";

import { BasicProviderAdapter } from "./BasicProviderAdapter";

export class ChatGPTAdapter extends BasicProviderAdapter {
  readonly id: Provider = "chatgpt";

  async observeAccepted(signal: AbortSignal): Promise<void> {
    // Count user messages
    const getCount = () => document.querySelectorAll('[data-message-author-role="user"]').length;
    const initialCount = getCount();

    // Wait for count to increase OR composer to be cleared
    await this.waitFor(
      () => {
        if (getCount() > initialCount) return true;

        // Fallback: composer empty?
        const el = this.getComposer();
        if (el && (el as HTMLInputElement).value === "") return true;
        if (el && el.textContent === "") return true;

        return false;
      },
      signal,
      BasicProviderAdapter.ACCEPTED_TIMEOUT_MS
    );
  }
}
