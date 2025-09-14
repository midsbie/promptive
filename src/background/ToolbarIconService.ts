import browser from "webextension-polyfill";

type IconPaths = Record<string, string>;

const ACTIVE: IconPaths = {
  "16": "icons/icon-16.svg",
  "32": "icons/icon-32.svg",
  "48": "icons/icon-48.svg",
  "96": "icons/icon-96.svg",
  "128": "icons/icon-128.svg",
};

const INACTIVE: IconPaths = {
  "16": "icons/icon-16-inactive.svg",
  "32": "icons/icon-32-inactive.svg",
  "48": "icons/icon-48-inactive.svg",
  "96": "icons/icon-96-inactive.svg",
  "128": "icons/icon-128-inactive.svg",
};

export class ToolbarIconService {
  // Currently not in use
  async setSupported(tabId: number, supported: boolean): Promise<void> {
    await browser.action.setIcon({ tabId, path: supported ? ACTIVE : INACTIVE });
  }
}
