export const MSG = {
  GET_PROMPTS: "PROMPTIVE/GET_PROMPTS",
  RECORD_PROMPT_USAGE: "PROMPTIVE/RECORD_PROMPT_USAGE",
  QUERY_STATUS: "PROMPTIVE/QUERY_STATUS",
  // --- Content scripts ---
  OPEN_POPOVER: "PROMPTIVE/OPEN_POPOVER",
  INSERT_PROMPT: "PROMPTIVE/INSERT_PROMPT",
};

export function isMessage(msg) {
  return typeof msg === "object" && msg !== null && typeof msg.type === "string";
}

export function createMessage(type, payload = {}) {
  return { type, ...payload };
}
