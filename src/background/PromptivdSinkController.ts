import browser from "webextension-polyfill";

import { resolveErrorMessage } from "../lib/error";
import { MSG, createMessage, sendToTab } from "../lib/messaging";
import {
  ClientState,
  SessionPolicy,
  isSessionPolicy,
  mapPlacementToInsertPosition,
} from "../lib/promptivd";
import { Provider, isProvider, providers } from "../lib/providers";
import { AppSettings } from "../lib/settings";

import { StateChangeDetail } from "./promptivd-sink/ClientStateMachine";
import {
  ConnectionErrorDetail,
  InsertTextDetail,
  PromptivdSinkClient,
} from "./promptivd-sink/PromptivdSinkClient";

import { TabService } from "./TabService";
import { logger } from "./logger";

export class PromptivdSinkController {
  private static readonly DEFAULT_PROVIDER: Provider = "chatgpt";
  private static readonly DEFAULT_SESSION_POLICY: SessionPolicy = "reuse_or_create";

  private client: PromptivdSinkClient | null = null;

  initialize(settings: AppSettings): void {
    if (this.client) throw new Error("Client already initialized");

    let endpoint: string;
    try {
      endpoint = new URL("/v1/sink/ws", settings.promptivd.daemonAddress).toString();
    } catch (e) {
      logger.error("Invalid daemonAddress", {
        daemonAddress: settings.promptivd.daemonAddress,
        error: e,
      });
      throw e;
    }

    this.client = new PromptivdSinkClient({
      endpoint,
      extensionVersion: browser.runtime.getManifest()?.version ?? "0.0.0",
      providers,
    });

    this.client.addEventListener(PromptivdSinkClient.EVENT_INSERT_TEXT, this.onInsertText);
    this.client.addEventListener(PromptivdSinkClient.EVENT_STATE_CHANGE, this.onStateChange);
    this.client.addEventListener(
      PromptivdSinkClient.EVENT_CONNECTION_ERROR,
      this.onConnectionError
    );
    this.client.addEventListener(PromptivdSinkClient.EVENT_REGISTERED, this.onRegistered);

    try {
      this.client.start();
    } catch (e) {
      logger.error("PromptivdSinkClient start failed", e);
      this.destroy();
      throw e;
    }
  }

  destroy(): void {
    if (!this.client) return;

    try {
      this.client.stop?.();
    } catch (e) {
      logger.warn("Client stop failed", e);
    }

    this.client.removeEventListener(PromptivdSinkClient.EVENT_INSERT_TEXT, this.onInsertText);
    this.client.removeEventListener(PromptivdSinkClient.EVENT_STATE_CHANGE, this.onStateChange);
    this.client.removeEventListener(
      PromptivdSinkClient.EVENT_CONNECTION_ERROR,
      this.onConnectionError
    );
    this.client.removeEventListener(PromptivdSinkClient.EVENT_REGISTERED, this.onRegistered);

    this.client = null;
  }

  shouldReinitialize(newSettings: AppSettings): boolean {
    if (this.client == null) return true;

    try {
      const next = new URL("/v1/sink/ws", newSettings.promptivd.daemonAddress).toString();
      return this.client.endpoint !== next;
    } catch {
      return true;
    }
  }

  getStatus(): ClientState {
    return this.client?.getCurrentState() ?? ClientState.Disconnected;
  }

  start(): void {
    if (!this.client) {
      logger.warn("Cannot start: client not initialized");
      return;
    }
    this.client.start();
  }

  stop(): void {
    if (!this.client) {
      logger.warn("Cannot stop: client not initialized");
      return;
    }
    this.client.stop();
  }

  private onInsertText = async (event: CustomEvent<InsertTextDetail>): Promise<void> => {
    if (!this.client) return;

    const { frame } = event.detail;
    const { id, payload } = frame;

    const text = payload?.text;
    if (typeof text !== "string" || text.length === 0) {
      return this.client.failJob(id, "Missing or invalid text");
    }

    logger.info("Received INSERT_TEXT job", {
      id,
      placement: payload.placement,
      source: payload.source,
      target: payload.target,
      metadata: payload.metadata ?? null,
      textPreview: text.slice(0, 120),
      textLength: text.length,
    });

    const insertAt = mapPlacementToInsertPosition(payload.placement);
    if (!insertAt) {
      return this.client?.failJob(id, "Invalid placement");
    }

    const p = payload.target?.provider;
    let provider: Provider;
    if (!p) provider = PromptivdSinkController.DEFAULT_PROVIDER;
    else if (!isProvider(p)) return this.client?.failJob(id, "Invalid provider");
    else provider = p;

    const sp = payload.target?.session_policy;
    let sessionPolicy: SessionPolicy;
    if (!sp) sessionPolicy = PromptivdSinkController.DEFAULT_SESSION_POLICY;
    else if (!isSessionPolicy(sp)) return this.client?.failJob(id, "Invalid session policy");
    else sessionPolicy = sp;

    try {
      const { tabId /*, isNewTab */ } = await TabService.findOrCreateProviderTab(
        provider,
        sessionPolicy
      );

      await TabService.waitForContentScript(tabId, { waitForReady: true });
      await TabService.focusProviderInput(tabId, provider);

      const message = createMessage(MSG.INSERT_TEXT, { text, insertAt });
      const response = await sendToTab(tabId, message);
      if (response.error) throw new Error(response.error);

      logger.info("Text insertion successful", { id, tabId, provider, sessionPolicy });
      return this.client?.completeJob(id);
    } catch (e) {
      const error = resolveErrorMessage(e);
      logger.error("Failed to insert text", { id, error, provider, sessionPolicy });
      return this.client?.failJob(id, error);
    }
  };

  private onStateChange = (event: CustomEvent<StateChangeDetail>): void => {
    const { oldState, newState } = event.detail;
    logger.debug("Client state changed", { oldState, newState });

    browser.runtime
      .sendMessage(createMessage(MSG.PROMPTIVD_STATUS_CHANGED, { state: newState }))
      .catch((error) => {
        logger.warn("Failed to broadcast status change:", error);
      });
  };

  private onConnectionError = (event: CustomEvent<ConnectionErrorDetail>): void => {
    const { error } = event.detail;
    logger.error("Connection error", error);
  };

  private onRegistered = (): void => {
    logger.info("Promptivd sink client registered and ready");
  };
}
