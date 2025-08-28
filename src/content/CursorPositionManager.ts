import { logger } from "./logger";
import { CursorPosition } from "./typedefs";

export class CursorPositionManager {
  static getPosition(el: Element | null): CursorPosition {
    if (!el) return null;

    try {
      // Handle INPUT/TEXTAREA elements
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        const inputEl = el as HTMLInputElement | HTMLTextAreaElement;
        return {
          type: "input",
          start: inputEl.selectionStart ?? 0,
          end: inputEl.selectionEnd ?? 0,
        };
      }

      // Handle contentEditable elements
      if ((el as HTMLElement).isContentEditable || el.getAttribute?.("contenteditable")) {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
          return { type: "contenteditable", range: null };
        }

        const range = selection.getRangeAt(0);
        // Store range as serializable data
        return {
          type: "contenteditable",
          range: {
            startContainer: range.startContainer,
            startOffset: range.startOffset,
            endContainer: range.endContainer,
            endOffset: range.endOffset,
            collapsed: range.collapsed,
          },
        };
      }
    } catch (e) {
      logger.warn("Failed to get cursor position", e);
    }

    return null;
  }

  static setPosition(el: Element | null, position: CursorPosition): void {
    if (!el || !position) return;

    try {
      if (position.type === "input") {
        const inputEl = el as HTMLInputElement | HTMLTextAreaElement;
        // Restore INPUT/TEXTAREA selection
        if (typeof position.start === "number" && typeof position.end === "number") {
          inputEl.selectionStart = position.start;
          inputEl.selectionEnd = position.end;
        }
      } else if (position.type === "contenteditable" && position.range) {
        // Restore contentEditable selection
        const { startContainer, startOffset, endContainer, endOffset } = position.range;

        // Verify containers are still connected to DOM
        if (!startContainer?.isConnected || !endContainer?.isConnected) {
          return;
        }

        const selection = window.getSelection();
        if (!selection) return;

        const range = document.createRange();

        range.setStart(
          startContainer,
          Math.min(startOffset, startContainer.textContent?.length ?? 0)
        );
        range.setEnd(endContainer, Math.min(endOffset, endContainer.textContent?.length ?? 0));

        selection.removeAllRanges();
        selection.addRange(range);
      }
    } catch (e) {
      logger.warn("Failed to set cursor position", e);
    }
  }
}
