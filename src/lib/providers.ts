export const AUTO_PROVIDER = "auto";
export const DEFAULT_PROVIDER: Provider = "chatgpt";

// Ensure baseUrls do not have trailing slashes and newChatPaths start with a slash (if not empty)
export const providerConfigs: Record<
  string,
  {
    baseUrl: string;
    newChatPath: string;
    composerSelector: string;
    sendButtonSelector?: string;
    stopButtonSelector?: string;
  }
> = {
  chatgpt: {
    baseUrl: "https://chatgpt.com",
    newChatPath: "",
    composerSelector: "#prompt-textarea",
    sendButtonSelector: '[data-testid="send-button"]',
    stopButtonSelector: '[data-testid="stop-button"]',
  },
  claude: {
    baseUrl: "https://claude.ai",
    newChatPath: "/new",
    composerSelector: 'div.ProseMirror[contenteditable="true"]',
    sendButtonSelector: 'button[aria-label="Send Message"]',
  },
  gemini: {
    baseUrl: "https://gemini.google.com",
    newChatPath: "/app",
    composerSelector: 'div.ql-editor[contenteditable="true"]',
    sendButtonSelector: 'button[aria-label*="Send"]',
  },
  aistudio: {
    baseUrl: "https://aistudio.google.com",
    newChatPath: "/prompts/new_chat",
    composerSelector: "textarea.textarea",
    sendButtonSelector: 'button[aria-label="Run"]',
  },
};

export type Provider = keyof typeof providerConfigs;
export type ProviderOrAuto = typeof AUTO_PROVIDER | Provider;
export const canonicalProviders: Provider[] = Object.keys(providerConfigs) as Provider[];
export const providers = [AUTO_PROVIDER].concat(canonicalProviders) as ProviderOrAuto[];

export function isProvider(p: unknown): p is Provider {
  return providers.includes(p as Provider);
}

export function isAutoProvider(p: unknown): p is typeof AUTO_PROVIDER {
  return p === AUTO_PROVIDER;
}

export function isProviderOrAuto(p: unknown): p is ProviderOrAuto {
  return p === AUTO_PROVIDER || isProvider(p);
}

export function getProviderConfig(provider: Provider) {
  return providerConfigs[provider];
}

export function isTabFromProvider(tabUrl: string, provider: Provider): boolean {
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

export function detectProvider(url: string): Provider | null {
  for (const provider of canonicalProviders) {
    const config = getProviderConfig(provider);
    try {
      const purl = new URL(config.baseUrl);
      const curl = new URL(url);
      if (purl.host === curl.host) return provider;
    } catch {
      continue;
    }
  }

  return null;
}

export function resolveProvider(providerOrAuto: ProviderOrAuto): Provider {
  return providerOrAuto === AUTO_PROVIDER ? DEFAULT_PROVIDER : providerOrAuto;
}
