import { Provider } from "../../lib/providers";

import { BasicProviderAdapter } from "./BasicProviderAdapter";

export class ClaudeAdapter extends BasicProviderAdapter {
  readonly id: Provider = "claude";

  async observeAccepted(signal: AbortSignal): Promise<void> {
    // Fallback strategy: check if composer is cleared
    await this.waitFor(
      () => {
        const el = this.getComposer();
        return el?.textContent === "";
      },
      signal,
      BasicProviderAdapter.ACCEPTED_TIMEOUT_MS
    );
  }
}
