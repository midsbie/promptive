import browser, { Menus, Runtime, Storage, Tabs } from "webextension-polyfill";

import { resolveErrorMessage } from "../lib/error";
import { Message } from "../lib/messaging";
import { AppSettings, SettingsRepository } from "../lib/settings";
import { PromptRepository } from "../lib/storage";

import { BackgroundEventHandlers } from "./BackgroundEventHandlers";
import { ContextMenuService } from "./ContextMenuService";
import { MessageRouter } from "./MessageRouter";
import { PromptivdSinkController } from "./PromptivdSinkController";
import { TabObserver } from "./TabObserver";
import { logger } from "./logger";

interface BackgroundAppOptions {
  promptsRepo?: PromptRepository;
  settingsRepo?: SettingsRepository;
}

export class BackgroundApp {
  private promptsRepo: PromptRepository;
  private settingsRepo: SettingsRepository;
  private menus: ContextMenuService;
  private router: MessageRouter;
  private handlers: BackgroundEventHandlers | null = null;
  private tabObserver: TabObserver;
  private promptivdSinkCtl: PromptivdSinkController;
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

    this.settingsRepo.addEventListener(
      SettingsRepository.EVENT_SETTINGS_CHANGED,
      this.onSettingsChange
    );

    await this.promptsRepo.initialize();
    await this.applySettings();

    this.isInitialized = true;
    logger.info("initialized");
  }

  async applySettings(): Promise<AppSettings> {
    await this.settingsRepo.initialize();
    const settings = Object.freeze({ ...this.settingsRepo.get() });

    this.menus = new ContextMenuService(
      () => this.promptsRepo.getAllPrompts(),
      settings.contextMenu
    );

    this.handlers = new BackgroundEventHandlers(this.promptsRepo, this.menus);
    this.tabObserver = new TabObserver(this.handlers.onTabUpdated);

    try {
      if (this.promptivdSinkCtl?.shouldReinitialize(settings)) {
        this.promptivdSinkCtl.destroy();
        this.promptivdSinkCtl = null;
      }

      if (this.promptivdSinkCtl == null) {
        this.promptivdSinkCtl = new PromptivdSinkController();
        this.promptivdSinkCtl.initialize(settings);
      }
    } catch (e) {
      logger.error("Failed to initialize PromptivdSinkController:", e);
    }

    await this.menus.rebuild();

    logger.info("Settings applied");
    return settings;
  }

  onSettingsChange = (): void => {
    this.applySettings().catch((e) => {
      logger.error("Failed to re-initialize on settings change", e);
    });
  };

  onInstalled(): void {
    logger.info("Extension installed");
  }

  onMessage(
    request: Message,
    _sender: Runtime.MessageSender,
    reply: (response: unknown) => void
  ): true {
    this.router
      .onMessage(request)
      .then(reply)
      .catch((e) => {
        logger.error("Error in onMessage handler:", e);
        reply({ error: resolveErrorMessage(e) });
      });

    return true;
  }

  onStorageChanged(changes: Record<string, Storage.StorageChange>, area: string): void {
    // The handlers object is null until applySettings is called, however PromptRepository causes
    // two storage change events in quick succession during this time, causing two errors, which we
    // must guard against.
    this.handlers?.onStorageChanged(changes, area).catch((e) => {
      logger.error("Error in onStorageChanged handler:", e);
    });
  }

  onActionClicked(tab: Tabs.Tab): void {
    this.handlers.onActionClicked(tab).catch((e) => {
      logger.error("Error in onActionClicked handler:", e);
    });
  }

  onCommand(command: string): void {
    this.handlers.onCommand(command).catch((e) => {
      logger.error("Error in onCommand handler:", e);
    });
  }

  onContextMenuClick(info: Menus.OnClickData, tab?: Tabs.Tab): void {
    this.handlers.onContextMenuClick(info, tab).catch((e) => {
      logger.error("Error in onContextMenuClick handler:", e);
    });
  }

  onTabUpdated(tabId: number, info: Tabs.OnUpdatedChangeInfoType, tab: Tabs.Tab): void {
    this.tabObserver.onTabUpdated(tabId, info, tab).catch((e) => {
      logger.error("Error in onTabUpdated handler:", e);
    });
  }

  onTabActivated(info: Tabs.OnActivatedActiveInfoType): void {
    this.tabObserver.onTabActivated(info).catch((e) => {
      logger.error("Error in onTabActivated handler:", e);
    });
  }

  onWindowFocusChanged(winId: number): void {
    this.tabObserver.onWindowFocusChanged(winId).catch((e) => {
      logger.error("Error in onWindowFocusChanged handler:", e);
    });
  }
}

const app = new BackgroundApp();
app.initialize().catch((e) => logger.error("Fatal init error:", e));

// This pattern should make it easy to migrate to a service worker in the future if needed.
browser.action.onClicked.addListener((tab) => app.onActionClicked(tab));
browser.commands.onCommand.addListener((command) => app.onCommand(command));
browser.contextMenus.onClicked.addListener((info, tab) => app.onContextMenuClick(info, tab));
browser.runtime.onInstalled.addListener(() => app.onInstalled());
browser.storage.onChanged.addListener((changes, area) => app.onStorageChanged(changes, area));
browser.tabs.onActivated.addListener((info) => app.onTabActivated(info));
browser.tabs.onUpdated.addListener((tabId, info, tab) => app.onTabUpdated(tabId, info, tab));
browser.windows.onFocusChanged.addListener((winId) => app.onWindowFocusChanged(winId));

browser.runtime.onMessage.addListener(
  (request: Message, sender: Runtime.MessageSender, reply: (response: unknown) => void): true =>
    app.onMessage(request, sender, reply)
);
