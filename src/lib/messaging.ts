import browser from "webextension-polyfill";

import { ClientState } from "./promptivd";
import { Provider } from "./providers";
import { InsertPosition, Prompt } from "./storage";

export const MSG = {
  PING: "PROMPTIVE/PING",
  GET_PROMPTS: "PROMPTIVE/GET_PROMPTS",
  RECORD_PROMPT_USAGE: "PROMPTIVE/RECORD_PROMPT_USAGE",
  QUERY_STATUS: "PROMPTIVE/QUERY_STATUS",
  OPEN_POPOVER: "PROMPTIVE/OPEN_POPOVER",
  INSERT_PROMPT: "PROMPTIVE/INSERT_PROMPT",
  INSERT_TEXT: "PROMPTIVE/INSERT_TEXT",
  FOCUS_PROVIDER_INPUT: "PROMPTIVE/FOCUS_PROVIDER_INPUT",
  PROMPTIVD_GET_STATUS: "PROMPTIVE/PROMPTIVD/GET_STATUS",
  PROMPTIVD_START: "PROMPTIVE/PROMPTIVD/START",
  PROMPTIVD_STOP: "PROMPTIVE/PROMPTIVD/STOP",
  PROMPTIVD_STATUS_CHANGED: "PROMPTIVE/PROMPTIVD/STATUS_CHANGED",
} as const;

export type Action = (typeof MSG)[keyof typeof MSG];

type MessageMap = {
  [MSG.PING]: {}; // no payload
  [MSG.GET_PROMPTS]: {}; // no payload
  [MSG.RECORD_PROMPT_USAGE]: { promptId: string };
  [MSG.QUERY_STATUS]: {}; // no payload
  [MSG.OPEN_POPOVER]: {};
  [MSG.INSERT_PROMPT]: { prompt: Prompt };
  [MSG.INSERT_TEXT]: { text: string; insertAt?: InsertPosition };
  [MSG.FOCUS_PROVIDER_INPUT]: { provider: Provider };
  [MSG.PROMPTIVD_GET_STATUS]: {};
  [MSG.PROMPTIVD_START]: {};
  [MSG.PROMPTIVD_STOP]: {};
  [MSG.PROMPTIVD_STATUS_CHANGED]: { state: ClientState };
};

type ResponseMap = {
  [MSG.PING]: void;
  [MSG.GET_PROMPTS]: { prompts: Prompt[] };
  [MSG.RECORD_PROMPT_USAGE]: void;
  [MSG.QUERY_STATUS]: { active: boolean; ready: boolean };
  [MSG.OPEN_POPOVER]: void;
  [MSG.INSERT_PROMPT]: void;
  [MSG.INSERT_TEXT]: { error: string | null };
  [MSG.FOCUS_PROVIDER_INPUT]: { error: string | null };
  [MSG.PROMPTIVD_GET_STATUS]: { state: ClientState };
  [MSG.PROMPTIVD_START]: void;
  [MSG.PROMPTIVD_STOP]: void;
  [MSG.PROMPTIVD_STATUS_CHANGED]: void;
};

export type Message = {
  [K in Action]: { action: K } & MessageMap[K];
}[Action];

export type MessageResponse = ResponseMap[Action];

export type ErrorReply = { error: string };

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
