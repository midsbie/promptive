import browser, { Storage } from "webextension-polyfill";

import { Eventful, WithEventTarget } from "../content/eventful";

const SETTINGS_KEY = "settings";
export const DEFAULT_DAEMON_ADDRESS = "ws://127.0.0.1:8787";

export type ContextMenuSortOrder = "last-used" | "alphabetical";

export interface AppSettings {
  contextMenu: {
    limit: number;
    sort: ContextMenuSortOrder;
  };
  promptivd: {
    enabled: boolean;
    daemonAddress: string;
    maxMessageChars: number;
    contentType: "auto" | "text" | "markdown";
    framing: {
      enabled: boolean;
      mode: "ack" | "silent";
      text: string;
    };
    batchMode: "assisted" | "auto-send";
    showProgressWidget: boolean;
  };
}

export const DEFAULT_SETTINGS: AppSettings = {
  contextMenu: {
    limit: 10,
    sort: "last-used",
  },
  promptivd: {
    enabled: true,
    daemonAddress: DEFAULT_DAEMON_ADDRESS,
    maxMessageChars: 10000,
    contentType: "auto",
    framing: {
      enabled: true,
      mode: "ack",
      text: "",
    },
    batchMode: "assisted",
    showProgressWidget: true,
  },
};

export type SettingsChangeDetail = {
  settings: Readonly<AppSettings>;
};

class SettingsRepositoryBase {
  static readonly EVENT_SETTINGS_CHANGED = "settingsChanged";

  private settings: Readonly<AppSettings>;
  private lastSnapshot: string;

  static getStorageKey(): string {
    return SETTINGS_KEY;
  }

  constructor() {
    this.settings = this.clone(DEFAULT_SETTINGS);
    this.lastSnapshot = JSON.stringify(this.settings);

    browser.storage.onChanged.addListener(this.onStorageChanged);
  }

  async initialize(): Promise<void> {
    await this.reload();
  }

  destroy(): void {
    browser.storage.onChanged.removeListener(this.onStorageChanged);
  }

  async reload(): Promise<boolean> {
    const key = SettingsRepository.getStorageKey();
    const data = await browser.storage.local.get(key);
    const stored: Partial<AppSettings> = data?.[key] || {};

    const newSettings = this.clone(stored);
    const nextSnapshot = JSON.stringify(newSettings);
    if (nextSnapshot === this.lastSnapshot) return false;

    this.settings = newSettings;
    this.lastSnapshot = nextSnapshot;
    return true;
  }

  get(): Readonly<AppSettings> {
    return this.settings;
  }

  async save(newSettings: AppSettings): Promise<void> {
    this.settings = this.clone(newSettings);
    await browser.storage.local.set({ [SettingsRepository.getStorageKey()]: newSettings });
  }

  private onStorageChanged = async (
    changes: Record<string, Storage.StorageChange>,
    area: string
  ) => {
    if (area !== "local" || !changes[SettingsRepository.getStorageKey()]) return;

    if (await this.reload()) {
      this.dispatchEvent(
        new CustomEvent<SettingsChangeDetail>(SettingsRepository.EVENT_SETTINGS_CHANGED, {
          detail: { settings: this.settings },
        })
      );
    }
  };

  private clone(settings: Readonly<Partial<AppSettings>>): Readonly<AppSettings> {
    return Object.freeze({
      ...DEFAULT_SETTINGS,
      ...settings,
      contextMenu: {
        ...DEFAULT_SETTINGS.contextMenu,
        ...settings.contextMenu,
      },
      promptivd: {
        ...DEFAULT_SETTINGS.promptivd,
        ...settings.promptivd,
        framing: {
          ...DEFAULT_SETTINGS.promptivd.framing,
          ...settings.promptivd?.framing,
        },
      },
    });
  }

  declare addEventListener: Eventful["addEventListener"];
  declare removeEventListener: Eventful["removeEventListener"];
  declare dispatchEvent: Eventful["dispatchEvent"];
}

export class SettingsRepository extends WithEventTarget(SettingsRepositoryBase) {}
