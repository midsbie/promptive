export class TabObserver {
  constructor(updateTabFn) {
    this.updateTabFn = updateTabFn;
  }

  start() {
    browser.tabs.onUpdated.addListener((tabId, info, tab) => {
      if (info.status === "complete" && tab?.url) this.updateTabFn(tabId);
    });

    browser.tabs.onActivated.addListener(({ tabId }) => this.updateTabFn(tabId));

    browser.windows.onFocusChanged.addListener(async (winId) => {
      if (winId === browser.windows.WINDOW_ID_NONE) return;
      const [tab] = await browser.tabs.query({ active: true, windowId: winId });
      if (tab?.id) this.updateTabFn(tab.id);
    });
  }
}
