import { MSG, isMessage } from "../shared/messaging.js";

import { logger } from "./logger.js";

/**
 * Handles messages routed from content scripts or sidebar.
 */
export class MessageRouter {
  constructor(repo) {
    this.repo = repo;
  }

  attach() {
    browser.runtime.onMessage.addListener((request, _sender) => {
      if (!isMessage(request)) {
        logger.warn("Ignoring invalid message:", request);
        return;
      }

      switch (request?.type) {
        case MSG.GET_PROMPTS:
          return this.repo.getAllPrompts();
        case MSG.RECORD_PROMPT_USAGE:
          return this.repo.recordUsage(request.promptId);
        default:
          return false;
      }
    });
  }
}
