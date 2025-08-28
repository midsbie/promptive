import browser, { Commands } from "webextension-polyfill";

import { commands } from "../lib/commands";

import { logger } from "./logger";

// Options page for configuring shortcuts
const shortcutInput = document.getElementById("shortcut") as HTMLInputElement;
const status = document.getElementById("status") as HTMLElement;

// Load current shortcut
browser.commands.getAll().then((all: Commands.Command[]) => {
  const command = all.find((c) => c.name === commands.OPEN_PROMPT_SELECTOR);
  if (command && command.shortcut) {
    shortcutInput.value = command.shortcut;
  }
});

// Capture new shortcut
shortcutInput.addEventListener("keydown", async (e: KeyboardEvent) => {
  e.preventDefault();

  const keys: string[] = [];
  if (e.ctrlKey) keys.push("Ctrl");
  if (e.altKey) keys.push("Alt");
  if (e.shiftKey) keys.push("Shift");
  if (e.metaKey) keys.push("Command");

  // Add the actual key if it's not a modifier
  if (!["Control", "Alt", "Shift", "Meta"].includes(e.key)) {
    keys.push(e.key.toUpperCase());
  }

  if (keys.length < 2) {
    logger.warn("Ignoring shortcut with less than 2 keys");
    return;
  }

  const shortcut = keys.join("+");
  shortcutInput.value = shortcut;

  try {
    await browser.commands.update({
      name: commands.OPEN_PROMPT_SELECTOR,
      shortcut: shortcut,
    });

    status.textContent = "Shortcut updated successfully!";
    setTimeout(() => {
      status.textContent = "";
    }, 3000);
  } catch (err: any) {
    status.textContent = "Error: " + err.message;
    status.style.color = "#e74c3c";
  }
});
