import { MSG, createMessage, send } from "../lib/messaging";
import { ClientState } from "../lib/promptivd";

import { logger } from "./logger";

export class PromptivdStatusController {
  private indicatorEl: HTMLDivElement;
  private textEl: HTMLSpanElement;
  private buttonEl: HTMLButtonElement;

  constructor(indicatorEl: HTMLDivElement, textEl: HTMLSpanElement, buttonEl: HTMLButtonElement) {
    this.indicatorEl = indicatorEl;
    this.textEl = textEl;
    this.buttonEl = buttonEl;
  }

  async initialize(): Promise<void> {
    this.buttonEl.addEventListener("click", this.onButtonClick);

    try {
      const response = await send(createMessage(MSG.PROMPTIVD_GET_STATUS));
      this.updateStatus(response.state);
    } catch (error) {
      logger.warn("Failed to get initial status:", error);
      this.updateStatus(ClientState.Disconnected);
    }
  }

  private onButtonClick = async (): Promise<void> => {
    const currentState = this.buttonEl.dataset.state as ClientState;
    const isRunning = [
      ClientState.Connected,
      ClientState.Registered,
      ClientState.Connecting,
      ClientState.Reconnecting,
    ].includes(currentState);

    try {
      if (isRunning) {
        await send(createMessage(MSG.PROMPTIVD_STOP));
      } else {
        await send(createMessage(MSG.PROMPTIVD_START));
      }

      // Refresh status after action
      const response = await send(createMessage(MSG.PROMPTIVD_GET_STATUS));
      this.updateStatus(response.state);
    } catch (error) {
      logger.error("Failed to toggle promptivd status:", error);
    }
  };

  updateStatus(state: ClientState): void {
    this.indicatorEl.className = state.toLowerCase();
    this.textEl.textContent = state;
    this.buttonEl.dataset.state = state;

    switch (state) {
      case ClientState.Connected:
      case ClientState.Registered:
        this.buttonEl.textContent = "Disconnect";
        this.buttonEl.disabled = false;
        break;

      case ClientState.Connecting:
      case ClientState.Reconnecting:
        this.buttonEl.textContent = "Connecting...";
        this.buttonEl.disabled = true;
        break;

      case ClientState.Disconnected:
      case ClientState.Stopped:
        this.buttonEl.textContent = "Connect";
        this.buttonEl.disabled = false;
        break;
    }

    logger.log(this.buttonEl.textContent);
  }
}
