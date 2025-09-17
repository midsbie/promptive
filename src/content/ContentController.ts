import browser from "webextension-polyfill";

import { MSG, Message, MessageResponse, isMessage } from "../lib/messaging";
import { Provider, SessionPolicy, getProviderConfig } from "../lib/promptivd";
import { SearchService } from "../lib/services";
import { InsertPosition, Prompt } from "../lib/storage";

import { CursorPositionManager } from "./CursorPositionManager";
import { PopoverUI } from "./PopoverUI";
import {
  ClipboardWriter,
  ContentEditableStrategy,
  InputTextareaStrategy,
  InsertTextOptions,
  TextInserter,
} from "./TextInserter";
import { logger } from "./logger";
import { BackgroundAPI, ToastService } from "./services";
import { CursorPosition } from "./typedefs";

class Target {
  isAcceptable: (el: Element | null) => boolean;
  element: Element | null = null;
  cursorPosition: CursorPosition | null = null;

  constructor(isAcceptable: (el: unknown) => boolean) {
    this.isAcceptable = isAcceptable;
  }

  remember(el: Element | null): void {
    if (!this.isAcceptable(el)) {
      this.element = null;
      this.cursorPosition = null;
      return;
    }

    this.element = el;
    this.cursorPosition = CursorPositionManager.getPosition(el);
  }

  // Warning: do not clear the target element in this function.
  restore(): boolean {
    if (!this.element?.isConnected) return false;

    try {
      // Focus the element
      const focusableElement = this.element as HTMLElement;
      if (typeof focusableElement.focus === "function") {
        focusableElement.focus();
      }

      // Restore cursor position
      if (this.cursorPosition) {
        CursorPositionManager.setPosition(this.element, this.cursorPosition);
      }

      return true;
    } catch (e) {
      logger.warn("Failed to restore target", e);
      return false;
    }
  }

  clear(): void {
    this.element = null;
    this.cursorPosition = null;
  }
}

export class ContentController {
  private api: BackgroundAPI;
  private target: Target;
  private textInserter: TextInserter;
  private clipboardWriter: ClipboardWriter;
  private popover: PopoverUI | null = null;

  constructor() {
    this.api = new BackgroundAPI();
    this.target = new Target((el: Element | null) => this.textInserter.canHandle(el));

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
        this.target.remember(document.activeElement);
        await this._insertPrompt(message.prompt);
        this.target.clear();
        return;

      case MSG.INSERT_TEXT: {
        this.popover?.close();
        this.target.remember(document.activeElement);
        const ok = this._handleInsertText(message.text, message.insertAt);
        this.target.clear();
        return ok;
      }

      case MSG.FOCUS_PROVIDER_INPUT: {
        return this._handleFocusProviderInput(message.provider);
      }

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
    this.target.remember(document.activeElement);

    const prompts = await this.api.getPrompts();

    // Lazy init popover to wire handlers with dependencies
    this.popover = new PopoverUI({
      searchFn: new SearchService().search,
      onSelect: async (prompt: Prompt) => {
        await this.api.recordUsage(prompt.id);
        this.target.restore();
        await this._insertPrompt(prompt);
        this.popover?.close(); // will trigger onClose
      },
      onClose: () => {
        this.target.restore();
        this.target.clear();
        this.popover = null;
      },
    });

    this.popover.open(prompts);
  }

  private async _insertPrompt(prompt: Prompt): Promise<void> {
    const opts: InsertTextOptions = {
      target: this.target.element,
      content: prompt.content,
      insertAt: prompt.insert_at || "cursor",
      separator: prompt.separator || null,
    };
    await this._insert(opts);
  }

  private async _insert(opts: InsertTextOptions) {
    if (this.textInserter.insert(opts)) {
      ToastService.show("Prompt inserted");
      return;
    }

    logger.warn(`Failed to insert prompt: copying to clipboard instead`);
    await this._copyToClipboard(opts.content);
  }

  private async _copyToClipboard(text: string) {
    await this.clipboardWriter.write(text);

    try {
      ToastService.show("Copied to clipboard");
    } catch (e) {
      logger.error("Error during copy to clipboard:", e);
      ToastService.show("Failed to copy to clipboard");
    }
  }

  private async _handleInsertText(
    text: string,
    insertAt?: InsertPosition
  ): Promise<{ error: string | null }> {
    try {
      const target = this.target.element || document.activeElement;
      if (!this.textInserter.canHandle(target)) {
        return { error: "No suitable text insertion target found" };
      }

      const opts: InsertTextOptions = {
        target,
        content: text,
        insertAt: insertAt || "cursor",
      };
      if (!this.textInserter.insert(opts)) {
        return { error: "Failed to insert text into target element" };
      }

      logger.info("Text insertion successful");

      return { error: null };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Error in _handleInsertText:", error);
      return { error: errorMessage };
    }
  }

  private async _handleFocusProviderInput(provider: Provider): Promise<{ error: string | null }> {
    try {
      const config = getProviderConfig(provider);
      const inputElement = document.querySelector(config.inputSelector) as HTMLElement;

      if (!inputElement) {
        return { error: `Provider input element not found for ${provider}` };
      }

      // Focus the input element
      inputElement.focus();

      // If it's a contenteditable element, also set cursor position
      if (inputElement.isContentEditable) {
        const selection = window.getSelection();
        if (selection) {
          const range = document.createRange();
          range.selectNodeContents(inputElement);
          range.collapse(false); // Place cursor at end
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }

      logger.info("Successfully focused provider input", { provider });
      return { error: null };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Error focusing provider input:", { provider, error });
      return { error: errorMessage };
    }
  }
}
