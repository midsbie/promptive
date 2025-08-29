import { MSG, createMessage, send } from "../lib/messaging";
import { Prompt } from "../lib/storage";
import { ToastOptions } from "../lib/typedefs";

export class ToastService {
  static show(message: string, { durationMs = 3000 }: ToastOptions = {}): void {
    const toast = document.createElement("div");
    toast.className = "promptive-toast";
    toast.textContent = message;
    toast.setAttribute("role", "alert");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);

    // trigger transition
    requestAnimationFrame(() => toast.classList.add("show"));

    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, durationMs);
  }
}

export class BackgroundAPI {
  async getPrompts(): Promise<Prompt[]> {
    const r = await send(createMessage(MSG.GET_PROMPTS));
    return r.prompts;
  }

  async recordUsage(promptId: string): Promise<void> {
    await send(createMessage(MSG.RECORD_PROMPT_USAGE, { promptId }));
  }
}
