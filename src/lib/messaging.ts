import browser from "webextension-polyfill";

import { Prompt } from "./storage";

// Actions as a const object -> string literal union
export const MSG = {
  GET_PROMPTS: "PROMPTIVE/GET_PROMPTS",
  RECORD_PROMPT_USAGE: "PROMPTIVE/RECORD_PROMPT_USAGE",
  QUERY_STATUS: "PROMPTIVE/QUERY_STATUS",
  OPEN_POPOVER: "PROMPTIVE/OPEN_POPOVER",
  INSERT_PROMPT: "PROMPTIVE/INSERT_PROMPT",
} as const;

export type Action = (typeof MSG)[keyof typeof MSG];

// Single source of truth: Action -> Payload & Response maps
type MessageMap = {
  [MSG.GET_PROMPTS]: {}; // no payload
  [MSG.RECORD_PROMPT_USAGE]: { promptId: string };
  [MSG.QUERY_STATUS]: {}; // no payload
  [MSG.OPEN_POPOVER]: {};
  [MSG.INSERT_PROMPT]: { prompt: Prompt };
};

type ResponseMap = {
  [MSG.GET_PROMPTS]: { prompts: Prompt[] };
  [MSG.RECORD_PROMPT_USAGE]: void;
  [MSG.QUERY_STATUS]: { active: boolean };
  [MSG.OPEN_POPOVER]: void;
  [MSG.INSERT_PROMPT]: void;
};

// 3) Discriminated union is derived (no duplication)
export type Message = {
  [K in Action]: { action: K } & MessageMap[K];
}[Action];

export type MessageResponse = ResponseMap[Action];

// Helper to create messages with type-checked payloads
type PayloadOf<A extends Action> = MessageMap[A];
type NeedsPayload<A extends Action> = keyof PayloadOf<A> extends never ? false : true;

export function createMessage<A extends Action>(
  action: A,
  ...rest: NeedsPayload<A> extends true ? [PayloadOf<A>] : []
): { action: A } & PayloadOf<A> {
  const payload = (rest[0] ?? {}) as PayloadOf<A>;
  return { action, ...payload };
}

const ACTIONS = new Set<string>(Object.values(MSG));
export function isMessage(msg: unknown): msg is Message {
  return !!msg && typeof msg === "object" && ACTIONS.has((msg as any).action);
}

export function send<A extends Action>(msg: { action: A } & MessageMap[A]) {
  return browser.runtime.sendMessage(msg) as Promise<ResponseMap[A]>;
}

export function sendToTab<A extends Action>(tabId: number, msg: { action: A } & MessageMap[A]) {
  return browser.tabs.sendMessage(tabId, msg) as Promise<ResponseMap[A]>;
}
