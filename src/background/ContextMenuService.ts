import browser from "webextension-polyfill";

import { commands } from "../lib/commands";
import { AppSettings, ContextMenuSortOrder } from "../lib/settings";
import { Prompt } from "../lib/storage";

import { logger } from "./logger";

const sortAlphabetical = (prompts: Prompt[]): Prompt[] => {
  return [...prompts].sort((a, b) => a.title.localeCompare(b.title));
};

const sortLastUsed = (prompts: Prompt[]): Prompt[] => {
  return [...prompts].sort((a: Prompt, b: Prompt) => {
    if (!a.last_used_at && !b.last_used_at) return 0;
    if (!a.last_used_at) return 1;
    if (!b.last_used_at) return -1;
    return new Date(b.last_used_at).getTime() - new Date(a.last_used_at).getTime();
  });
};

const SORTERS: Record<ContextMenuSortOrder, (prompts: Prompt[]) => Prompt[]> = {
  alphabetical: sortAlphabetical,
  "last-used": sortLastUsed,
};

type GetPromptsFunction = () => Promise<Prompt[]>;

interface Manifest {
  content_scripts?: Array<{
    matches: string[];
  }>;
}

export class ContextMenuService {
  static readonly MENU_ID = "promptive";

  private getPrompts: GetPromptsFunction;
  private settings: AppSettings["contextMenu"];
  private documentUrlPatterns: string[];

  constructor(getPrompts: GetPromptsFunction, settings: AppSettings["contextMenu"]) {
    this.getPrompts = getPrompts;
    this.settings = settings;

    // Derive the same URL patterns as the content script so menus only show there
    const manifest = browser.runtime.getManifest?.() as Manifest | undefined;
    this.documentUrlPatterns = manifest?.content_scripts?.flatMap((cs) => cs.matches) ?? [];
  }

  async rebuild(): Promise<void> {
    await browser.contextMenus.removeAll();

    const prompts = await this.getPrompts();
    const sorter = SORTERS[this.settings.sort] ?? SORTERS["last-used"];
    const sorted = sorter(prompts).slice(0, this.settings.limit);

    // Parent
    browser.contextMenus.create({
      id: ContextMenuService.MENU_ID,
      title: "Promptive",
      contexts: ["editable", "page"],
    });

    // Items
    for (const p of sorted) {
      browser.contextMenus.create({
        id: `${commands.SELECT_PROMPT_PREFIX}${p.id}`,
        parentId: ContextMenuService.MENU_ID,
        title: p.title,
        contexts: ["editable", "page"],
        documentUrlPatterns: this.documentUrlPatterns,
      });
    }

    if (sorted.length > 0) {
      browser.contextMenus.create({
        id: "separator",
        parentId: ContextMenuService.MENU_ID,
        type: "separator",
        contexts: ["editable", "page"],
        documentUrlPatterns: this.documentUrlPatterns,
      });
    }

    browser.contextMenus.create({
      id: commands.OPEN_PROMPT_SELECTOR,
      parentId: ContextMenuService.MENU_ID,
      title: "Open Prompt Selector...",
      contexts: ["editable", "page"],
    });

    browser.contextMenus.create({
      id: commands.MANAGE_PROMPTS,
      parentId: ContextMenuService.MENU_ID,
      title: "Manage Prompts...",
      contexts: ["editable", "page"],
    });

    logger.debug("Context menus rebuilt");
  }
}
