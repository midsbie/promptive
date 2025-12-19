import { Provider } from "../../lib/providers";

export interface ProviderAdapter {
  readonly id: Provider;

  detect(url: string): boolean;

  getComposer(): HTMLElement | null;
  focusComposer(): boolean;
  setComposerText(text: string): void;

  canSend(): boolean;
  send(): boolean;

  observeAccepted(signal: AbortSignal): Promise<void>;
  observeReady(signal: AbortSignal, timeout?: number): Promise<void>;
}

export interface ProviderAdapterFactory {
  getForUrl(url: string): ProviderAdapter | null;
}
