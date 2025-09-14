import { PromptEditor } from "./PromptEditor";
import { PromptiveSidebar } from "./PromptiveSidebar";
import { Router } from "./Router";

const router = new Router();
let sidebarInstance: PromptiveSidebar | null = null;
let editorInstance: PromptEditor | null = null;

// Routes
router.addRoute("/", () => {
  document.getElementById("listView")!.style.display = "block";
  document.getElementById("editorView")!.style.display = "none";

  if (!sidebarInstance) {
    sidebarInstance = new PromptiveSidebar();
  }
  router.setCurrentView(sidebarInstance);
});

router.addRoute("/editor/new", () => {
  document.getElementById("listView")!.style.display = "none";
  document.getElementById("editorView")!.style.display = "block";

  editorInstance = new PromptEditor();
  router.setCurrentView(editorInstance);
});

router.addRoute("/editor/:id", () => {
  document.getElementById("listView")!.style.display = "none";
  document.getElementById("editorView")!.style.display = "block";

  const id = router.getParam(window.location.hash.slice(1), "id");
  editorInstance = new PromptEditor(id);
  router.setCurrentView(editorInstance);
});

// Export for global access
(window as any).router = router;
