import browser from "webextension-polyfill";

import { MSG, createMessage, sendToTab } from "../lib/messaging";
import { Provider, SessionPolicy, getProviderConfig, isProviderTab } from "../lib/promptivd";

import { logger } from "./logger";

export class TabManager {
  async findOrCreateProviderTab(
    provider: Provider,
    sessionPolicy: SessionPolicy
  ): Promise<{ tabId: number; isNewTab: boolean }> {
    switch (sessionPolicy) {
      case "reuse_only": {
        const activeTab = await this.getActiveTabForProvider(provider);
        if (activeTab) return { tabId: activeTab.id!, isNewTab: false };
        throw new Error(`Active tab cannot be reused (not ${provider})`);
      }

      case "reuse_or_create":
      default: {
        const activeTab = await this.getActiveTabForProvider(provider);
        if (activeTab) return { tabId: activeTab.id!, isNewTab: false };

        // Purposely letting execution fall through to create a new tab
      }

      case "start_fresh": {
        const newTab = await this.createNewProviderTab(provider);
        return { tabId: newTab.id!, isNewTab: true };
      }
    }
  }

  private async getActiveTabForProvider(provider: Provider): Promise<browser.Tabs.Tab | null> {
    const activeTab = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = activeTab[0];
    if (!tab || !tab.id) throw new Error("No active tab found");

    logger.error("Active tab", tab.id, tab.url, provider);
    if (tab.url && isProviderTab(tab.url, provider)) return tab;

    return null;
  }

  private async findProviderTab(provider: Provider): Promise<browser.Tabs.Tab | null> {
    const tabs = await browser.tabs.query({});

    for (const tab of tabs) {
      if (tab.url && isProviderTab(tab.url, provider)) {
        return tab;
      }
    }

    return null;
  }

  private async createNewProviderTab(provider: Provider): Promise<browser.Tabs.Tab> {
    const config = getProviderConfig(provider);
    const url = new URL(config.newChatPath, config.baseUrl).toString();
    const tab = await browser.tabs.create({ url, active: true });
    if (!tab.id) throw new Error("Failed to create new tab");

    logger.info(`Created new ${provider} tab`, { tabId: tab.id, url });
    return tab;
  }

  async waitForContentScript(
    tabId: number,
    opts: { timeoutMs: number; waitForReady: boolean } | null
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

  async focusProviderInput(tabId: number, provider: Provider): Promise<void> {
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
