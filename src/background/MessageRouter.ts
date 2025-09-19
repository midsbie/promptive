import { MSG, Message, MessageResponse, isMessage } from "../lib/messaging";
import { PromptRepository } from "../lib/storage";

import { PromptivdSinkController } from "./PromptivdSinkController";
import { logger } from "./logger";

/**
 * Handles messages routed from content scripts or sidebar.
 */
export class MessageRouter {
  private repo: PromptRepository;
  private promptivdSinkCtl: PromptivdSinkController;

  constructor(repo: PromptRepository, promptivdSinkCtl: PromptivdSinkController) {
    this.repo = repo;
    this.promptivdSinkCtl = promptivdSinkCtl;
  }

  onMessage = async (request: Message): Promise<MessageResponse | void> => {
    if (!isMessage(request)) {
      logger.warn("Ignoring invalid message:", request);
      return;
    }

    switch (request?.action) {
      case MSG.GET_PROMPTS:
        return { prompts: await this.repo.getAllPrompts() };

      case MSG.RECORD_PROMPT_USAGE:
        this.repo.recordUsage((request as Message & { promptId: string }).promptId);
        return;

      case MSG.PROMPTIVD_GET_STATUS:
        return { state: this.promptivdSinkCtl.getStatus() };

      case MSG.PROMPTIVD_START:
        this.promptivdSinkCtl.start();
        return;

      case MSG.PROMPTIVD_STOP:
        this.promptivdSinkCtl.stop();
        return;

      default:
        logger.error("Ignoring unhandled message action:", request.action);
        return;
    }
  };
}
