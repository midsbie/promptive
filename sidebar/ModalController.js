import { FocusTrap } from "../shared/ui/FocusTrap.js";

export class ModalController {
  constructor() {
    this._release = null;
  }

  open({ title, fields }) {
    const modal = document.getElementById("promptModal");
    const h = document.getElementById("modalTitle");
    h.textContent = title;
    document.getElementById("promptForm").reset();
    document.getElementById("promptTitle").value = fields?.title ?? "";
    document.getElementById("promptContent").value = fields?.content ?? "";
    document.getElementById("promptTags").value = fields?.tags?.join(", ") ?? "";
    modal.classList.add("active");
    document.getElementById("promptTitle").focus();
    this._release = FocusTrap.trap(modal);
  }

  close() {
    document.getElementById("promptModal").classList.remove("active");
    if (this._release) {
      this._release();
      this._release = null;
    }
  }

  isOpen() {
    return document.getElementById("promptModal").classList.contains("active");
  }

  bind() {
    document.getElementById("cancelBtn").addEventListener("click", () => this.close());
    document.getElementById("promptModal").addEventListener("click", (e) => {
      if (e.target.id === "promptModal") this.close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isOpen()) this.close();
    });
  }
}
