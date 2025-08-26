/**
 * Handles messages routed from content scripts or sidebar.
 * Keeps methods tiny and single-purpose.
 */
export class MessageRouter {
  constructor(repo) {
    this.repo = repo;
  }

  attach() {
    browser.runtime.onMessage.addListener((request, sender) => {
      switch (request?.action) {
        case "getPrompts":
          return this.repo.getAllPrompts();
        case "recordUsage":
          return this.repo.recordUsage(request.promptId);
        default:
          return false;
      }
    });
  }
}
