import type { InsertPosition } from "../lib/storage";

// Ensure baseUrls do not have trailing slashes and newChatPaths start with a slash (if not empty)
export const providerConfigs = {
  chatgpt: {
    baseUrl: "https://chatgpt.com",
    newChatPath: "",
    inputSelector: "#prompt-textarea",
  },
  claude: {
    baseUrl: "https://claude.ai",
    newChatPath: "/chat",
    inputSelector: 'div.ProseMirror[contenteditable="true"]',
  },
  gemini: {
    baseUrl: "https://gemini.google.com",
    newChatPath: "/app",
    inputSelector: 'div.ql-editor[contenteditable="true"]',
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
  if (!config) return false; // not supposed to happen

  try {
    const purl = new URL(config.baseUrl);
    const turl = new URL(tabUrl);
    return purl.host === turl.host;
  } catch {
    return false;
  }
}
