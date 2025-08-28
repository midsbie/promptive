import browser from "webextension-polyfill";

import { MSG, Message, MessageResponse, isMessage } from "../lib/messaging";
import { PromptRepository } from "../lib/storage";

import { logger } from "./logger";

/**
 * Handles messages routed from content scripts or sidebar.
 */
export class MessageRouter {
  private repo: PromptRepository;

  constructor(repo: PromptRepository) {
    this.repo = repo;
  }

  attach(): void {
    browser.runtime.onMessage.addListener(
      async (request: Message): Promise<MessageResponse | void> => {
        if (!isMessage(request)) {
          logger.warn("Ignoring invalid message:", request);
          return;
        }

        switch (request?.action) {
          case MSG.GET_PROMPTS:
            const prompts = await this.repo.getAllPrompts();
            return { prompts };

          case MSG.RECORD_PROMPT_USAGE:
            this.repo.recordUsage((request as Message & { promptId: string }).promptId);
            return;

          default:
            logger.error("Ignoring unhandled message action:", request.action);
            return;
        }
      }
    );
  }
}
