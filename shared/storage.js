// Shared storage module for prompt management
export class PromptStorage {
  constructor() {
    this.STORAGE_KEY = "prompts";
    this.VERSION_KEY = "storage_version";
  }

  async initialize() {
    const { [this.STORAGE_KEY]: prompts } = await browser.storage.local.get(this.STORAGE_KEY);
    if (!prompts) {
      await this.seedInitialData();
    }
  }

  async seedInitialData() {
    const seedPrompts = [
      {
        id: this.generateId(),
        title: "Professional Email",
        content:
          "Dear [Name],\n\nI hope this email finds you well. I wanted to reach out regarding [topic].\n\nBest regards,\n[Your name]",
        tags: ["email", "professional", "template"],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_used: null,
        used_times: 0,
      },
      {
        id: this.generateId(),
        title: "Code Review Comment",
        content:
          "Great work! A few suggestions:\n1. Consider extracting this logic into a separate function for reusability\n2. Add error handling for edge cases\n3. Could we add unit tests for this functionality?",
        tags: ["code", "review", "feedback"],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_used: null,
        used_times: 0,
      },
      {
        id: this.generateId(),
        title: "Meeting Notes Template",
        content:
          "## Meeting: [Title]\n**Date:** [Date]\n**Attendees:** [Names]\n\n### Agenda\n- \n\n### Discussion Points\n- \n\n### Action Items\n- [ ] \n\n### Next Steps\n- ",
        tags: ["meeting", "notes", "template"],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_used: null,
        used_times: 0,
      },
    ];

    await browser.storage.local.set({ [this.STORAGE_KEY]: seedPrompts });
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  async getAllPrompts() {
    const { [this.STORAGE_KEY]: prompts = [] } = await browser.storage.local.get(this.STORAGE_KEY);
    return prompts;
  }

  async getPrompt(id) {
    const prompts = await this.getAllPrompts();
    return prompts.find((p) => p.id === id);
  }

  async savePrompt(prompt) {
    const prompts = await this.getAllPrompts();
    const now = new Date().toISOString();

    if (prompt.id) {
      // Update existing
      const index = prompts.findIndex((p) => p.id === prompt.id);
      if (index !== -1) {
        prompts[index] = { ...prompt, updated_at: now };
      }
    } else {
      // Create new
      prompts.push({
        ...prompt,
        id: this.generateId(),
        created_at: now,
        updated_at: now,
        last_used: null,
        used_times: 0,
      });
    }

    await browser.storage.local.set({ [this.STORAGE_KEY]: prompts });
    return prompts;
  }

  async deletePrompt(id) {
    const prompts = await this.getAllPrompts();
    const filtered = prompts.filter((p) => p.id !== id);
    await browser.storage.local.set({ [this.STORAGE_KEY]: filtered });
    return filtered;
  }

  async recordUsage(id) {
    const prompts = await this.getAllPrompts();
    const prompt = prompts.find((p) => p.id === id);
    if (prompt) {
      prompt.last_used = new Date().toISOString();
      prompt.used_times = (prompt.used_times || 0) + 1;
      await browser.storage.local.set({ [this.STORAGE_KEY]: prompts });
    }
  }

  async importPrompts(importData) {
    if (!importData.version || !importData.prompts) {
      throw new Error("Invalid import format");
    }

    const currentPrompts = await this.getAllPrompts();
    const mergedPrompts = [...currentPrompts];

    for (const importPrompt of importData.prompts) {
      const existing = currentPrompts.find(
        (p) => p.title === importPrompt.title && p.content === importPrompt.content
      );

      if (existing) {
        // Merge: update if import is newer
        if (new Date(importPrompt.updated_at) > new Date(existing.updated_at)) {
          const index = mergedPrompts.findIndex((p) => p.id === existing.id);
          mergedPrompts[index] = { ...importPrompt, id: existing.id };
        }
      } else {
        // Add new
        mergedPrompts.push({
          ...importPrompt,
          id: this.generateId(),
        });
      }
    }

    await browser.storage.local.set({ [this.STORAGE_KEY]: mergedPrompts });
    return mergedPrompts;
  }

  async exportPrompts() {
    const prompts = await this.getAllPrompts();
    return {
      version: 1,
      exported_at: new Date().toISOString(),
      prompts,
    };
  }
}
