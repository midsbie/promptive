export interface BatchProgressState {
  index: number;
  total: number;
  status: "waiting-ready" | "sending" | "waiting-accepted" | "paused";
}

export class BatchProgressUI {
  private container: HTMLDivElement | null = null;
  private onCancel: () => void;
  private state: BatchProgressState = { index: 0, total: 0, status: "waiting-ready" };

  constructor(onCancel: () => void) {
    this.onCancel = onCancel;
  }

  show(initialState: BatchProgressState): void {
    if (!this.container) {
      this.createDOM();
    }
    this.update(initialState);
    if (this.container) {
      this.container.style.display = "block";
    }
  }

  update(newState: Partial<BatchProgressState>): void {
    this.state = { ...this.state, ...newState };
    if (!this.container) return;

    const progressText = this.container.querySelector(".batch-progress-text");
    if (progressText) {
      progressText.textContent = `Sending part ${this.state.index + 1} of ${this.state.total}`;
    }

    const statusText = this.container.querySelector(".batch-status-text");
    if (statusText) {
      let text = "";
      switch (this.state.status) {
        case "waiting-ready":
          text = "Waiting for composer...";
          break;
        case "sending":
          text = "Sending...";
          break;
        case "waiting-accepted":
          text = "Waiting for response...";
          break;
        case "paused":
          text = "Paused";
          break;
      }
      statusText.textContent = text;
    }

    // Optional: Update progress bar if we had one
  }

  hide(): void {
    if (this.container) {
      this.container.style.display = "none";
    }
  }

  destroy(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }

  private createDOM(): void {
    this.container = document.createElement("div");
    this.container.className = "promptive-batch-widget";

    const content = document.createElement("div");
    content.className = "promptive-batch-content";

    const info = document.createElement("div");
    info.className = "promptive-batch-info";

    const progress = document.createElement("div");
    progress.className = "batch-progress-text";

    const status = document.createElement("div");
    status.className = "batch-status-text";

    info.appendChild(progress);
    info.appendChild(status);

    const controls = document.createElement("div");
    controls.className = "promptive-batch-controls";

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.className = "promptive-btn promptive-btn-danger";
    cancelBtn.onclick = () => this.onCancel();

    controls.appendChild(cancelBtn);

    content.appendChild(info);
    content.appendChild(controls);
    this.container.appendChild(content);

    document.body.appendChild(this.container);
  }
}
