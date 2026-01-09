import { InsertPosition } from "../lib/storage";
import { HTMLEscaper } from "../lib/string";

import { CaretPositioner } from "./CaretPositioner";
import { logger } from "./logger";

export type InsertTextOptions = {
  target: Element | null;
  content: string;
  insertAt: InsertPosition;
  separator?: string;
};

const toParagraphHtml = (text: string): string => {
  // Convert plaintext with newlines into <p> blocks, preserving empty lines
  return text
    .split("\n")
    .map((line) => (line.trim() === "" ? "<p><br></p>" : `<p>${HTMLEscaper.escape(line)}</p>`))
    .join("");
};

// Assumes separator is not empty, not whitespace and not multiline.
const wrapSeparator = (sep: string): string => "\n" + sep + "\n";

const buildInsertText = (opts: InsertTextOptions): string => {
  let text = opts.content.trim();
  let sep = opts.separator?.trim() || "";
  if (!sep) return text;

  sep = wrapSeparator(sep);

  const { insertAt } = opts;
  if (insertAt === "top") return text + sep;

  // "end" or "cursor"
  text = sep + text;

  if (insertAt === "cursor") return text + sep;
  return text;
};

export abstract class InsertionStrategy {
  abstract canHandle(element: Element | null): boolean;
  abstract insert(opts: InsertTextOptions): boolean;
}

export class InputTextareaStrategy extends InsertionStrategy {
  private caretPositioner = new CaretPositioner();

  canHandle(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
    return el !== null && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
  }

  insert(opts: InsertTextOptions): boolean {
    const { target: el } = opts;
    if (!this.canHandle(el)) return false;

    const text = buildInsertText(opts);
    const insertPosition = this.caretPositioner.getInputIndices(el, opts.insertAt);

    const value = el.value ?? "";
    el.value = value.slice(0, insertPosition.start) + text + value.slice(insertPosition.end);
    const caret = insertPosition.start + text.length;
    el.selectionStart = el.selectionEnd = caret;
    el.focus();

    // Notify reactive frameworks
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
}

export class ContentEditableStrategy extends InsertionStrategy {
  private caretPositioner = new CaretPositioner();

  canHandle(el: Element | null): el is HTMLElement {
    return (
      !!el &&
      ((el as HTMLElement).isContentEditable ||
        el.getAttribute?.("contenteditable") === "true" ||
        el.getAttribute?.("contenteditable") === "plaintext-only")
    );
  }

  insert(opts: InsertTextOptions): boolean {
    const { target: el } = opts;
    if (!this.canHandle(el)) return false;

    if (document.activeElement !== el) {
      logger.warn("Target element is not focused; insertion may be out of place");
      el.focus();
    }

    const text = buildInsertText(opts);

    try {
      if (!this.caretPositioner.positionContentEditable(el, opts.insertAt)) {
        logger.error("Failed to position cursor for insertion");
        return false;
      }
    } catch (e) {
      logger.error("Exception encountered while positioning cursor for insertion", e);
      return false;
    }

    // plaintext-only hosts MUST ignore HTML
    // These elements explicitly reject HTML formatting, so we must use plain text.
    const isPlainTextOnly = el.getAttribute?.("contenteditable") === "plaintext-only";
    if (isPlainTextOnly) {
      logger.log('Target is contenteditable="plaintext-only"; inserting as plain text');
      return this.insertPlainText(el, text);
    }

    // First choice: execCommand('insertHTML')
    // This is the most reliable method for rich text insertion as it integrates
    // with the browser's undo stack and triggers proper editor events.
    const html = toParagraphHtml(text);
    if (document.queryCommandSupported?.("insertHTML")) {
      logger.log("Using execCommand('insertHTML') for insertion");
      try {
        document.execCommand("insertHTML", false, html);
        this.dispatchInput(el, "insertFromPaste");
        return true;
      } catch (_) {
        /* continue to fallback */
      }
    }

    // Fallback: plain text via execCommand or Range API
    // Some browsers/editors don't support insertHTML, so we degrade gracefully.
    logger.warn("Falling back to range-based plain text insertion");
    return this.insertPlainText(el, text);
  }

  /**
   * Inserts plain text into a contenteditable element.
   *
   * We attempt multiple strategies in order of preference:
   * 1. execCommand('insertText') - integrates with undo stack
   * 2. Range API manipulation - direct DOM insertion as last resort
   */
  private insertPlainText(el: HTMLElement, text: string): boolean {
    // First choice: execCommand('insertText')
    // Like insertHTML, this integrates with the browser's editing machinery,
    // preserving undo/redo functionality and triggering proper events.
    if (document.queryCommandSupported?.("insertText")) {
      try {
        document.execCommand("insertText", false, text);
        this.dispatchInput(el, "insertText");
        return true;
      } catch (_) {
        /* fall through to Range-based approach */
      }
    }

    // Last resort: direct Range API manipulation
    // This bypasses the browser's editing commands entirely. We lose undo stack
    // integration, but it works when execCommand is unavailable or fails.
    try {
      const sel = window.getSelection?.();
      // Ensure we have a valid selection; if not, create one at end of element
      if (!sel || sel.rangeCount === 0) {
        const r = document.createRange();
        r.selectNodeContents(el);
        r.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(r);
      }

      const range = window.getSelection()!.getRangeAt(0);
      range.deleteContents(); // Remove any selected content

      // Insert text node and position cursor after it
      const tn = document.createTextNode(text);
      range.insertNode(tn);
      range.setStartAfter(tn);
      range.setEndAfter(tn);
      sel!.removeAllRanges();
      sel!.addRange(range);

      this.dispatchInput(el, "insertText");
      return true;
    } catch (_) {
      return false;
    }
  }

  private dispatchInput(el: HTMLElement, inputType: string = "insertText"): void {
    // Generic change/input for frameworks
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));

    // Try to provide richer signal when supported
    try {
      el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType }));
    } catch (e) {
      logger.error("Failed to dispatch rich InputEvent", e);
    }
  }
}

export class TextInserter {
  private strategies: InsertionStrategy[];

  constructor(strategies: InsertionStrategy[]) {
    this.strategies = strategies;
  }

  canHandle(target: Element | null): boolean {
    for (const s of this.strategies) {
      try {
        if (s.canHandle(target)) return true;
      } catch (e) {
        logger.error("Failed to determine strategy capability", e);
      }
    }
    return false;
  }

  insert(opts: InsertTextOptions): boolean {
    const { target } = opts;
    if (!target) return false;

    for (const s of this.strategies) {
      try {
        if (s.canHandle(target) && s.insert(opts)) {
          return true;
        }
      } catch (e) {
        logger.error("Insertion strategy error", e);
      }
    }

    return false;
  }
}
