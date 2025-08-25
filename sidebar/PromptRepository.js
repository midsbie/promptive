import { PromptStorage } from "../shared/storage.js";

export class PromptRepository {
  constructor(storage = new PromptStorage()) {
    this.storage = storage;
  }

  async init() {
    await this.storage.initialize();
  }

  async list() {
    return this.storage.getAllPrompts();
  }

  async save(promptData) {
    return this.storage.savePrompt(promptData);
  }

  async remove(id) {
    return this.storage.deletePrompt(id);
  }

  async recordUse(id) {
    return this.storage.recordUsage(id);
  }

  async import(data) {
    return this.storage.importPrompts(data);
  }

  async export() {
    return this.storage.exportPrompts();
  }

  onChanged(cb) {
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.prompts) cb();
    });
  }
}
