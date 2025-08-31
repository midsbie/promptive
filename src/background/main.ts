import browser, { Menus, Storage, Tabs } from "webextension-polyfill";

import { PromptRepository } from "../lib/storage";

import { ContentStatusProbe } from "./ContentStatusProbe";
import { ContextMenuService } from "./ContextMenuService";
import { Handlers } from "./Handlers";
import { MessageRouter } from "./MessageRouter";
import { TabObserver } from "./TabObserver";
import { ToolbarIconService } from "./ToolbarIconService";
import { logger } from "./logger";

const CONTEXT_MENU_LIMIT = 10;

interface BackgroundAppOptions {
  repo?: PromptRepository;
  icons?: ToolbarIconService;
  probe?: ContentStatusProbe;
}

export class BackgroundApp {
  private repo: PromptRepository;
  private icons: ToolbarIconService;
  private probe: ContentStatusProbe;
  private menus: ContextMenuService;
  private router: MessageRouter;
  handlers: Handlers;
  tabObserver: TabObserver;
  private isInitialized: boolean = false;

  constructor({
    repo = new PromptRepository(),
    icons = new ToolbarIconService(),
    probe = new ContentStatusProbe(),
  }: BackgroundAppOptions = {}) {
    this.repo = repo;
    this.icons = icons;
    this.probe = probe;
    this.menus = new ContextMenuService(() => this.repo.getAllPrompts(), CONTEXT_MENU_LIMIT);
    this.router = new MessageRouter(this.repo);
    this.handlers = new Handlers(this.repo, this.menus);
    this.tabObserver = new TabObserver(this.updateTabIcon.bind(this));
  }

  async updateTabIcon(tabId: number): Promise<void> {
    try {
      const active = await this.probe.isActive(tabId);
      await this.icons.setSupported(tabId, active);
    } catch (e) {
      logger.error("updateTabIcon failed:", e?.stack || e);
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn("Background already initialized");
      return;
    }

    await this.repo.initialize();
    await this.menus.rebuild();

    this.router.attach();

    try {
      // Initialize for current active tab on startup
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) await this.updateTabIcon(tab.id);
    } catch (e) {
      logger.error("Failed to initialize icon service or tab observer:", e?.stack || e);
    }

    this.isInitialized = true;
    logger.info("initialized");
  }
}

const app = new BackgroundApp();
app.initialize().catch((e) => logger.error("Fatal init error:", e?.stack || e));

browser.runtime.onInstalled.addListener(() => {
  logger.info("Extension installed");
});

browser.storage.onChanged.addListener(
  (changes: Record<string, Storage.StorageChange>, area: string) => {
    app.handlers.onStorageChanged(changes, area).catch((e) => {
      logger.error("Error in onStorageChanged handler:", e?.stack || e);
    });
  }
);

browser.action.onClicked.addListener((tab: Tabs.Tab) => {
  app.handlers.onActionClicked(tab).catch((e) => {
    logger.error("Error in onActionClicked handler:", e?.stack || e);
  });
});

browser.commands.onCommand.addListener((command: string) => {
  app.handlers.onCommand(command).catch((e) => {
    logger.error("Error in onCommand handler:", e?.stack || e);
  });
});

browser.contextMenus.onClicked.addListener((info: Menus.OnClickData, tab?: Tabs.Tab) => {
  app.handlers.onContextMenuClick(info, tab).catch((e) => {
    logger.error("Error in onContextMenuClick handler:", e?.stack || e);
  });
});

browser.tabs.onUpdated.addListener(
  (tabId: number, info: Tabs.OnUpdatedChangeInfoType, tab: Tabs.Tab) => {
    app.tabObserver.onTabUpdated(tabId, info, tab);
  }
);

browser.tabs.onActivated.addListener((info: Tabs.OnActivatedActiveInfoType) => {
  app.tabObserver.onTabActivated(info);
});

browser.windows.onFocusChanged.addListener((winId: number) => {
  app.tabObserver.onWindowFocusChanged(winId).catch((e) => {
    logger.error("Error in onWindowFocusChanged handler:", e?.stack || e);
  });
});
