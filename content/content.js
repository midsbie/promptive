// Content script for prompt insertion and popover management
let popoverElement = null;
let selectedIndex = 0;
let filteredPrompts = [];
let targetElement = null;

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

  // Store reference to currently focused element
  targetElement = document.activeElement;

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
  // Use stored target element instead of current activeElement
  const element = targetElement;

  // Check for conditions where we should copy to clipboard instead
  if (
    !element ||
    element === document.body ||
    element === document.documentElement ||
    !(
      element.tagName === "INPUT" ||
      element.tagName === "TEXTAREA" ||
      element.contentEditable === "true" ||
      element.hasAttribute("contenteditable")
    )
  ) {
    // Copy to clipboard as fallback
    navigator.clipboard.writeText(text).then(() => {
      showToast("Prompt copied to clipboard");
    });
    return;
  }

  // We have a valid target element to insert into
  if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
    // Handle standard input/textarea elements
    const start = element.selectionStart || 0;
    const end = element.selectionEnd || 0;
    const value = element.value || "";
    element.value = value.substring(0, start) + text + value.substring(end);
    element.selectionStart = element.selectionEnd = start + text.length;
    element.focus();

    // Dispatch input event for frameworks that listen for it
    element.dispatchEvent(new Event("input", { bubbles: true }));
  } else if (element.contentEditable === "true" || element.hasAttribute("contenteditable")) {
    // Handle contentEditable elements (including ProseMirror)
    element.focus();

    // Convert plain text to HTML with proper paragraph structure
    const lines = text.split("\n");
    const htmlContent = lines
      .map((line) => (line.trim() === "" ? "<p><br></p>" : `<p>${escapeHtml(line)}</p>`))
      .join("");

    // Try to insert as HTML first
    if (document.queryCommandSupported && document.queryCommandSupported("insertHTML")) {
      document.execCommand("insertHTML", false, htmlContent);
    } else if (document.queryCommandSupported && document.queryCommandSupported("insertText")) {
      // Fallback to plain text if HTML insertion isn't supported
      document.execCommand("insertText", false, text);
    } else {
      // Manual insertion using Selection API with HTML
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();

        // Create a temporary div to parse HTML
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = htmlContent;

        // Insert each child node
        while (tempDiv.firstChild) {
          range.insertNode(tempDiv.firstChild);
          range.collapse(false);
        }

        selection.removeAllRanges();
        selection.addRange(range);
      }
    }

    // Dispatch input event for frameworks
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  showToast("Prompt inserted");
}

function closePopover() {
  if (popoverElement) {
    popoverElement.remove();
    popoverElement = null;
  }

  targetElement = null;

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
