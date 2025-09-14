import browser from "webextension-polyfill";

const SETTINGS_KEY = "settings";

export type ContextMenuSortOrder = "last-used" | "alphabetical";

export interface AppSettings {
  contextMenu: {
    limit: number;
    sort: ContextMenuSortOrder;
  };
}

export const DEFAULT_SETTINGS: AppSettings = {
  contextMenu: {
    limit: 10,
    sort: "last-used",
  },
};

/**
 * Manages application settings in storage.
 */
export class SettingsRepository {
  private settings: AppSettings = DEFAULT_SETTINGS;

  static getStorageKey(): string {
    return SETTINGS_KEY;
  }

  /**
   * Loads settings from storage, merging with defaults to ensure all keys are present.
   */
  async initialize(): Promise<void> {
    const key = SettingsRepository.getStorageKey();
    const data = await browser.storage.local.get(key);
    const stored: Partial<AppSettings> | null | undefined = data?.[key];
    if (!stored) {
      this.settings = DEFAULT_SETTINGS;
      return;
    }

    // Merge with defaults to ensure new settings are applied over time
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...stored,
      contextMenu: {
        ...DEFAULT_SETTINGS.contextMenu,
        ...(stored.contextMenu || {}),
      },
    };
  }

  /**
   * Returns the currently loaded settings.
   */
  get(): AppSettings {
    return this.settings;
  }

  /**
   * Saves the complete settings object to storage.
   */
  async save(newSettings: AppSettings): Promise<void> {
    await browser.storage.local.set({ [SettingsRepository.getStorageKey()]: newSettings });
    this.settings = newSettings;
  }
}
