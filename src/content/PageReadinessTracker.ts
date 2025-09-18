import { Eventful, WithEventTarget } from "./eventful";

class PageReadinessTrackerBase {
  static readonly EVENT_READY = "ready";

  private isReady = false;

  initialize(): void {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", this.handleDOMContentLoaded);
      return;
    }

    this.isReady = true;
    this.notifyReady();
  }

  private handleDOMContentLoaded = (): void => {
    this.isReady = true;
    document.removeEventListener("DOMContentLoaded", this.handleDOMContentLoaded);
    this.notifyReady();
  };

  private notifyReady(): void {
    this.dispatchEvent(new Event(PageReadinessTrackerBase.EVENT_READY));
  }

  getReadiness(): boolean {
    return this.isReady;
  }

  declare addEventListener: Eventful["addEventListener"];
  declare removeEventListener: Eventful["removeEventListener"];
  declare dispatchEvent: Eventful["dispatchEvent"];
}

export class PageReadinessTracker extends WithEventTarget(PageReadinessTrackerBase) {}
