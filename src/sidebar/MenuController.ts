interface MenuActionHandler {
  (action: string, id: string): void;
}

export class MenuController {
  open(wrapper: HTMLElement): void {
    const btn = wrapper.querySelector(".kebab-btn") as HTMLButtonElement | null;
    const menu = wrapper.querySelector(".menu") as HTMLElement | null;
    btn?.setAttribute("aria-expanded", "true");
    menu?.classList.add("open");
    menu?.setAttribute("aria-hidden", "false");
  }

  close(wrapper: HTMLElement | null): void {
    if (!wrapper) return;
    const btn = wrapper.querySelector(".kebab-btn") as HTMLButtonElement | null;
    const menu = wrapper.querySelector(".menu") as HTMLElement | null;
    btn?.setAttribute("aria-expanded", "false");
    menu?.classList.remove("open");
    menu?.setAttribute("aria-hidden", "true");
  }

  bind(container: HTMLElement, onAction: MenuActionHandler): void {
    // kebab open/close
    container.querySelectorAll(".kebab-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const wrapper = (e.currentTarget as HTMLElement).closest(".menu-wrapper") as HTMLElement | null;
        const expanded = (e.currentTarget as HTMLElement).getAttribute("aria-expanded") === "true";
        document.querySelectorAll(".menu.open").forEach((m) => {
          const w = m.closest(".menu-wrapper") as HTMLElement | null;
          if (w !== wrapper) this.close(w);
        });
        expanded ? this.close(wrapper) : this.open(wrapper!);
      });
      btn.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const wrapper = (e.currentTarget as HTMLElement).closest(".menu-wrapper") as HTMLElement | null;
          const expanded = (e.currentTarget as HTMLElement).getAttribute("aria-expanded") === "true";
          if (expanded) this.close(wrapper);
          else {
            this.open(wrapper!);
            (wrapper?.querySelector(".menu-item") as HTMLElement)?.focus();
          }
        }
      });
    });

    // click & keyboard on menu items
    container.querySelectorAll(".menu").forEach((menu) => {
      menu.addEventListener("click", (e) => {
        const btn = (e.target as HTMLElement).closest(".menu-item") as HTMLElement | null;
        if (!btn) return;
        const id = btn.dataset.id!;
        const action = btn.dataset.action!;
        onAction(action, id);
        this.close(menu.closest(".menu-wrapper") as HTMLElement | null);
      });
      menu.addEventListener("keydown", (e) => {
        const items = Array.from(menu.querySelectorAll(".menu-item")) as HTMLElement[];
        const idx = items.indexOf(document.activeElement as HTMLElement);
        if (e.key === "ArrowDown") {
          e.preventDefault();
          items[(idx + 1) % items.length]?.focus();
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          items[(idx - 1 + items.length) % items.length]?.focus();
        } else if (e.key === "Home") {
          e.preventDefault();
          items[0]?.focus();
        } else if (e.key === "End") {
          e.preventDefault();
          items[items.length - 1]?.focus();
        } else if (e.key === "Escape") {
          e.preventDefault();
          const wrapper = menu.closest(".menu-wrapper") as HTMLElement | null;
          this.close(wrapper);
          (wrapper?.querySelector(".kebab-btn") as HTMLElement)?.focus();
        }
      });
    });

    // global close-on-outside-click
    document.addEventListener("click", (e) => {
      const openMenus = document.querySelectorAll(".menu.open");
      openMenus.forEach((menu) => {
        const wrapper = menu.closest(".menu-wrapper") as HTMLElement | null;
        if (wrapper && !wrapper.contains(e.target as Node)) this.close(wrapper);
      });
    });
  }
}