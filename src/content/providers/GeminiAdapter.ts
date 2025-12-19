import { Provider } from "../../lib/providers";

import { BasicProviderAdapter } from "./BasicProviderAdapter";

export class GeminiAdapter extends BasicProviderAdapter {
  readonly id: Provider = "gemini";

  override canSend(): boolean {
    if (!super.canSend()) return false;

    // Gemini also uses aria-disabled
    const sendBtn = this.getSendButton();
    return sendBtn?.getAttribute("aria-disabled") !== "true";
  }

  async observeAccepted(signal: AbortSignal): Promise<void> {
    await this.waitFor(
      () => {
        const el = this.getComposer();
        // Quill often leaves an empty <p><br></p>
        return el?.textContent?.trim() === "";
      },
      signal,
      BasicProviderAdapter.ACCEPTED_TIMEOUT_MS
    );
  }
}
