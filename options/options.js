// Options page for configuring shortcuts
const shortcutInput = document.getElementById("shortcut");
const status = document.getElementById("status");

// Load current shortcut
browser.commands.getAll().then((commands) => {
  const command = commands.find((c) => c.name === "open-prompt-selector");
  if (command && command.shortcut) {
    shortcutInput.value = command.shortcut;
  }
});

// Capture new shortcut
shortcutInput.addEventListener("keydown", async (e) => {
  e.preventDefault();

  const keys = [];
  if (e.ctrlKey) keys.push("Ctrl");
  if (e.altKey) keys.push("Alt");
  if (e.shiftKey) keys.push("Shift");
  if (e.metaKey) keys.push("Command");

  // Add the actual key if it's not a modifier
  if (!["Control", "Alt", "Shift", "Meta"].includes(e.key)) {
    keys.push(e.key.toUpperCase());
  }

  if (keys.length > 1) {
    const shortcut = keys.join("+");
    shortcutInput.value = shortcut;

    try {
      await browser.commands.update({
        name: "open-prompt-selector",
        shortcut: shortcut,
      });
      status.textContent = "Shortcut updated successfully!";
      setTimeout(() => {
        status.textContent = "";
      }, 3000);
    } catch (err) {
      status.textContent = "Error: " + err.message;
      status.style.color = "#e74c3c";
    }
  }
});
