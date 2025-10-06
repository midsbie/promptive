import browser from "webextension-polyfill";

import { resolveErrorMessage } from "../lib/error";
import { MSG, createMessage, sendToTab } from "../lib/messaging";
import {
  ClientState,
  SessionPolicy,
  isSessionPolicy,
  mapPlacementToInsertPosition,
} from "../lib/promptivd";
import { DEFAULT_PROVIDER, ProviderOrAuto, isProviderOrAuto, providers } from "../lib/providers";
import { AppSettings } from "../lib/settings";

import { StateChangeDetail } from "./promptivd-sink/ClientStateMachine";
import {
  ConnectionErrorDetail,
  InsertTextDetail,
  PromptivdSinkClient,
} from "./promptivd-sink/PromptivdSinkClient";

import { TabService } from "./TabService";
import { logger } from "./logger";

// Unfortunately, in MV3 a service worker cannot receive messages sent from runtime.sendMessage in
// its own runtime context, a limitation that also applies to Firefox' background scripts.
//
// The following example reproduces this limitation when run in a service worker or background
// script:
//
//   browser.runtime.onMessage.addListener((m) => {
//       console.log("Message received:", m);
//   });
//
//   setTimeout(() => browser.runtime.sendMessage({ action: "TEST_PING" }), 100);
//
// As a workaround to this limitation, we extend from EventTarget and dispatch events using the
// dispatchEvent interface, while retaining the prior behavior of emitting events via
// runtime.sendMessage.  Messages dispatched by the EventTarget interface are meant for consumption
// in the same runtime context.
export class PromptivdSinkController extends EventTarget {
  private static readonly DEFAULT_SESSION_POLICY: SessionPolicy = "reuse_or_create";

  private client: PromptivdSinkClient | null = null;

  static readonly EVENT_STATE_CHANGE = "statechange" as const;

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

  shouldRestart(): boolean {
    return (this.client != null && this.client.isConnected()) || this.client.isRegistered();
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
    let providerOrAuto: ProviderOrAuto;
    if (!p) providerOrAuto = DEFAULT_PROVIDER;
    else if (!isProviderOrAuto(p)) return this.client?.failJob(id, "Invalid provider");
    else providerOrAuto = p;

    const sp = payload.target?.session_policy;
    let sessionPolicy: SessionPolicy;
    if (!sp) sessionPolicy = PromptivdSinkController.DEFAULT_SESSION_POLICY;
    else if (!isSessionPolicy(sp)) return this.client?.failJob(id, "Invalid session policy");
    else sessionPolicy = sp;

    try {
      const { tabId /*, isNewTab */, provider } = await TabService.findOrCreateProviderTab(
        providerOrAuto,
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
      logger.error("Failed to insert text", { id, error, provider: providerOrAuto, sessionPolicy });
      return this.client?.failJob(id, error);
    }
  };

  private onStateChange = (event: CustomEvent<StateChangeDetail>): void => {
    const { oldState, newState } = event.detail;
    logger.debug("Client state changed", { oldState, newState });

    // Re-emit as controller event for listeners in the same runtime context.
    this.dispatchEvent(
      new CustomEvent<StateChangeDetail>(PromptivdSinkController.EVENT_STATE_CHANGE, {
        detail: event.detail,
      })
    );

    browser.runtime
      .sendMessage(createMessage(MSG.PROMPTIVD_STATUS_CHANGED, { state: newState }))
      .catch(() => {});
  };

  private onConnectionError = (event: CustomEvent<ConnectionErrorDetail>): void => {
    const { error } = event.detail;
    logger.error("Connection error", error);
  };

  private onRegistered = (): void => {
    logger.info("Promptivd sink client registered and ready");
  };
}
