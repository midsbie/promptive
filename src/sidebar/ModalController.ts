import { getRequiredElement } from "../lib/dom";
import { FocusTrap } from "../lib/ui/FocusTrap";

export interface ModalFields {
  title?: string;
  content?: string;
  tags?: string[];
}

export interface ModalOptions {
  title: string;
  fields?: ModalFields;
}

export class ModalController {
  private release: (() => void) | null;

  constructor() {
    this.release = null;
  }

  open({ title, fields }: ModalOptions): void {
    const modal = getRequiredElement("promptModal");
    const h = getRequiredElement("modalTitle");
    h.textContent = title;
    getRequiredElement<HTMLFormElement>("promptForm").reset();
    getRequiredElement<HTMLInputElement>("promptTitle").value = fields?.title ?? "";
    getRequiredElement<HTMLTextAreaElement>("promptContent").value = fields?.content ?? "";
    getRequiredElement<HTMLInputElement>("promptTags").value = fields?.tags?.join(", ") ?? "";
    modal.classList.add("active");
    getRequiredElement<HTMLInputElement>("promptTitle").focus();
    this.release = FocusTrap.trap(modal);
  }

  close(): void {
    getRequiredElement("promptModal").classList.remove("active");
    if (!this.release) return;

    this.release();
    this.release = null;
  }

  isOpen(): boolean {
    return getRequiredElement("promptModal").classList.contains("active");
  }

  bind(): void {
    getRequiredElement("cancelBtn").addEventListener("click", () => this.close());
    getRequiredElement("promptModal").addEventListener("click", (e) => {
      if ((e.target as HTMLElement).id === "promptModal") this.close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isOpen()) this.close();
    });
  }
}
