import browser, { Menus, Runtime, Storage, Tabs } from "webextension-polyfill";

import { Message } from "../lib/messaging";
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
  private handlers: Handlers;
  private tabObserver: TabObserver;
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
      logger.error("updateTabIcon failed:", e);
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn("Background already initialized");
      return;
    }

    await this.repo.initialize();
    await this.menus.rebuild();

    try {
      // Initialize for current active tab on startup
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) await this.updateTabIcon(tab.id);
    } catch (e) {
      logger.error("Failed to initialize icon service or tab observer:", e);
    }

    this.isInitialized = true;
    logger.info("initialized");
  }

  // Event handler methods
  // These provide controlled access to private properties while maintaining MV3 compatibility

  handleInstalled(): void {
    logger.info("Extension installed");
  }

  handleMessage(
    request: Message,
    _sender: Runtime.MessageSender,
    reply: (response: unknown) => void
  ): true {
    this.router
      .onMessage(request)
      .then(reply)
      .catch((e) => {
        logger.error("Error in onMessage handler:", e);
      });

    return true;
  }

  handleStorageChanged(changes: Record<string, Storage.StorageChange>, area: string): void {
    this.handlers.onStorageChanged(changes, area).catch((e) => {
      logger.error("Error in onStorageChanged handler:", e);
    });
  }

  handleActionClicked(tab: Tabs.Tab): void {
    this.handlers.onActionClicked(tab).catch((e) => {
      logger.error("Error in onActionClicked handler:", e);
    });
  }

  handleCommand(command: string): void {
    this.handlers.onCommand(command).catch((e) => {
      logger.error("Error in onCommand handler:", e);
    });
  }

  handleContextMenuClick(info: Menus.OnClickData, tab?: Tabs.Tab): void {
    this.handlers.onContextMenuClick(info, tab).catch((e) => {
      logger.error("Error in onContextMenuClick handler:", e);
    });
  }

  handleTabUpdated(tabId: number, info: Tabs.OnUpdatedChangeInfoType, tab: Tabs.Tab): void {
    this.tabObserver.onTabUpdated(tabId, info, tab).catch((e) => {
      logger.error("Error in onTabUpdated handler:", e);
    });
  }

  handleTabActivated(info: Tabs.OnActivatedActiveInfoType): void {
    this.tabObserver.onTabActivated(info).catch((e) => {
      logger.error("Error in onTabActivated handler:", e);
    });
  }

  handleWindowFocusChanged(winId: number): void {
    this.tabObserver.onWindowFocusChanged(winId).catch((e) => {
      logger.error("Error in onWindowFocusChanged handler:", e);
    });
  }
}

const app = new BackgroundApp();
app.initialize().catch((e) => logger.error("Fatal init error:", e));

// Top-level event handlers for Manifest V3 compatibility
// -------------------------------------------------------------------------------------------------
// Manifest V3 requires all extension event listeners to be registered synchronously at the script's
// top level. This allows the browser to detect which events should wake the service worker from its
// dormant state.
//
// To balance this requirement with proper encapsulation, we use thin wrapper methods on the
// BackgroundApp instance.  These `handleEvent` methods provide controlled access to the private
// internal components (`router`, `handlers`, `tabObserver`) without exposing them directly.
//
// Alternative patterns considered:
// - Event bus: the best design but would add complexity

browser.runtime.onInstalled.addListener(() => app.handleInstalled());
browser.storage.onChanged.addListener((changes, area) => app.handleStorageChanged(changes, area));
browser.action.onClicked.addListener((tab) => app.handleActionClicked(tab));
browser.commands.onCommand.addListener((command) => app.handleCommand(command));
browser.contextMenus.onClicked.addListener((info, tab) => app.handleContextMenuClick(info, tab));
browser.tabs.onUpdated.addListener((tabId, info, tab) => app.handleTabUpdated(tabId, info, tab));
browser.tabs.onActivated.addListener((info) => app.handleTabActivated(info));
browser.windows.onFocusChanged.addListener((winId) => app.handleWindowFocusChanged(winId));

browser.runtime.onMessage.addListener(
  (request: Message, sender: Runtime.MessageSender, reply: (response: unknown) => void): true =>
    app.handleMessage(request, sender, reply)
);
