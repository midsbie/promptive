import { logger } from "./logger.js";

/**
 * Minimal context-menu builder.
 */
export class ContextMenuService {
  static MENU_ID = "promptive";

  constructor(getPrompts, limit = 10) {
    this.getPrompts = getPrompts;
    this.limit = limit;

    // Derive the same URL patterns as the content script so menus only show there
    const manifest = browser.runtime.getManifest?.();
    this.documentUrlPatterns = manifest?.content_scripts?.flatMap((cs) => cs.matches) ?? [];
  }

  async rebuild() {
    await browser.contextMenus.removeAll();

    const prompts = await this.getPrompts();
    const sorted = [...prompts]
      .sort((a, b) => {
        if (!a.last_used && !b.last_used) return 0;
        if (!a.last_used) return 1;
        if (!b.last_used) return -1;
        return new Date(b.last_used) - new Date(a.last_used);
      })
      .slice(0, this.limit);

    // Parent
    browser.contextMenus.create({
      id: ContextMenuService.MENU_ID,
      title: "Promptive",
      contexts: ["editable", "page"],
      documentUrlPatterns: this.documentUrlPatterns,
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
      documentUrlPatterns: this.documentUrlPatterns,
    });

    logger.debug("Context menus rebuilt");
  }
}
