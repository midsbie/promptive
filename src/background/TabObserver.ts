import browser, { Tabs } from "webextension-polyfill";

interface UpdateTabFunction {
  (tabId: number): void;
}

export class TabObserver {
  private updateTabFn: UpdateTabFunction;

  constructor(updateTabFn: UpdateTabFunction) {
    this.updateTabFn = updateTabFn;
  }

  start(): void {
    browser.tabs.onUpdated.addListener((tabId: number, info: Tabs.OnUpdatedChangeInfoType, tab: Tabs.Tab) => {
      if (info.status === "complete" && tab?.url) this.updateTabFn(tabId);
    });

    browser.tabs.onActivated.addListener(({ tabId }: Tabs.OnActivatedActiveInfoType) => this.updateTabFn(tabId));

    browser.windows.onFocusChanged.addListener(async (winId: number) => {
      if (winId === browser.windows.WINDOW_ID_NONE) return;
      const [tab] = await browser.tabs.query({ active: true, windowId: winId });
      if (tab?.id) this.updateTabFn(tab.id);
    });
  }
}