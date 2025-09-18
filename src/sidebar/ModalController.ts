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
    const modal = document.getElementById("promptModal")!;
    const h = document.getElementById("modalTitle")!;
    h.textContent = title;
    (document.getElementById("promptForm") as HTMLFormElement).reset();
    (document.getElementById("promptTitle") as HTMLInputElement).value = fields?.title ?? "";
    (document.getElementById("promptContent") as HTMLTextAreaElement).value = fields?.content ?? "";
    (document.getElementById("promptTags") as HTMLInputElement).value =
      fields?.tags?.join(", ") ?? "";
    modal.classList.add("active");
    (document.getElementById("promptTitle") as HTMLInputElement).focus();
    this.release = FocusTrap.trap(modal);
  }

  close(): void {
    document.getElementById("promptModal")!.classList.remove("active");
    if (!this.release) return;

    this.release();
    this.release = null;
  }

  isOpen(): boolean {
    return document.getElementById("promptModal")!.classList.contains("active");
  }

  bind(): void {
    document.getElementById("cancelBtn")!.addEventListener("click", () => this.close());
    document.getElementById("promptModal")!.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).id === "promptModal") this.close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isOpen()) this.close();
    });
  }
}
