// Cursor position types
export interface InputCursorPosition {
  type: "input";
  start: number;
  end: number;
}

export interface ContentEditableCursorPosition {
  type: "contenteditable";
  range: {
    startContainer: Node;
    startOffset: number;
    endContainer: Node;
    endOffset: number;
    collapsed: boolean;
  } | null;
}

export type CursorPosition = InputCursorPosition | ContentEditableCursorPosition | null;
