import { PromptRepository } from "../shared/storage.js";

import { ContextMenuService } from "./ContextMenuService.js";
import { Handlers } from "./Handlers.js";
import { MessageRouter } from "./MessageRouter.js";
import { logger } from "./logger.js";

const CONTEXT_MENU_LIMIT = 10;
let isInitialized = false;

async function initialize() {
  if (isInitialized) {
    logger.warn("Background already initialized");
    return;
  }

  const repo = new PromptRepository();
  await repo.initialize();
  const menus = new ContextMenuService(() => repo.getAllPrompts(), CONTEXT_MENU_LIMIT);
  await menus.rebuild();
  const router = new MessageRouter(repo);
  router.attach();
  const handlers = new Handlers(repo, menus);
  handlers.attachAll();
  isInitialized = true;
  logger.info("initialized");
}

initialize().catch((e) => {
  logger.error("Fatal init error:", e?.stack || e);
});
