import browser, { Tabs } from "webextension-polyfill";

interface UpdateTabFunction {
  (tabId: number): void;
}

export class TabObserver {
  private updateTabFn: UpdateTabFunction;

  constructor(updateTabFn: UpdateTabFunction) {
    this.updateTabFn = updateTabFn;
  }

  onTabUpdated = async (tabId: number, info: Tabs.OnUpdatedChangeInfoType, tab: Tabs.Tab) => {
    if (info.status === "complete" && tab?.url) {
      this.updateTabFn(tabId);
    }
  };

  onTabActivated = async ({ tabId }: Tabs.OnActivatedActiveInfoType) => {
    this.updateTabFn(tabId);
  };

  onWindowFocusChanged = async (winId: number) => {
    if (winId === browser.windows.WINDOW_ID_NONE) return;

    const [tab] = await browser.tabs.query({ active: true, windowId: winId });
    if (tab?.id) {
      this.updateTabFn(tab.id);
    }
  };
}
