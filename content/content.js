// Content script for prompt insertion and popover management
let popoverElement = null;
let selectedIndex = 0;
let filteredPrompts = [];

// Listen for messages from background script
browser.runtime.onMessage.addListener(async (message) => {
  if (message.action === "openPopover") {
    await showPopover();
  } else if (message.action === "insertPrompt") {
    insertText(message.prompt);
    showToast("Prompt inserted");
  }
});

async function showPopover() {
  // Remove existing popover if any
  if (popoverElement) {
    popoverElement.remove();
  }

  // Get prompts from background
  const prompts = await browser.runtime.sendMessage({ action: "getPrompts" });
  filteredPrompts = prompts;
  selectedIndex = 0;

  // Create popover
  popoverElement = document.createElement("div");
  popoverElement.className = "prompt-library-popover";
  popoverElement.innerHTML = `
    <div class="plp-container">
      <div class="plp-header">
        <input type="text" class="plp-search" placeholder="Search prompts..." autocomplete="off">
        <button class="plp-close" aria-label="Close">×</button>
      </div>
      <div class="plp-list" role="listbox">
        ${renderPromptList(prompts)}
      </div>
    </div>
  `;

  document.body.appendChild(popoverElement);

  // Setup event handlers
  const searchInput = popoverElement.querySelector(".plp-search");
  const closeBtn = popoverElement.querySelector(".plp-close");
  const list = popoverElement.querySelector(".plp-list");

  searchInput.focus();

  searchInput.addEventListener("input", (e) => {
    handleSearch(e.target.value, prompts);
  });

  searchInput.addEventListener("keydown", (e) => {
    handleKeyDown(e);
  });

  closeBtn.addEventListener("click", closePopover);

  list.addEventListener("click", (e) => {
    const item = e.target.closest(".plp-item");
    if (item) {
      const index = parseInt(item.dataset.index);
      selectPrompt(filteredPrompts[index]);
    }
  });

  // Close on outside click
  document.addEventListener("click", handleOutsideClick);

  // Close on Escape
  document.addEventListener("keydown", handleEscape);
}

function renderPromptList(prompts) {
  if (prompts.length === 0) {
    return '<div class="plp-empty">No prompts found</div>';
  }

  return prompts
    .map(
      (prompt, index) => `
    <div class="plp-item ${index === selectedIndex ? "plp-selected" : ""}" 
         data-index="${index}" 
         role="option"
         aria-selected="${index === selectedIndex}">
      <div class="plp-item-title">${escapeHtml(prompt.title)}</div>
      <div class="plp-item-content">${escapeHtml(prompt.content.substring(0, 100))}...</div>
      ${
        prompt.tags && prompt.tags.length > 0
          ? `
        <div class="plp-item-tags">
          ${prompt.tags.map((tag) => `<span class="plp-tag">${escapeHtml(tag)}</span>`).join("")}
        </div>
      `
          : ""
      }
    </div>
  `
    )
    .join("");
}

function handleSearch(query, allPrompts) {
  if (!query.trim()) {
    filteredPrompts = allPrompts;
  } else {
    // Simple fuzzy search
    const queryLower = query.toLowerCase();
    filteredPrompts = allPrompts.filter((prompt) => {
      const titleMatch = prompt.title.toLowerCase().includes(queryLower);
      const contentMatch = prompt.content.toLowerCase().includes(queryLower);
      const tagsMatch =
        prompt.tags && prompt.tags.some((tag) => tag.toLowerCase().includes(queryLower));
      return titleMatch || contentMatch || tagsMatch;
    });
  }

  selectedIndex = 0;
  const list = popoverElement.querySelector(".plp-list");
  list.innerHTML = renderPromptList(filteredPrompts);
}

function handleKeyDown(e) {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    selectedIndex = Math.min(selectedIndex + 1, filteredPrompts.length - 1);
    updateSelection();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    selectedIndex = Math.max(selectedIndex - 1, 0);
    updateSelection();
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (filteredPrompts[selectedIndex]) {
      selectPrompt(filteredPrompts[selectedIndex]);
    }
  } else if (e.key === "Escape") {
    e.preventDefault();
    closePopover();
  }
}

function updateSelection() {
  const items = popoverElement.querySelectorAll(".plp-item");
  items.forEach((item, index) => {
    if (index === selectedIndex) {
      item.classList.add("plp-selected");
      item.setAttribute("aria-selected", "true");
      item.scrollIntoView({ block: "nearest" });
    } else {
      item.classList.remove("plp-selected");
      item.setAttribute("aria-selected", "false");
    }
  });
}

async function selectPrompt(prompt) {
  // Record usage
  await browser.runtime.sendMessage({
    action: "recordUsage",
    promptId: prompt.id,
  });

  // Insert or copy
  insertText(prompt.content);

  closePopover();
}

function insertText(text) {
  const activeElement = document.activeElement;

  // Check if we can insert into the active element
  if (
    activeElement &&
    (activeElement.tagName === "INPUT" ||
      activeElement.tagName === "TEXTAREA" ||
      activeElement.contentEditable === "true")
  ) {
    if (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA") {
      const start = activeElement.selectionStart;
      const end = activeElement.selectionEnd;
      const value = activeElement.value;
      activeElement.value = value.substring(0, start) + text + value.substring(end);
      activeElement.selectionStart = activeElement.selectionEnd = start + text.length;
      activeElement.focus();
    } else {
      // ContentEditable
      document.execCommand("insertText", false, text);
    }
    showToast("Prompt inserted");
  } else {
    // Copy to clipboard
    navigator.clipboard.writeText(text).then(() => {
      showToast("Prompt copied to clipboard");
    });
  }
}

function closePopover() {
  if (popoverElement) {
    popoverElement.remove();
    popoverElement = null;
  }
  document.removeEventListener("click", handleOutsideClick);
  document.removeEventListener("keydown", handleEscape);
}

function handleOutsideClick(e) {
  if (popoverElement && !popoverElement.contains(e.target)) {
    closePopover();
  }
}

function handleEscape(e) {
  if (e.key === "Escape" && popoverElement) {
    closePopover();
  }
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "prompt-library-toast";
  toast.textContent = message;
  toast.setAttribute("role", "alert");
  toast.setAttribute("aria-live", "polite");
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("show");
  }, 10);

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
