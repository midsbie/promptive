import browser, { Menus, Runtime, Storage, Tabs } from "webextension-polyfill";

import { Message } from "../lib/messaging";
import { AppSettings, SettingsRepository } from "../lib/settings";
import { PromptRepository } from "../lib/storage";

import { ContextMenuService } from "./ContextMenuService";
import { Handlers } from "./Handlers";
import { MessageRouter } from "./MessageRouter";
import { TabObserver } from "./TabObserver";
import { logger } from "./logger";

interface BackgroundAppOptions {
  promptsRepo?: PromptRepository;
  settingsRepo?: SettingsRepository;
}

export class BackgroundApp {
  private promptsRepo: PromptRepository;
  private settingsRepo: SettingsRepository;
  private settings: AppSettings;
  private menus: ContextMenuService;
  private router: MessageRouter;
  private handlers: Handlers;
  private tabObserver: TabObserver;
  private isInitialized: boolean = false;

  // Services that depend on settings are initialized in `initialize()`. Calling handlers before
  // `initialize` results in unspecified behavior.
  constructor({
    promptsRepo = new PromptRepository(),
    settingsRepo = new SettingsRepository(),
  }: BackgroundAppOptions = {}) {
    this.promptsRepo = promptsRepo;
    this.settingsRepo = settingsRepo;

    this.router = new MessageRouter(this.promptsRepo);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn("Background already initialized");
      return;
    }

    await this.promptsRepo.initialize();
    await this.applySettings();

    this.isInitialized = true;
    logger.info("initialized");
  }

  async applySettings(): Promise<void> {
    this.handlers?.removeEventListener(Handlers.EVENT_SETTINGS_CHANGE, this.onSettingsChange);

    await this.settingsRepo.initialize();
    this.settings = this.settingsRepo.get();

    // Now that settings are loaded, create services that depend on them
    this.menus = new ContextMenuService(
      () => this.promptsRepo.getAllPrompts(),
      this.settings.contextMenu
    );

    this.handlers = new Handlers(this.promptsRepo, this.menus);
    this.handlers.addEventListener(Handlers.EVENT_SETTINGS_CHANGE, this.onSettingsChange);
    this.tabObserver = new TabObserver(this.handlers.onTabUpdated);

    await this.menus.rebuild();
    logger.info("Settings applied");
  }

  onSettingsChange = (): void => {
    this.applySettings().catch((e) => {
      logger.error("Failed to re-initialize on settings change", e);
    });
  };

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

// This pattern should make it easy to migrate to a service worker in the future if needed.
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
