import { Provider, detectProvider, getProviderConfig } from "../lib/providers";

import { DefaultProviderAdapterFactory } from "./providers/ProviderAdapterFactory";

import { CaretPositioner } from "./CaretPositioner";

export class InputFocusManager {
  private adapterFactory = new DefaultProviderAdapterFactory();
  private caretPositioner = new CaretPositioner();

  focusProviderInput(provider?: Provider): boolean {
    const adapter = this.adapterFactory.getForUrl(window.location.href);

    if (adapter) {
      if (!provider || adapter.id === provider) {
        const success = adapter.focusComposer();
        if (success) {
          const el = adapter.getComposer();
          if (el) this.caretPositioner.moveToEnd(el);
        }
        return success;
      }
    }

    // Fallback: use selector-based approach when no adapter matches
    const detected = provider || detectProvider(window.location.href);
    if (!detected) return false;

    const config = getProviderConfig(detected);
    if (!config) return false;

    const el = document.querySelector(config.composerSelector) as HTMLElement;
    if (!el) return false;

    el.focus();
    this.caretPositioner.moveToEnd(el);
    return true;
  }
}
