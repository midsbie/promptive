import { logger } from "./logger.js";

/**
 * Minimal context-menu builder.
 */
export class ContextMenuService {
  constructor(getPrompts, limit = 10) {
    this.getPrompts = getPrompts;
    this.limit = limit;
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
      id: "prompt-library",
      title: "Prompt Library",
      contexts: ["editable", "selection"],
    });

    // Items
    for (const p of sorted) {
      browser.contextMenus.create({
        id: `prompt-${p.id}`,
        parentId: "prompt-library",
        title: p.title,
        contexts: ["editable", "selection"],
      });
    }

    if (sorted.length > 0) {
      browser.contextMenus.create({
        id: "separator",
        parentId: "prompt-library",
        type: "separator",
        contexts: ["editable", "selection"],
      });
    }

    // "More..." when more exist
    if (prompts.length > this.limit) {
      browser.contextMenus.create({
        id: "more-prompts",
        parentId: "prompt-library",
        title: "More...",
        contexts: ["editable", "selection"],
      });
    }

    // Manage
    browser.contextMenus.create({
      id: "manage-prompts",
      parentId: "prompt-library",
      title: "Manage Prompts...",
      contexts: ["editable", "selection"],
    });

    logger.debug("Context menus rebuilt");
  }
}
