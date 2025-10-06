import browser from "webextension-polyfill";

import { ContentStatusProbe } from "../lib/ContentStatusProbe";
import { Logger } from "../lib/logging";
import { PORT } from "../lib/ports";
import { ClientState } from "../lib/promptivd";

import { StateChangeDetail } from "./promptivd-sink/ClientStateMachine";

import { PromptivdSinkController } from "./PromptivdSinkController";

const logger = new Logger("keep-alive");

/**
 * KeepAliveManager decides when a keep-alive should run and supervises a single internal worker
 * instance that performs the actual port keep-alive.
 */
export class KeepAliveManager {
  private worker: KeepAliveWorker | null = null;
  private controller: PromptivdSinkController | null = null;

  async initialize(controller: PromptivdSinkController): Promise<void> {
    this.removeEventListeners();

    this.controller = controller;
    this.controller.addEventListener(
      PromptivdSinkController.EVENT_STATE_CHANGE as string,
      this.onControllerStateChange as EventListener
    );

    const state = this.controller.getStatus();
    this.setActive(this.shouldKeepAlive(state));
  }

  destroy(): void {
    this.removeEventListeners();
    this.stop();
  }

  private onControllerStateChange = (evt: CustomEvent<StateChangeDetail>): void => {
    const nextActive = this.shouldKeepAlive(evt.detail.newState);
    logger.debug("status update", evt.detail);
    this.setActive(nextActive);
  };

  private shouldKeepAlive(state: ClientState): boolean {
    switch (state) {
      case ClientState.Connecting:
      case ClientState.Connected:
      case ClientState.Registered:
      case ClientState.Reconnecting:
        return true;
      // case ClientState.Disconnected:
      // case ClientState.Stopped:
      default:
        return false;
    }
  }

  private setActive(active: boolean): void {
    if (active) this.start();
    else this.stop();
  }

  private start(): void {
    if (this.worker) return;

    this.worker = new KeepAliveWorker();
    this.worker.start();
  }

  private stop(): void {
    if (this.worker) this.worker.stop();
    this.worker = null;
  }

  private removeEventListeners(): void {
    if (!this.controller) return;

    this.controller.removeEventListener(
      PromptivdSinkController.EVENT_STATE_CHANGE as string,
      this.onControllerStateChange as EventListener
    );
    this.controller = null;
  }
}

/**
 * Internal worker that performs the long-lived Port connection and retries.
 * Not exported; private to this module.
 */
class KeepAliveWorker {
  private static readonly RECONNECT_DELAY_MS = 5_000;
  private static readonly PING_INTERVAL_MS = 25_000;

  private readonly probe = new ContentStatusProbe();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connection: PortConnection | null = null;
  private heartbeat: PortHeartbeat | null = null;
  private abortCtl: AbortController | null = null;

  async start(): Promise<void> {
    if (this.abortCtl != null) return;

    this.abortCtl = new AbortController();
    await this.ensureConnected(this.abortCtl.signal);
  }

  stop(): void {
    this.abortCtl?.abort();

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;

    this.stopHeartbeat();
    this.disconnect();
    this.abortCtl = null;
  }

  private async ensureConnected(signal: AbortSignal): Promise<void> {
    if (signal.aborted) return;

    const tabId = await this.probe.findFirstActive();
    if (!tabId) {
      logger.debug("no content tab available; scheduling retry");
      this.scheduleReconnect();
      return;
    }

    // Preventing potential race condition when stop() is called while we're connecting.
    if (signal.aborted) return;

    this.disconnect();
    this.connection = new PortConnection(() => this.onPortDisconnected());

    try {
      const port = this.connection.connect(tabId);
      this.stopHeartbeat();
      this.heartbeat = new PortHeartbeat(port, KeepAliveWorker.PING_INTERVAL_MS);
      this.heartbeat.start();
      logger.info("port established", { tabId });
    } catch (e) {
      logger.warn("failed to open port", e);
      this.disconnect();
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.abortCtl) return;

    const signal = this.abortCtl.signal;
    if (signal.aborted) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureConnected(signal).catch((e) => logger.error("KeepAlive reconnect failed", e));
    }, KeepAliveWorker.RECONNECT_DELAY_MS);
  }

  private onPortDisconnected(): void {
    logger.debug("port disconnected");
    this.stopHeartbeat();
    this.connection = null;
    this.scheduleReconnect();
  }

  private stopHeartbeat(): void {
    this.heartbeat?.stop();
    this.heartbeat = null;
  }

  private disconnect(): void {
    try {
      this.connection?.disconnect();
    } catch (e) {
      logger.debug("Error during disconnect:", e);
    } finally {
      this.connection = null;
    }
  }
}

class PortConnection {
  private port: browser.Runtime.Port | null = null;
  private readonly onDisconnected: () => void;

  constructor(onDisconnected: () => void) {
    this.onDisconnected = onDisconnected;
  }

  connect(tabId: number): browser.Runtime.Port {
    this.disconnect();

    try {
      this.unsafeConnect(tabId);
      return this.port;
    } catch (e) {
      this.disconnect();
      throw e;
    }
  }

  isConnected(): boolean {
    return !!this.port;
  }

  getPort(): browser.Runtime.Port | null {
    return this.port;
  }

  disconnect(): void {
    if (!this.port) return;

    try {
      this.port.disconnect();
    } finally {
      this.port = null;
    }
  }

  private unsafeConnect(tabId: number): void {
    this.port = browser.tabs.connect(tabId, { name: PORT.KEEPALIVE });

    this.port.onDisconnect.addListener(() => {
      this.port = null;
      this.onDisconnected();
    });

    this.port.onMessage.addListener((_msg) => {
      // no-op
    });
  }
}

class PortHeartbeat {
  private readonly port: browser.Runtime.Port;
  private readonly intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(port: browser.Runtime.Port, intervalMs: number) {
    this.port = port;
    this.intervalMs = intervalMs;
  }

  start(): void {
    if (this.timer) return;

    this.timer = setInterval(() => {
      try {
        this.port.postMessage({ t: "ping" });
      } catch {
        // let the connection's onDisconnect handle recovery
      }
    }, this.intervalMs);
  }

  stop(): void {
    if (!this.timer) return;

    clearInterval(this.timer);
    this.timer = null;
  }
}
