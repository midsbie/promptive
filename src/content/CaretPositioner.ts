import { InsertPosition } from "../lib/storage";

/**
 * Utility for positioning the caret (text cursor) in editable elements.
 *
 * Provides consistent caret positioning logic for both native form elements
 * (input/textarea) and contenteditable elements, which require fundamentally
 * different DOM APIs.
 */
export class CaretPositioner {
  /**
   * Gets the insertion indices for an input or textarea element.
   *
   * For native form elements, we work with character indices into the value
   * string. This returns the start/end positions where text should be inserted,
   * which may differ when there's a selection (text will be replaced).
   */
  getInputIndices(
    el: HTMLInputElement | HTMLTextAreaElement,
    position: InsertPosition
  ): { start: number; end: number } {
    const value = el.value ?? "";

    switch (position) {
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

  /**
   * Positions the caret in a contenteditable element.
   *
   * Contenteditable elements use the Selection/Range API rather than simple
   * indices. The key insight is that we must position *inside* child elements
   * (e.g., <p> tags) rather than at the container level, because rich text
   * editors structure content with block elements and positioning at the
   * container level can cause cursor placement issues.
   */
  positionContentEditable(el: HTMLElement, position: InsertPosition): boolean {
    // "cursor" means keep current position - nothing to do
    if (position === "cursor") return true;

    const selection = window.getSelection();
    if (!selection) return false;

    const range = document.createRange();

    if (position === "top") {
      // Position at the very beginning of the editable content.
      // We target the first child element (e.g., first <p>) to ensure the
      // cursor lands inside the content structure, not floating at container level.
      const firstChild = el.firstElementChild || el.firstChild;
      if (firstChild) {
        range.setStart(firstChild, 0);
        range.setEnd(firstChild, 0);
      } else {
        // Empty element - position at the container itself
        range.setStart(el, 0);
        range.setEnd(el, 0);
      }
    } else {
      // "bottom" - position at the very end of the editable content.
      // Similarly, we target the last child element to position inside the
      // content structure. selectNodeContents + collapse(false) places the
      // cursor at the end of that node's contents.
      const lastChild = el.lastElementChild || el.lastChild;
      if (lastChild) {
        range.selectNodeContents(lastChild);
        range.collapse(false);
      } else {
        // Empty element - position at the container itself
        range.selectNodeContents(el);
        range.collapse(false);
      }
    }

    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  /**
   * Moves the caret to the end of any editable element.
   *
   * Convenience method that detects the element type and delegates to the
   * appropriate positioning strategy.
   */
  moveToEnd(el: HTMLElement): void {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      // For native form elements, directly set selection indices
      el.selectionStart = el.selectionEnd = el.value.length;
    } else if (el.isContentEditable) {
      // For contenteditable, use the full positioning logic
      this.positionContentEditable(el, "bottom");
    }
  }
}
