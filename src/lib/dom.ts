// Gets a required DOM element by ID, throwing a descriptive error if not found.
// Use this instead of non-null assertions (!) for safer runtime behavior.
export function getRequiredElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Required element not found: #${id}`);
  }
  return el as T;
}

// Gets a required DOM element by selector, throwing a descriptive error if not found.
export function queryRequiredElement<T extends Element = Element>(selector: string): T {
  const el = document.querySelector(selector);
  if (!el) {
    throw new Error(`Required element not found: ${selector}`);
  }
  return el as T;
}
