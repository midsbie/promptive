import { AIStudioAdapter } from "./AIStudioAdapter";
import { ChatGPTAdapter } from "./ChatGPTAdapter";
import { ClaudeAdapter } from "./ClaudeAdapter";
import { GeminiAdapter } from "./GeminiAdapter";
import { ProviderAdapter, ProviderAdapterFactory } from "./ProviderAdapter";

export class DefaultProviderAdapterFactory implements ProviderAdapterFactory {
  private adapters: ProviderAdapter[];

  constructor() {
    this.adapters = [
      new ChatGPTAdapter(),
      new ClaudeAdapter(),
      new GeminiAdapter(),
      new AIStudioAdapter(),
    ];
  }

  getForUrl(url: string): ProviderAdapter | null {
    for (const adapter of this.adapters) {
      if (adapter.detect(url)) {
        return adapter;
      }
    }
    return null;
  }
}
