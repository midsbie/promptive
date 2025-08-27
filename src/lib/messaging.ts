export const MSG = Object.freeze({
  GET_PROMPTS: "PROMPTIVE/GET_PROMPTS",
  RECORD_PROMPT_USAGE: "PROMPTIVE/RECORD_PROMPT_USAGE",
  QUERY_STATUS: "PROMPTIVE/QUERY_STATUS",
  // --- Content scripts ---
  OPEN_POPOVER: "PROMPTIVE/OPEN_POPOVER",
  INSERT_PROMPT: "PROMPTIVE/INSERT_PROMPT",
});

export interface Message {
  type: string;
  [key: string]: any;
}

export function isMessage(msg: any): msg is Message {
  return typeof msg === "object" && msg !== null && typeof msg.type === "string";
}

export function createMessage(type: string, payload: Record<string, any> = {}): Message {
  return { type, ...payload };
}
