export class FocusTrap {
  static trap(element) {
    function onKey(e) {
      if (e.key !== "Tab") return;
      const nodes = element.querySelectorAll(
        'button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])'
      );
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    element.addEventListener("keydown", onKey);
    return () => element.removeEventListener("keydown", onKey);
  }
}
