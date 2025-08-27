import { MSG, isMessage, Message } from "../lib/messaging.js";
import { PromptRepository } from "../lib/storage.js";

import { logger } from "./logger.js";

/**
 * Handles messages routed from content scripts or sidebar.
 */
export class MessageRouter {
  private repo: PromptRepository;

  constructor(repo: PromptRepository) {
    this.repo = repo;
  }

  attach(): void {
    browser.runtime.onMessage.addListener((request: any, _sender: browser.runtime.MessageSender) => {
      if (!isMessage(request)) {
        logger.warn("Ignoring invalid message:", request);
        return;
      }

      switch (request?.type) {
        case MSG.GET_PROMPTS:
          return this.repo.getAllPrompts();
        case MSG.RECORD_PROMPT_USAGE:
          return this.repo.recordUsage((request as Message & { promptId: string }).promptId);
        default:
          return false;
      }
    });
  }
}