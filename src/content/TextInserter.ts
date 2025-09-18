import { InsertPosition } from "../lib/storage";

import { logger } from "./logger";

export type InsertTextOptions = {
  target: Element | null;
  content: string;
  insertAt: InsertPosition;
  separator?: string;
};

const escapeHtml = (text: string = ""): string => {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
};

const toParagraphHtml = (text: string): string => {
  // Convert plaintext with newlines into <p> blocks, preserving empty lines
  return text
    .split("\n")
    .map((line) => (line.trim() === "" ? "<p><br></p>" : `<p>${escapeHtml(line)}</p>`))
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
  canHandle(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
    return el !== null && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
  }

  insert(opts: InsertTextOptions): boolean {
    const { target: el } = opts;
    if (!this.canHandle(el)) return false;

    const text = buildInsertText(opts);
    const insertPosition = this.getInsertPosition(el, opts.insertAt);

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

  private getInsertPosition(
    el: HTMLInputElement | HTMLTextAreaElement,
    insertAt: InsertPosition
  ): { start: number; end: number } {
    const value = el.value ?? "";

    switch (insertAt) {
      case "top":
        return { start: 0, end: 0 };
      case "bottom":
        return { start: value.length, end: value.length };
      case "cursor":
      default: {
        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? 0;
        return { start, end };
      }
    }
  }
}

export class ContentEditableStrategy extends InsertionStrategy {
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
      if (!this.positionForInsertion(el, opts.insertAt)) {
        logger.error("Failed to position cursor for insertion");
        return false;
      }
    } catch (e) {
      logger.error("Exception encountered while positioning cursor for insertion", e);
      return false;
    }

    // plaintext-only hosts MUST ignore HTML
    const isPlainTextOnly = el.getAttribute?.("contenteditable") === "plaintext-only";
    if (isPlainTextOnly) {
      logger.log('Target is contenteditable="plaintext-only"; inserting as plain text');
      return this.insertPlainText(el, text);
    }

    const html = toParagraphHtml(text);
    // First choice: insertHTML command
    if (document.queryCommandSupported?.("insertHTML")) {
      logger.log("Using execCommand('insertHTML') for insertion");
      try {
        document.execCommand("insertHTML", false, html);
        this.dispatchInput(el, "insertFromPaste"); // notify reactive frameworks/editors
        return true;
      } catch (_) {
        /* continue */
      }
    }

    // Last resort: plain text
    logger.warn("Falling back to range-based plain text insertion");
    return this.insertPlainText(el, text);
  }

  private positionForInsertion(el: HTMLElement, insertAt: InsertPosition): boolean {
    if (insertAt === "cursor") return true;

    const selection = window.getSelection();
    if (!selection) return false;

    let range: Range;
    if (insertAt === "top") {
      range = document.createRange();
      // Find the first child element or text node to position inside it
      const firstChild = el.firstElementChild || el.firstChild;
      if (firstChild) {
        range.setStart(firstChild, 0);
        range.setEnd(firstChild, 0);
      } else {
        range.setStart(el, 0);
        range.setEnd(el, 0);
      }
    } else {
      // end - position inside the last child element
      range = document.createRange();
      const lastChild = el.lastElementChild || el.lastChild;
      if (lastChild) {
        range.selectNodeContents(lastChild);
        range.collapse(false);
      } else {
        range.selectNodeContents(el);
        range.collapse(false);
      }
    }

    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  private insertPlainText(el: HTMLElement, text: string): boolean {
    if (document.queryCommandSupported?.("insertText")) {
      try {
        document.execCommand("insertText", false, text);
        this.dispatchInput(el, "insertText");
        return true;
      } catch (_) {
        /* fall through */
      }
    }

    // Range-based plain text
    try {
      const sel = window.getSelection?.();
      if (!sel || sel.rangeCount === 0) {
        const r = document.createRange();
        r.selectNodeContents(el);
        r.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(r);
      }

      const range = window.getSelection()!.getRangeAt(0);
      range.deleteContents();

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

export class ClipboardWriter {
  async write(text: string): Promise<boolean> {
    await navigator.clipboard.writeText(text);
    return true;
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
