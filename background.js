import { PromptStorage } from "./shared/storage.js";

const CONTEXT_MENU_LIMIT = 10;
let promptStorage;

// Initialize
browser.runtime.onInstalled.addListener(async () => {
  promptStorage = new PromptStorage();
  await promptStorage.initialize();
  await createContextMenus();
  console.info("Promptive extension installed");
});

// Update context menus when storage changes
browser.storage.onChanged.addListener(async (changes, area) => {
  if (area === "local" && changes.prompts) {
    await createContextMenus();
  }
});

// Create context menu structure
async function createContextMenus() {
  await browser.contextMenus.removeAll();

  const prompts = await promptStorage.getAllPrompts();
  const sortedPrompts = prompts
    .sort((a, b) => {
      if (!a.last_used && !b.last_used) return 0;
      if (!a.last_used) return 1;
      if (!b.last_used) return -1;
      return new Date(b.last_used) - new Date(a.last_used);
    })
    .slice(0, CONTEXT_MENU_LIMIT);

  // Parent menu
  browser.contextMenus.create({
    id: "prompt-library",
    title: "Prompt Library",
    contexts: ["editable", "selection"],
  });

  // Add prompt items
  sortedPrompts.forEach((prompt, index) => {
    browser.contextMenus.create({
      id: `prompt-${prompt.id}`,
      parentId: "prompt-library",
      title: prompt.title,
      contexts: ["editable", "selection"],
    });
  });

  // Add separator if we have prompts
  if (sortedPrompts.length > 0) {
    browser.contextMenus.create({
      id: "separator",
      parentId: "prompt-library",
      type: "separator",
      contexts: ["editable", "selection"],
    });
  }

  // Add "More..." if there are more prompts
  if (prompts.length > CONTEXT_MENU_LIMIT) {
    browser.contextMenus.create({
      id: "more-prompts",
      parentId: "prompt-library",
      title: "More...",
      contexts: ["editable", "selection"],
    });
  }

  // Add manage prompts option
  browser.contextMenus.create({
    id: "manage-prompts",
    parentId: "prompt-library",
    title: "Manage Prompts...",
    contexts: ["editable", "selection"],
  });
}

// Handle context menu clicks
browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "manage-prompts") {
    await browser.sidebarAction.open();
  } else if (info.menuItemId === "more-prompts") {
    await browser.tabs.sendMessage(tab.id, { action: "openPopover" });
  } else if (info.menuItemId.startsWith("prompt-")) {
    const promptId = info.menuItemId.replace("prompt-", "");
    const prompt = await promptStorage.getPrompt(promptId);
    if (prompt) {
      await promptStorage.recordUsage(promptId);
      await browser.tabs.sendMessage(tab.id, {
        action: "insertPrompt",
        prompt: prompt.content,
      });
    }
  }
});

// Handle toolbar button click
browser.action.onClicked.addListener(async (tab) => {
  await browser.tabs.sendMessage(tab.id, { action: "openPopover" });
});

// Handle keyboard command
browser.commands.onCommand.addListener(async (command) => {
  if (command === "open-prompt-selector") {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    await browser.tabs.sendMessage(tab.id, { action: "openPopover" });
  }
});

// Message handler for content scripts
browser.runtime.onMessage.addListener((request, sender) => {
  if (request.action === "getPrompts") {
    return promptStorage.getAllPrompts();
  } else if (request.action === "recordUsage") {
    return promptStorage.recordUsage(request.promptId);
  }
  return false;
});
