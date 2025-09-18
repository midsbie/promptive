import { PromptEditor } from "./PromptEditor";
import { PromptiveSidebar } from "./PromptiveSidebar";
import { Router } from "./Router";
import { logger } from "./logger";
import { ToastService } from "./services";

const router = new Router();
const toasts = new ToastService();

let sidebarInstance: PromptiveSidebar | null = null;
let editorInstance: PromptEditor | null = null;

function createEditorView(id?: string | null) {
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
  document.getElementById("listView")!.style.display = "block";
  document.getElementById("editorView")!.style.display = "none";

  if (!sidebarInstance) sidebarInstance = new PromptiveSidebar();
  router.setCurrentView(sidebarInstance);
});

router.addRoute("/editor/new", () => {
  document.getElementById("listView")!.style.display = "none";
  document.getElementById("editorView")!.style.display = "block";

  createEditorView();
});

router.addRoute("/editor/:id", () => {
  document.getElementById("listView")!.style.display = "none";
  document.getElementById("editorView")!.style.display = "block";

  const id = router.getParam(window.location.hash.slice(1), "id");
  createEditorView(id);
});

// Export for global access
(window as any).router = router;
