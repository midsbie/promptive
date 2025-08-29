import { logger } from "./logger";
import { ToastService } from "./services";

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

export abstract class InsertionStrategy {
  abstract canHandle(element: Element | null): boolean;
  abstract insert(element: Element | null, text: string): boolean;
}

export class InputTextareaStrategy extends InsertionStrategy {
  canHandle(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
    return el !== null && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
  }

  insert(el: Element | null, text: string): boolean {
    if (!this.canHandle(el)) return false;

    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const value = el.value ?? "";
    el.value = value.slice(0, start) + text + value.slice(end);
    const caret = start + text.length;
    el.selectionStart = el.selectionEnd = caret;
    el.focus();

    // Notify reactive frameworks
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
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

  insert(el: Element | null, text: string): boolean {
    if (!this.canHandle(el)) return false;

    if (document.activeElement !== el) {
      logger.warn("Target element is not focused; insertion may be out of place");
      el.focus();
    }

    // plaintext-only hosts MUST ignore HTML
    const isPlainTextOnly = el.getAttribute?.("contenteditable") === "plaintext-only";
    if (isPlainTextOnly) {
      logger.log('Target is contenteditable="plaintext-only"; inserting as plain text');
      return this._insertPlainText(el, text);
    }

    const html = toParagraphHtml(text);
    // First choice: insertHTML command
    if (document.queryCommandSupported?.("insertHTML")) {
      logger.log("Using execCommand('insertHTML') for insertion");
      try {
        document.execCommand("insertHTML", false, html);
        this._dispatchInput(el, "insertFromPaste"); // notify reactive frameworks/editors
        return true;
      } catch (_) {
        /* continue */
      }
    }

    // Last resort: plain text
    logger.warn("Falling back to range-based plain text insertion");
    return this._insertPlainText(el, text);
  }

  private _insertPlainText(el: HTMLElement, text: string): boolean {
    if (document.queryCommandSupported?.("insertText")) {
      try {
        document.execCommand("insertText", false, text);
        this._dispatchInput(el, "insertText");
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

      this._dispatchInput(el, "insertText");
      return true;
    } catch (_) {
      return false;
    }
  }

  private _dispatchInput(el: HTMLElement, inputType: string = "insertText"): void {
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
  write(text: string): boolean {
    // Never throws; failures are acceptable as last resort.
    navigator.clipboard.writeText(text).then(
      () => ToastService.show("Prompt copied to clipboard"),
      () => ToastService.show("Failed to copy to clipboard")
    );
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

  insert(target: Element | null, text: string): boolean {
    if (!target) return false;

    for (const s of this.strategies) {
      try {
        if (s.canHandle(target)) {
          const ok = s.insert(target, text);
          if (ok) return true;
        }
      } catch (e) {
        logger.error("Insertion strategy error", e);
      }
    }

    return false;
  }
}
