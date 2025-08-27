import { Prompt } from "../lib/storage.js";

import { logger } from "./logger.js";

type GetPromptsFunction = () => Promise<Prompt[]>;

interface Manifest {
  content_scripts?: Array<{
    matches: string[];
  }>;
}

/**
 * Minimal context-menu builder.
 */
export class ContextMenuService {
  static readonly MENU_ID = "promptive";

  private getPrompts: GetPromptsFunction;
  private limit: number;
  private documentUrlPatterns: string[];

  constructor(getPrompts: GetPromptsFunction, limit: number = 10) {
    this.getPrompts = getPrompts;
    this.limit = limit;

    // Derive the same URL patterns as the content script so menus only show there
    const manifest = browser.runtime.getManifest?.() as Manifest | undefined;
    this.documentUrlPatterns = manifest?.content_scripts?.flatMap((cs) => cs.matches) ?? [];
  }

  async rebuild(): Promise<void> {
    await browser.contextMenus.removeAll();

    const prompts = await this.getPrompts();
    const sorted = [...prompts]
      .sort((a: Prompt, b: Prompt) => {
        if (!a.last_used_at && !b.last_used_at) return 0;
        if (!a.last_used_at) return 1;
        if (!b.last_used_at) return -1;
        return new Date(b.last_used_at).getTime() - new Date(a.last_used_at).getTime();
      })
      .slice(0, this.limit);

    // Parent
    browser.contextMenus.create({
      id: ContextMenuService.MENU_ID,
      title: "Promptive",
      contexts: ["editable", "page"],
    });

    // Items
    for (const p of sorted) {
      browser.contextMenus.create({
        id: `prompt-${p.id}`,
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

    // "More..." when more exist
    if (prompts.length > this.limit) {
      browser.contextMenus.create({
        id: "more-prompts",
        parentId: ContextMenuService.MENU_ID,
        title: "More...",
        contexts: ["editable", "page"],
        documentUrlPatterns: this.documentUrlPatterns,
      });
    }

    // Manage
    browser.contextMenus.create({
      id: "manage-prompts",
      parentId: ContextMenuService.MENU_ID,
      title: "Manage Prompts...",
      contexts: ["editable", "page"],
    });

    logger.debug("Context menus rebuilt");
  }
}