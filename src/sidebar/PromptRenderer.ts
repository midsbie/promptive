import { Prompt } from "../lib/storage";
import { HtmlEscaper } from "../lib/string";
import * as icons from "../lib/ui/icons";

interface EscapeFunction {
  (text: string | null | undefined): string;
}

interface HtmlEscaperInterface {
  escape: EscapeFunction;
}

export class PromptRenderer {
  private escaper: HtmlEscaperInterface;

  constructor(escaper: HtmlEscaperInterface = HtmlEscaper) {
    this.escaper = escaper;
  }

  formatLastUsed(lastUsedAt?: string | null): string {
    if (!lastUsedAt) return "";
    try {
      const d = new Date(lastUsedAt);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return "";
    }
  }

  item(prompt: Prompt): string {
    const e = this.escaper.escape;
    const lastUsed = this.formatLastUsed(prompt.last_used_at);
    return `
      <div class="prompt-item" role="listitem">
        <div class="prompt-header">
          <div class="prompt-title">${e(prompt.title)}</div>
          <div class="prompt-actions">
            <button class="icon-btn use-btn ghost" data-id="${prompt.id}" aria-label="Use prompt" data-tooltip="Use">
              ${icons.insert}
            </button>
            <div class="menu-wrapper">
              <button class="icon-btn kebab-btn ghost" aria-label="More actions" aria-haspopup="menu" aria-expanded="false" data-tooltip="More">
                ${icons.kebab}
              </button>
              <div class="menu" role="menu" aria-hidden="true">
                <button class="menu-item" role="menuitem" data-action="edit" data-id="${prompt.id}">
                  ${icons.edit} <span>Edit</span>
                </button>
                <div class="menu-sep" role="separator"></div>
                <button class="menu-item danger" role="menuitem" data-action="delete" data-id="${prompt.id}">
                  ${icons.trash} <span>Delete</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="prompt-content">${e(prompt.content)}</div>
        ${
          prompt.tags && prompt.tags.length
            ? `<div class="prompt-tags-row">
                 <div class="prompt-tags">
                   ${prompt.tags.map((t) => `<span class="tag">${e(t)}</span>`).join("")}
                 </div>
               </div>`
            : ""
        }
        <div class="prompt-stats-row">
          <div class="prompt-stats">
            <span class="stat-item">
              <svg class="stat-icon" width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M3 3v18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              ${prompt.used_times || 0} times
            </span>
            ${
              prompt.last_used_at
                ? `
              <span class="stat-separator">•</span>
              <span class="stat-item">
                <svg class="stat-icon" width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                  <polyline points="12,6 12,12 16,14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                ${lastUsed}
              </span>`
                : ""
            }
          </div>
        </div>
      </div>
    `;
  }

  empty(): string {
    return `
      <div class="empty-state">
        <h3>No prompts yet</h3>
        <p>Click "Add" to create your first prompt</p>
      </div>
    `;
  }

  list(prompts: Prompt[]): string {
    if (!prompts || !prompts.length) return this.empty();
    return prompts.map((p) => this.item(p)).join("");
  }
}
