import { getRequiredElement } from "../lib/dom";

import { PromptEditor } from "./PromptEditor";
import { PromptiveSidebar } from "./PromptiveSidebar";
import { Router } from "./Router";
import { logger } from "./logger";
import { ToastService } from "./services";

const router = new Router();
const toasts = new ToastService();

let sidebarInstance: PromptiveSidebar | null = null;
let editorInstance: PromptEditor | null = null;

function showEditor(id?: string | null) {
  editorInstance?.destroy();

  getRequiredElement("listView").style.display = "none";
  getRequiredElement("editorView").style.display = "block";

  editorInstance = new PromptEditor(id);
  editorInstance.initialize().catch((e) => {
    logger.error("PromptEditor initialization failed", e);
    toasts.show("Failed to initialize editor");
  });

  logger.info(`Editor view created (id: ${id || "new"})`);
  router.setCurrentView(editorInstance);
}

// Routes
router.addRoute("/", () => {
  if (editorInstance) {
    editorInstance.destroy();
    editorInstance = null;
  }

  getRequiredElement("listView").style.display = "block";
  getRequiredElement("editorView").style.display = "none";

  if (!sidebarInstance) sidebarInstance = new PromptiveSidebar();
  router.setCurrentView(sidebarInstance);
});

router.addRoute("/editor/new", () => {
  showEditor();
});

router.addRoute("/editor/:id", () => {
  const id = router.getParam(window.location.hash.slice(1), "id");
  showEditor(id);
});

// Export for global access
(window as any).router = router;
