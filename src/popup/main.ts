import browser from "webextension-polyfill";

import { MSG, createMessage } from "../lib/messaging";

import { logger } from "./logger";

/**
 * Checks if the content script is active on the current tab and updates the popup UI.
 */
async function checkStatus(): Promise<void> {
  const statusTextEl = document.getElementById("status-text");
  const statusIndicatorEl = document.getElementById("status-indicator");

  if (!statusTextEl || !statusIndicatorEl) {
    logger.error("Popup DOM not found");
    return;
  }

  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      throw new Error("No active tab identified.");
    }

    // A successful response means the content script is ready.
    await browser.tabs.sendMessage(tab.id, createMessage(MSG.QUERY_STATUS));

    statusTextEl.textContent = "Active on this page";
    statusIndicatorEl.classList.add("active");
  } catch (e: any) {
    // An error means no content script replied, so the page is not supported.
    statusTextEl.textContent = "Not supported on this page";
    statusIndicatorEl.classList.add("inactive");
    logger.info(`Promptive not active on this tab: ${e.message}`);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  checkStatus();
});
