import { InsertPosition, PartialPrompt, Prompt, PromptRepository } from "../lib/storage";

import { Router } from "./Router";
import { logger } from "./logger";
import { ToastService } from "./services";

export class PromptEditor {
  private repo: PromptRepository;
  private toasts: ToastService;
  private promptId: string | null;
  private isDirty: boolean;
  private prompt: Prompt | null;

  constructor(promptId?: string | null) {
    this.repo = new PromptRepository();
    this.toasts = new ToastService();
    this.promptId = promptId || null;
    this.isDirty = false;
    this.prompt = null;
  }

  async initialize(): Promise<void> {
    await this.repo.initialize();

    if (this.promptId) {
      this.prompt = await this.repo.getPrompt(this.promptId);

      if (!this.prompt) {
        logger.error(`Prompt not found: ${this.promptId}`);
        Router.back();
        return;
      }
    }

    this.render();

    document.getElementById("backBtn")!.addEventListener("click", this.onBackClick);
    document.getElementById("saveBtn")!.addEventListener("click", this.onSaveClick);
    document.getElementById("editorForm")!.addEventListener("submit", this.onFormSubmit);

    const inputs = document.querySelectorAll("#editorForm input, #editorForm textarea");
    inputs.forEach((input) => {
      input.addEventListener("input", this.onInput);
    });

    document.addEventListener("keydown", this.onKeyDown);
    logger.info("PromptEditor initialized");
  }

  public destroy(): void {
    document.getElementById("backBtn")?.removeEventListener("click", this.onBackClick);
    document.getElementById("saveBtn")?.removeEventListener("click", this.onSaveClick);
    document.getElementById("editorForm")?.removeEventListener("submit", this.onFormSubmit);

    const inputs = document.querySelectorAll("#editorForm input, #editorForm textarea");
    inputs.forEach((input) => {
      input.removeEventListener("input", this.onInput);
    });

    document.removeEventListener("keydown", this.onKeyDown);
    logger.info("PromptEditor destroyed");
  }

  private render(): void {
    const container = document.getElementById("editorView")!;
    const isEdit = !!this.prompt;

    container.innerHTML = `
      <div class="editor-container">
        <header class="editor-header">
          <button id="backBtn" class="btn btn-secondary" aria-label="Go back">
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.42-1.41L7.83 13H20v-2z"/>
            </svg>
            Back
          </button>
          <h1>${isEdit ? "Edit Prompt" : "Add Prompt"}</h1>
          <button id="saveBtn" class="btn btn-primary">Save</button>
        </header>

        <main class="editor-main">
          <form id="editorForm" class="editor-form">
            <section class="form-section">
              <h2>Basics</h2>
              <div class="form-group">
                <label for="editorTitle">Title</label>
                <input type="text" id="editorTitle" required class="form-input" value="${this.prompt?.title || ""}" />
              </div>
              <div class="form-group">
                <label for="editorContent">Content</label>
                <textarea id="editorContent" required rows="10" class="form-input">${this.prompt?.content || ""}</textarea>
              </div>
              <div class="form-group">
                <label for="editorTags">Tags (comma-separated)</label>
                <input type="text" id="editorTags" placeholder="email, template, work" class="form-input" value="${this.prompt?.tags.join(", ") || ""}" />
              </div>
            </section>

            <section class="form-section">
              <h2>Insert Options</h2>
              <div class="form-group">
                <fieldset>
                  <legend>Insert Position</legend>
                  <div class="radio-group">
                    <label class="radio-label">
                      <input type="radio" name="insertAt" value="cursor" ${!this.prompt || this.prompt.insert_at === "cursor" ? "checked" : ""} />
                      <span>At cursor position (default)</span>
                    </label>
                    <label class="radio-label">
                      <input type="radio" name="insertAt" value="top" ${this.prompt?.insert_at === "top" ? "checked" : ""} />
                      <span>At top of text</span>
                    </label>
                    <label class="radio-label">
                      <input type="radio" name="insertAt" value="bottom" ${this.prompt?.insert_at === "bottom" ? "checked" : ""} />
                      <span>At end of text</span>
                    </label>
                  </div>
                </fieldset>
              </div>
              <div class="form-group">
                <label for="editorSeparator">Separator (optional)</label>
                <input type="text" id="editorSeparator" placeholder="---" class="form-input" value="${this.prompt?.separator || ""}" />
                <small class="form-help">Text to insert before/after the prompt content</small>
              </div>
            </section>
          </form>
        </main>
      </div>
    `;
  }

  private onBackClick = () => {
    this.confirmNavigateBack();
  };

  private onSaveClick = (e: Event) => {
    e.preventDefault();
    this.save();
  };

  private onFormSubmit = (e: Event) => {
    e.preventDefault();
    this.save();
  };

  private onInput = () => {
    this.isDirty = true;
  };

  private onKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case "s":
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          this.save();
        }
        return;

      case "Escape":
        e.preventDefault();
        this.confirmNavigateBack();
        return;
    }
  };

  private confirmNavigateBack(): void {
    if (this.isDirty) {
      if (!confirm("You have unsaved changes. Are you sure you want to go back?")) {
        return;
      }
    }

    Router.back();
  }

  private async save(): Promise<void> {
    const title = (document.getElementById("editorTitle") as HTMLInputElement).value.trim();
    const content = (document.getElementById("editorContent") as HTMLTextAreaElement).value.trim();
    const tags = (document.getElementById("editorTags") as HTMLInputElement).value
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t);
    const insertAt = (document.querySelector('input[name="insertAt"]:checked') as HTMLInputElement)
      ?.value as InsertPosition;
    const separator =
      (document.getElementById("editorSeparator") as HTMLInputElement).value.trim() || null;

    if (!title || !content) {
      this.toasts.show("Title and content are required");
      return;
    }

    try {
      const payload: PartialPrompt = {
        id: this.promptId ?? undefined,
        title,
        content,
        tags,
        insert_at: insertAt,
        separator,
      };

      await this.repo.savePrompt(payload);
      this.isDirty = false;
      this.toasts.show(this.promptId ? "Prompt updated" : "Prompt added");
      Router.back();
    } catch (e) {
      logger.error("Save failed", e);
      this.toasts.show("Failed to save prompt");
    }
  }
}
