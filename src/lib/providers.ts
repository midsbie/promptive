// Ensure baseUrls do not have trailing slashes and newChatPaths start with a slash (if not empty)
export const providerConfigs = {
  chatgpt: {
    baseUrl: "https://chatgpt.com",
    newChatPath: "",
    inputSelector: "#prompt-textarea",
  },
  claude: {
    baseUrl: "https://claude.ai",
    newChatPath: "/new",
    inputSelector: 'div.ProseMirror[contenteditable="true"]',
  },
  gemini: {
    baseUrl: "https://gemini.google.com",
    newChatPath: "/app",
    inputSelector: 'div.ql-editor[contenteditable="true"]',
  },
  aistudio: {
    baseUrl: "https://aistudio.google.com",
    newChatPath: "/prompts/new_chat",
    inputSelector: "textarea.textarea",
  },
} as const;

export type Provider = keyof typeof providerConfigs;
export const providers = Object.keys(providerConfigs) as Provider[];

export function isProvider(p: unknown): p is Provider {
  return providers.includes(p as Provider);
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
  for (const provider of providers) {
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
