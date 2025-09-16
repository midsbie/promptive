import browser from "webextension-polyfill";

import { resolveErrorMessage } from "../lib/error";
import { MSG, createMessage, sendToTab } from "../lib/messaging";
import {
  Provider,
  SessionPolicy,
  isProvider,
  isSessionPolicy,
  mapPlacementToInsertPosition,
} from "../lib/promptivd";

import { InsertTextFrame, PromptivdSinkClient } from "./promptivd-sink/PromptivdSinkClient";

import { TabManager } from "./TabManager";
import { logger } from "./logger";

export class PromptivdSinkController {
  private client: PromptivdSinkClient;
  private tabManager: TabManager;

  constructor() {
    const version = browser.runtime.getManifest()?.version ?? "0.0.0";
    this.client = new PromptivdSinkClient({
      endpoint: "ws://127.0.0.1:8787/v1/sink/ws",
      extensionVersion: version,
      providers: ["chatgpt", "claude", "gemini"],
    });

    this.tabManager = new TabManager();
    this.setupEventListeners();
  }

  initialize(): void {
    this.client.start();
  }

  private setupEventListeners(): void {
    this.client.addEventListener(PromptivdSinkClient.EVENT_INSERT_TEXT, this.onInsertText);
    this.client.addEventListener(PromptivdSinkClient.EVENT_STATE_CHANGE, this.onStateChange);
    this.client.addEventListener(
      PromptivdSinkClient.EVENT_CONNECTION_ERROR,
      this.onConnectionError
    );
    this.client.addEventListener(PromptivdSinkClient.EVENT_REGISTERED, this.onRegistered);
  }

  private onInsertText = async (event: CustomEvent<{ frame: InsertTextFrame }>): Promise<void> => {
    const { frame } = event.detail;
    const { id, payload } = frame;
    const client = this.client;

    logger.info("Received INSERT_TEXT job", {
      id,
      placement: payload.placement,
      source: payload.source,
      target: payload.target,
      metadata: payload.metadata ?? null,
      textPreview: payload.text.slice(0, 120),
      textLength: payload.text.length,
    });

    if (!client) {
      logger.error("Promptivd sink client not initialized", { id });
      return;
    }

    const insertAt = mapPlacementToInsertPosition(payload.placement);
    if (!insertAt) {
      return client.failJob(id, "Invalid placement");
    }

    const p = payload.target?.provider;
    let provider: Provider;
    if (!p) {
      provider = "chatgpt";
    } else if (!isProvider(p)) {
      return client.failJob(id, "Invalid provider");
    } else {
      provider = p;
    }

    const sp = payload.target?.session_policy;
    let sessionPolicy: SessionPolicy;
    if (!sp) {
      sessionPolicy = "reuse_or_create";
    } else if (!isSessionPolicy(sp)) {
      return client.failJob(id, "Invalid session policy");
    } else {
      sessionPolicy = sp;
    }

    try {
      // Find or create the appropriate provider tab based on session policy
      const { tabId, isNewTab } = await this.tabManager.findOrCreateProviderTab(
        provider,
        sessionPolicy
      );
      logger.error(tabId, isNewTab);

      // If we created a new tab, wait for content script to be available
      if (isNewTab) {
        await this.tabManager.waitForContentScript(tabId);
      }

      // Focus the provider's input field
      await this.tabManager.focusProviderInput(tabId, provider);

      // Send the insert text message
      const message = createMessage(MSG.INSERT_TEXT, {
        text: payload.text,
        insertAt,
        provider,
        session_policy: sessionPolicy,
      });

      const response = await sendToTab(tabId, message);
      if (response.error) throw new Error(response.error);

      logger.info("Text insertion successful", { id, tabId, provider, sessionPolicy });
      client.completeJob(id);
    } catch (e) {
      const error = resolveErrorMessage(e);
      logger.error("Failed to insert text", { id, error, provider, sessionPolicy });
      client.failJob(id, error);
    }
  };

  private onStateChange = (event: CustomEvent): void => {
    const { oldState, newState } = event.detail;
    logger.debug("Client state changed", { oldState, newState });
  };

  private onConnectionError = (event: CustomEvent): void => {
    const { error } = event.detail;
    logger.error("Connection error", error);
  };

  private onRegistered = (): void => {
    logger.info("Promptivd sink client registered and ready");
  };
}
