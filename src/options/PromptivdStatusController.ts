import { MSG, createMessage, send } from "../lib/messaging";
import { ClientState } from "../lib/promptivd";
import { AppSettings, SettingsRepository } from "../lib/settings";

import { logger } from "./logger";

export class PromptivdStatusController {
  private static readonly CONNECTION_STATES: ClientState[] = [
    ClientState.Disconnected,
    ClientState.Stopped,
  ];

  private indicatorEl: HTMLDivElement;
  private textEl: HTMLSpanElement;
  private toggleBtnEl: HTMLButtonElement;
  private connectBtnEl: HTMLButtonElement;
  private repo: SettingsRepository;
  private enabled: boolean = true;
  private state: ClientState = ClientState.Disconnected;

  constructor(
    indicatorEl: HTMLDivElement,
    textEl: HTMLSpanElement,
    toggleBtnEl: HTMLButtonElement,
    connectBtnEl: HTMLButtonElement,
    repo: SettingsRepository
  ) {
    this.indicatorEl = indicatorEl;
    this.textEl = textEl;
    this.toggleBtnEl = toggleBtnEl;
    this.connectBtnEl = connectBtnEl;
    this.repo = repo;
  }

  async initialize(): Promise<void> {
    this.toggleBtnEl.addEventListener("click", this.onToggleClick);
    this.connectBtnEl.addEventListener("click", this.onConnectClick);

    // Initialize button from settings repository
    const settings = this.repo.get();
    this.enabled = Boolean(settings.promptivd.enabled);
    this.updateToggleButton();
    this.updateConnectButton();

    try {
      const response = await send(createMessage(MSG.PROMPTIVD_GET_STATUS));
      this.updateStatus(response.state);
    } catch (error) {
      logger.warn("Failed to get initial status:", error);
      this.updateStatus(ClientState.Disconnected);
    }
  }

  private canConnect(): boolean {
    return this.enabled && PromptivdStatusController.CONNECTION_STATES.includes(this.state);
  }

  private onToggleClick = async (): Promise<void> => {
    try {
      const current = this.repo.get();
      const nextEnabled = !current.promptivd.enabled;
      const next: AppSettings = Object.freeze({
        ...current,
        promptivd: {
          ...current.promptivd,
          enabled: nextEnabled,
        },
      });
      await this.repo.save(next);
      this.enabled = nextEnabled;
      this.updateToggleButton();
      this.updateConnectButton();
    } catch (error) {
      logger.error("Failed to toggle promptivd enabled:", error);
    }
  };

  private onConnectClick = async (): Promise<void> => {
    if (!this.canConnect()) return;

    try {
      await send(createMessage(MSG.PROMPTIVD_START));
    } catch (e) {
      logger.error("Failed to connect to promptivd:", e);
    }
  };

  updateStatus(state: ClientState): void {
    this.state = state;
    this.indicatorEl.className = state.toLowerCase();
    this.textEl.textContent = state;
    this.updateConnectButton();
  }

  private updateToggleButton(): void {
    this.toggleBtnEl.textContent = this.enabled ? "Disable" : "Enable";
    this.toggleBtnEl.setAttribute("aria-pressed", this.enabled ? "true" : "false");
    this.toggleBtnEl.classList.toggle("is-on", this.enabled);
    this.toggleBtnEl.classList.toggle("is-off", !this.enabled);
  }

  private updateConnectButton(): void {
    const show = this.canConnect();
    this.connectBtnEl.hidden = !show;
    this.connectBtnEl.disabled = !show; // in case it's hidden via CSS removal
    if (show) this.connectBtnEl.textContent = "Connect";
  }
}
