import type { InsertPosition } from "../lib/storage";

export const providerConfigs = {
  chatgpt: {
    baseUrl: "https://chatgpt.com",
    newChatUrl: "https://chatgpt.com",
    inputSelector: "#prompt-textarea",
    hostPatterns: ["chatgpt.com"],
  },
  claude: {
    baseUrl: "https://claude.ai",
    newChatUrl: "https://claude.ai/chat",
    inputSelector: 'div.ProseMirror[contenteditable="true"]',
    hostPatterns: ["claude.ai"],
  },
  gemini: {
    baseUrl: "https://gemini.google.com",
    newChatUrl: "https://gemini.google.com/app",
    inputSelector: 'div.ql-editor[contenteditable="true"]',
    hostPatterns: ["gemini.google.com"],
  },
} as const;

export type Provider = keyof typeof providerConfigs;
export const providers = Object.keys(providerConfigs) as Provider[];

export const sessionPolicies = ["reuse_or_create", "reuse_only", "start_fresh"] as const;
export type SessionPolicy = (typeof sessionPolicies)[number];

export function isInsertPosition(t: unknown): t is InsertPosition {
  return t === "top" || t === "bottom" || t === "cursor";
}

export function mapPlacementToInsertPosition(
  placement: { type: InsertPosition } | null
): InsertPosition | null {
  if (!placement) return "cursor";
  return placement.type;
}

export function isProvider(p: unknown): p is Provider {
  return providers.includes(p as Provider);
}

export function isSessionPolicy(sp: unknown): sp is SessionPolicy {
  return sessionPolicies.includes(sp as SessionPolicy);
}

export function getProviderConfig(provider: Provider) {
  return providerConfigs[provider];
}

export function isProviderTab(tabUrl: string, provider: Provider): boolean {
  const config = getProviderConfig(provider);
  return config.hostPatterns.some((pattern: string) => tabUrl.includes(pattern));
}
