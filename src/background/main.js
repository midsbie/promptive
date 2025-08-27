import { PromptRepository } from "../lib/storage.js";

import { ContentStatusProbe } from "./ContentStatusProbe.js";
import { ContextMenuService } from "./ContextMenuService.js";
import { Handlers } from "./Handlers.js";
import { MessageRouter } from "./MessageRouter.js";
import { TabObserver } from "./TabObserver.js";
import { ToolbarIconService } from "./ToolbarIconService.js";
import { logger } from "./logger.js";

const CONTEXT_MENU_LIMIT = 10;

export class BackgroundApp {
  constructor({
    repo = new PromptRepository(),
    icons = new ToolbarIconService(),
    probe = new ContentStatusProbe(),
  } = {}) {
    this.repo = repo;
    this.icons = icons;
    this.probe = probe;
    this.menus = new ContextMenuService(() => this.repo.getAllPrompts(), CONTEXT_MENU_LIMIT);
    this.router = new MessageRouter(this.repo);
    this.handlers = new Handlers(this.repo, this.menus);
    this.tabObserver = new TabObserver(this.updateTabIcon.bind(this));
    this.isInitialized = false;
  }

  async updateTabIcon(tabId) {
    try {
      const active = await this.probe.isActive(tabId);
      await this.icons.setSupported(tabId, active);
    } catch (e) {
      logger.error("updateTabIcon failed:", e?.stack || e);
    }
  }

  async initialize() {
    if (this.isInitialized) {
      logger.warn("Background already initialized");
      return;
    }

    await this.repo.initialize();
    await this.menus.rebuild();

    this.router.attach();
    this.handlers.attachAll();

    try {
      this.tabObserver.start();

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

new BackgroundApp().initialize().catch((e) => logger.error("Fatal init error:", e?.stack || e));
