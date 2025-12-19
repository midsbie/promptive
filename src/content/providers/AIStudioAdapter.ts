import { Provider } from "../../lib/providers";

import { BasicProviderAdapter } from "./BasicProviderAdapter";

export class AIStudioAdapter extends BasicProviderAdapter {
  readonly id: Provider = "aistudio";

  async observeAccepted(signal: AbortSignal): Promise<void> {
    await this.waitFor(
      () => {
        const el = this.getComposer() as HTMLTextAreaElement;
        return el?.value === "";
      },
      signal,
      BasicProviderAdapter.ACCEPTED_TIMEOUT_MS
    );
  }
}
