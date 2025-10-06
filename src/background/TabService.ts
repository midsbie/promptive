import browser from "webextension-polyfill";

import { MSG, createMessage, sendToTab } from "../lib/messaging";
import { SessionPolicy } from "../lib/promptivd";
import {
  Provider,
  ProviderOrAuto,
  detectProvider,
  getProviderConfig,
  isAutoProvider,
  isTabFromProvider,
  resolveProvider,
} from "../lib/providers";

import { logger } from "./logger";

export class TabService {
  static async getActiveTab(): Promise<browser.Tabs.Tab | null | undefined> {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      return tabs[0];
    } catch {
      logger.warn("Failed to get active tab");
      return null;
    }
  }

  static async findOrCreateProviderTab(
    providerOrAuto: ProviderOrAuto,
    sessionPolicy: SessionPolicy
  ): Promise<{ tabId: number; isNewTab: boolean; provider: Provider }> {
    switch (sessionPolicy) {
      case "reuse_only": {
        try {
          const { tab, provider } = await this.getActiveTabForProvider(providerOrAuto);
          return { tabId: tab.id, isNewTab: false, provider };
        } catch {}
        throw new Error(`Active tab cannot be reused for ${providerOrAuto})`);
      }

      case "reuse_or_create":
      default: {
        try {
          const r = await this.getActiveTabForProvider(providerOrAuto);
          if (r) return { tabId: r.tab.id!, isNewTab: false, provider: r.provider };
        } catch {}
        break;
      }

      case "start_fresh":
        break;
    }

    const provider = resolveProvider(providerOrAuto);
    const newTab = await this.createNewProviderTab(provider);
    return { tabId: newTab.id, isNewTab: true, provider };
  }

  private static async getActiveTabForProvider(
    providerOrAuto: ProviderOrAuto
  ): Promise<{ tab: browser.Tabs.Tab; provider: Provider } | null> {
    const activeTab = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = activeTab[0];
    if (!tab || !tab.id) throw new Error("No active tab found");

    logger.error("Active tab", tab.id, tab.url, providerOrAuto);
    if (isAutoProvider(providerOrAuto)) {
      const provider = detectProvider(tab.url);
      if (provider == null) return null;
      return { tab, provider };
    } else if (!isTabFromProvider(tab.url, providerOrAuto)) {
      return null;
    }

    return { tab, provider: providerOrAuto };
  }

  private static async findProviderTab(provider: Provider): Promise<browser.Tabs.Tab | null> {
    const tabs = await browser.tabs.query({});

    for (const tab of tabs) {
      if (tab.url && isTabFromProvider(tab.url, provider)) {
        return tab;
      }
    }

    return null;
  }

  private static async createNewProviderTab(provider: Provider): Promise<browser.Tabs.Tab> {
    const config = getProviderConfig(provider);
    const url = new URL(config.newChatPath, config.baseUrl).toString();
    const tab = await browser.tabs.create({ url, active: true });
    if (!tab.id) throw new Error("Failed to create new tab");

    logger.info(`Created new ${provider} tab`, { tabId: tab.id, url });
    return tab;
  }

  static async waitForContentScript(
    tabId: number,
    opts?: Partial<{ timeoutMs: number; waitForReady: boolean }> | null
  ): Promise<void> {
    const { timeoutMs = 10000, waitForReady = false } = opts ?? {};
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const response = await sendToTab(tabId, createMessage(MSG.QUERY_STATUS));
        if (response.active && (!waitForReady || response.ready)) {
          logger.info("Content script is ready", { tabId, ready: response.ready });
          return;
        }
      } catch {
        // Content script not ready yet, continue waiting
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error(`Content script not available within ${timeoutMs}ms`);
  }

  static async focusProviderInput(tabId: number, provider: Provider): Promise<void> {
    try {
      const response = await sendToTab(
        tabId,
        createMessage(MSG.FOCUS_PROVIDER_INPUT, { provider })
      );
      if (response.error) {
        throw new Error(response.error);
      }
      logger.info("Successfully focused provider input", { tabId, provider });
    } catch (e) {
      logger.error("Failed to focus provider input", { tabId, provider, error: e });
      throw e;
    }
  }
}
