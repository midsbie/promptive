import { ChunkingOptions, chunkText } from "../lib/chunking";
import { ClipboardService } from "../lib/clipboard";
import { AppSettings } from "../lib/settings";

import { BasicProviderAdapter } from "./providers/BasicProviderAdapter";
import { ProviderAdapter } from "./providers/ProviderAdapter";
import { DefaultProviderAdapterFactory } from "./providers/ProviderAdapterFactory";

import { BatchProgressUI } from "./BatchProgressUI";
import { logger } from "./logger";
import { ToastService } from "./services";

export class BatchSender {
  private adapterFactory = new DefaultProviderAdapterFactory();
  private currentSession: { abort: AbortController; promise: Promise<void> } | null = null;
  private ui: BatchProgressUI;
  private clipboard: ClipboardService;

  constructor() {
    this.ui = new BatchProgressUI(this.cancel.bind(this));
    this.clipboard = new ClipboardService();

    document.addEventListener("keydown", this.onKeydown);
  }

  destroy() {
    document.removeEventListener("keydown", this.onKeydown);
    this.ui.destroy();
  }

  isSending(): boolean {
    return this.currentSession !== null;
  }

  cancel() {
    if (this.currentSession) {
      this.currentSession.abort.abort();
    }
  }

  private onKeydown = (e: KeyboardEvent) => {
    if (this.isSending() && e.key === "Escape") {
      this.cancel();
    }
  };

  async send(text: string, settings: AppSettings): Promise<{ error: string | null }> {
    if (this.isSending()) {
      ToastService.show("Batch sending already in progress");
      return { error: "Batch sending already in progress" };
    }

    const adapter = this.adapterFactory.getForUrl(window.location.href);
    if (!adapter) {
      // Fallback to clipboard if no adapter
      await this.clipboard.write(text);
      ToastService.show("Provider not supported for batching. Copied to clipboard.");
      return { error: null };
    }

    const chunkingOpts: ChunkingOptions = {
      maxChars: settings.promptivd.maxMessageChars,
      contentType: settings.promptivd.contentType,
      framing: settings.promptivd.framing,
    };

    const chunks = chunkText(text, chunkingOpts);
    if (chunks.length < 1) {
      ToastService.show("No text to send");
      logger.warn("BatchSender invoked with no text chunks");
      return { error: "No text to send" };
    } else if (chunks.length === 1) {
      // Should have been handled by normal inserter, but if we are here, just do it.
      logger.warn("BatchSender invoked for single chunk, inserting directly");
      adapter.focusComposer();
      adapter.setComposerText(chunks[0]);
      return { error: null };
    }

    const abortController = new AbortController();

    this.currentSession = {
      abort: abortController,
      promise: this.runBatch(
        chunks,
        adapter,
        settings.promptivd.batchMode,
        abortController.signal
      ).finally(() => {
        this.currentSession = null;
        this.ui.hide();
      }),
    };

    if (settings.promptivd.showProgressWidget) {
      this.ui.show({ index: 0, total: chunks.length, status: "waiting-ready" });
    }

    try {
      await this.currentSession.promise;
      return { error: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { error: msg };
    }
  }

  private async runBatch(
    chunks: string[],
    adapter: ProviderAdapter,
    mode: "assisted" | "auto-send",
    signal: AbortSignal
  ): Promise<void> {
    let currentIndex = 0;
    try {
      // Initial readiness check with short timeout
      await adapter.observeReady(signal, BasicProviderAdapter.READY_TIMEOUT_MS);

      for (let i = 0; i < chunks.length; i++) {
        if (signal.aborted) throw new Error("Aborted");

        this.ui.update({ index: i, total: chunks.length, status: "waiting-ready" });

        // When i == 0, this would be a redundant check.
        // For i > 0, wait for readiness to return with longer timeout.
        if (i > 0) await adapter.observeReady(signal);

        this.ui.update({ status: "sending" });
        adapter.focusComposer();
        adapter.setComposerText(chunks[i]);

        if (mode === "auto-send") {
          // Auto-send
          if (!adapter.send()) throw new Error("Failed to click send button");

          // Chunk sent, advance recovery point before waiting for acceptance
          currentIndex = i + 1;

          this.ui.update({ status: "waiting-accepted" });
          await adapter.observeAccepted(signal);
        } else {
          // Assisted mode: wait for user to send
          this.ui.update({ status: "waiting-accepted" });
          await adapter.observeAccepted(signal);
          // User sent and accepted, advance recovery point
          currentIndex = i + 1;
        }
      }

      ToastService.show("Batch sending complete!");
    } catch (e: any) {
      if (signal.aborted) {
        ToastService.show("Batch sending cancelled");
        await this.recover(chunks, currentIndex);
        throw new Error("Batch sending cancelled");
      } else {
        logger.error("Batch sending error", e);
        ToastService.show(`Error: ${e.message}`);
        await this.recover(chunks, currentIndex);
        throw e;
      }
    }
  }

  private async recover(chunks: string[], startIndex: number) {
    const remaining = chunks.slice(startIndex).join("\n");
    if (remaining) {
      await this.clipboard.write(remaining);
      ToastService.show("Remaining text copied to clipboard");
    }
  }
}
