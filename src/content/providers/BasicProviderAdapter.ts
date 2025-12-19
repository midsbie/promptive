import { Provider, getProviderConfig } from "../../lib/providers";
import { ContentEditableStrategy, InputTextareaStrategy, TextInserter } from "../TextInserter";

import { ProviderAdapter } from "./ProviderAdapter";

export abstract class BasicProviderAdapter implements ProviderAdapter {
  static readonly READY_TIMEOUT_MS = 10000; // 10 seconds
  // Ensure timeout comfortably accommodates potentially long generation times
  static readonly GENERATION_DONE_TIMEOUT_MS = 360000; // 6 minutes
  static readonly ACCEPTED_TIMEOUT_MS = 30000; // 30 seconds

  abstract readonly id: Provider;

  protected textInserter = new TextInserter([
    new InputTextareaStrategy(),
    new ContentEditableStrategy(),
  ]);

  detect(url: string): boolean {
    const config = getProviderConfig(this.id);
    if (!config) return false;
    try {
      const purl = new URL(config.baseUrl);
      const curl = new URL(url);
      return purl.host === curl.host;
    } catch {
      return false;
    }
  }

  focusComposer(): boolean {
    const el = this.getComposer();
    if (el) {
      el.focus();
      return true;
    }
    return false;
  }

  setComposerText(text: string): void {
    const el = this.getComposer();
    if (!el) return;

    // Clear existing content
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      (el as HTMLInputElement | HTMLTextAreaElement).value = "";
    } else {
      el.innerHTML = "";
    }

    // Insert new text at top (which is the same as replacing since we cleared)
    this.textInserter.insert({
      target: el,
      content: text,
      insertAt: "top",
    });
  }

  getComposer(): HTMLElement | null {
    const config = getProviderConfig(this.id);
    if (!config) return null;
    return document.querySelector(config.composerSelector) as HTMLElement;
  }

  getSendButton(): HTMLButtonElement | null {
    const config = getProviderConfig(this.id);
    if (!config?.sendButtonSelector) return null;
    return this.getFirstElementBySelector(config.sendButtonSelector) as HTMLButtonElement | null;
  }

  getStopButton(): HTMLButtonElement | null {
    const config = getProviderConfig(this.id);
    if (!config?.stopButtonSelector) return null;
    return this.getFirstElementBySelector(config.stopButtonSelector) as HTMLButtonElement | null;
  }

  private getFirstElementBySelector(selector: string | string[]): Element | null {
    const selectors = typeof selector === "string" ? [selector] : selector;
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  abstract observeAccepted(signal: AbortSignal): Promise<void>;

  canSend(): boolean {
    const el = this.getComposer();
    if (!el) return false;

    const sendBtn = this.getSendButton();
    return sendBtn != null && !sendBtn.disabled;
  }

  send(): boolean {
    if (!this.canSend()) return false;

    const sendBtn = this.getSendButton();
    if (!sendBtn) return false;

    sendBtn.click();
    return true;
  }

  async observeReady(signal: AbortSignal, timeout?: number): Promise<void> {
    // Check stop button not present and send button exists; not checking disabled state since
    // composer will be empty.
    await this.waitFor(
      () => this.getStopButton() == null && this.getSendButton() != null,
      signal,
      timeout ?? BasicProviderAdapter.GENERATION_DONE_TIMEOUT_MS
    );
  }

  protected waitFor(
    predicate: () => boolean,
    signal: AbortSignal,
    timeoutMs = 30000,
    intervalMs = 200
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (predicate()) return resolve();

      const start = Date.now();
      const i = setInterval(() => {
        if (signal.aborted) {
          clearInterval(i);
          reject(new Error("Aborted"));
          return;
        }
        if (predicate()) {
          clearInterval(i);
          resolve();
          return;
        }
        if (Date.now() - start > timeoutMs) {
          clearInterval(i);
          reject(new Error(`Timeout waiting for condition after ${timeoutMs}ms`));
        }
      }, intervalMs);

      signal.addEventListener(
        "abort",
        () => {
          clearInterval(i);
          reject(new Error("Aborted"));
        },
        { once: true }
      );
    });
  }
}
