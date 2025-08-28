import browser from "webextension-polyfill";

import { MSG, Message, MessageResponse, isMessage } from "../lib/messaging";
import { FuzzySearch } from "../lib/search";
import { Prompt } from "../lib/storage";

import { CursorPositionManager } from "./CursorPositionManager";
import { PopoverUI } from "./PopoverUI";
import {
  ClipboardWriter,
  ContentEditableStrategy,
  InputTextareaStrategy,
  TextInserter,
} from "./TextInserter";
import { logger } from "./logger";
import { BackgroundAPI, ToastService } from "./services";
import { CursorPosition } from "./typedefs";

export class ContentController {
  private api: BackgroundAPI;
  private textInserter: TextInserter;
  private clipboardWriter: ClipboardWriter;
  private popover: PopoverUI | null = null;
  private targetElement: Element | null = null;
  private targetCursorPosition: CursorPosition = null;

  constructor() {
    this.api = new BackgroundAPI();

    this.textInserter = new TextInserter([
      new InputTextareaStrategy(),
      new ContentEditableStrategy(),
    ]);

    this.clipboardWriter = new ClipboardWriter();
    browser.runtime.onMessage.addListener(this._onRuntimeMessage);

    logger.info("initialized");
  }

  private _onRuntimeMessage = async (message: Message): Promise<MessageResponse | void> => {
    if (!isMessage(message)) {
      logger.warn("Ignoring non-message:", message);
      return;
    }

    switch (message.action) {
      case MSG.QUERY_STATUS:
        return Promise.resolve({ active: true });

      case MSG.OPEN_POPOVER:
        await this.openPopover();
        return;

      case MSG.INSERT_PROMPT:
        // Direct insertion path (bypassing popover)
        this._rememberTarget(document.activeElement);
        this._insertAndNotify(message.prompt.content);
        this._clearTarget();
        return;

      default:
        logger.warn("Unknown message:", message);
        return;
    }
  };

  async openPopover(): Promise<void> {
    if (this.popover) {
      logger.warn("Refusing to open popover: already open");
      return;
    }

    // Remember where to insert *before* opening UI
    this._rememberTarget(document.activeElement);

    const prompts = await this.api.getPrompts();

    // Lazy init popover to wire handlers with dependencies
    this.popover = new PopoverUI({
      searchFn: new FuzzySearch().search,
      onSelect: async (prompt: Prompt) => {
        await this.api.recordUsage(prompt.id);
        this._restoreTarget();
        this._insertAndNotify(prompt.content);
        this.popover?.close(); // will trigger onClose
      },
      onClose: () => {
        this._restoreTarget();
        this._clearTarget();
        this.popover = null;
      },
    });

    this.popover.open(prompts);
  }

  private _insertAndNotify(text: string): void {
    const target = this.targetElement;
    const ok = this.textInserter.insert(target, text);
    if (ok) {
      ToastService.show("Prompt inserted");
      return;
    }

    this.clipboardWriter.write(text);
    ToastService.show("Copied to clipboard");
  }

  private _rememberTarget(el: Element | null): void {
    const acceptable = this.textInserter.canHandle(el);
    if (!acceptable) {
      this.targetElement = null;
      this.targetCursorPosition = null;
      return;
    }

    this.targetElement = el;
    this.targetCursorPosition = CursorPositionManager.getPosition(el);
  }

  private _restoreTarget(): boolean {
    if (!this.targetElement?.isConnected) {
      return false;
    }

    try {
      // Focus the element
      const focusableElement = this.targetElement as HTMLElement;
      if (typeof focusableElement.focus === "function") {
        focusableElement.focus();
      }

      // Restore cursor position
      if (this.targetCursorPosition) {
        CursorPositionManager.setPosition(this.targetElement, this.targetCursorPosition);
      }

      return true;
    } catch (e) {
      logger.warn("Failed to restore target", e);
      return false;
    }
  }

  private _clearTarget(): void {
    this.targetElement = null;
    this.targetCursorPosition = null;
  }
}
