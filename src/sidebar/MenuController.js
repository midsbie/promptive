export class MenuController {
  open(wrapper) {
    const btn = wrapper.querySelector(".kebab-btn");
    const menu = wrapper.querySelector(".menu");
    btn?.setAttribute("aria-expanded", "true");
    menu?.classList.add("open");
    menu?.setAttribute("aria-hidden", "false");
  }

  close(wrapper) {
    if (!wrapper) return;
    const btn = wrapper.querySelector(".kebab-btn");
    const menu = wrapper.querySelector(".menu");
    btn?.setAttribute("aria-expanded", "false");
    menu?.classList.remove("open");
    menu?.setAttribute("aria-hidden", "true");
  }

  bind(container, onAction) {
    // kebab open/close
    container.querySelectorAll(".kebab-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const wrapper = e.currentTarget.closest(".menu-wrapper");
        const expanded = e.currentTarget.getAttribute("aria-expanded") === "true";
        document.querySelectorAll(".menu.open").forEach((m) => {
          const w = m.closest(".menu-wrapper");
          if (w !== wrapper) this.close(w);
        });
        expanded ? this.close(wrapper) : this.open(wrapper);
      });
      btn.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const wrapper = e.currentTarget.closest(".menu-wrapper");
          const expanded = e.currentTarget.getAttribute("aria-expanded") === "true";
          if (expanded) this.close(wrapper);
          else {
            this.open(wrapper);
            wrapper.querySelector(".menu-item")?.focus();
          }
        }
      });
    });

    // click & keyboard on menu items
    container.querySelectorAll(".menu").forEach((menu) => {
      menu.addEventListener("click", (e) => {
        const btn = e.target.closest(".menu-item");
        if (!btn) return;
        const id = btn.dataset.id;
        const action = btn.dataset.action;
        onAction(action, id);
        this.close(menu.closest(".menu-wrapper"));
      });
      menu.addEventListener("keydown", (e) => {
        const items = Array.from(menu.querySelectorAll(".menu-item"));
        const idx = items.indexOf(document.activeElement);
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
          const wrapper = menu.closest(".menu-wrapper");
          this.close(wrapper);
          wrapper.querySelector(".kebab-btn")?.focus();
        }
      });
    });

    // global close-on-outside-click
    document.addEventListener("click", (e) => {
      const openMenus = document.querySelectorAll(".menu.open");
      openMenus.forEach((menu) => {
        const wrapper = menu.closest(".menu-wrapper");
        if (wrapper && !wrapper.contains(e.target)) this.close(wrapper);
      });
    });
  }
}
