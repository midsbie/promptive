import { logger } from "./logger";

export interface ConnectionEventHandlers {
  onOpen: () => void;
  onMessage: (data: string) => void;
  onError: (event: Event) => void;
  onClose: () => void;
}

export class ConnectionManager {
  private readonly endpoint: string;
  private readonly reconnectDelayMs: number;
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private handlers: ConnectionEventHandlers | null = null;

  constructor(opts: { endpoint: string; reconnectDelayMs?: number }) {
    const { endpoint, reconnectDelayMs = 3000 } = opts;
    this.endpoint = endpoint;
    this.reconnectDelayMs = reconnectDelayMs;
  }

  connect(handlers: ConnectionEventHandlers): void {
    if (this.socket?.readyState === WebSocket.OPEN) return;
    if (this.socket?.readyState === WebSocket.CONNECTING) return;

    this.handlers = handlers;
    this.clearReconnectTimer();

    try {
      this.socket = new WebSocket(this.endpoint);
      this.socket.addEventListener("open", this.onOpen);
      this.socket.addEventListener("message", this.onMessage);
      this.socket.addEventListener("error", this.onError);
      this.socket.addEventListener("close", this.onClose);
      logger.info("Connecting to endpoint", this.endpoint);
    } catch (error) {
      logger.error("Failed to create WebSocket", error);
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.clearReconnectTimer();
    if (!this.socket) return;

    this.socket.removeEventListener("open", this.onOpen);
    this.socket.removeEventListener("message", this.onMessage);
    this.socket.removeEventListener("error", this.onError);
    this.socket.removeEventListener("close", this.onClose);

    try {
      if (
        this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING
      ) {
        this.socket.close();
      }
    } catch (error) {
      logger.error("Error closing WebSocket", error);
    }

    this.socket = null;
    this.handlers = null;
  }

  send(data: string): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      logger.warn("Attempted to send while socket not open", data);
      return false;
    }

    try {
      this.socket.send(data);
      return true;
    } catch (error) {
      logger.error("Failed to send data", error, data);
      return false;
    }
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    logger.info("Scheduling reconnect in", this.reconnectDelayMs, "ms");
    this.reconnectTimer = setTimeout(() => {
      this.clearReconnectTimer();
      if (this.handlers) this.connect(this.handlers);
    }, this.reconnectDelayMs);
  }

  private onOpen = (): void => {
    logger.info("WebSocket connected");
    this.handlers?.onOpen();
  };

  private onMessage = (event: MessageEvent<string>): void => {
    const data = typeof event.data === "string" ? event.data : null;
    if (data === null) {
      logger.warn("Received non-text frame", event.data);
      return;
    }
    this.handlers?.onMessage(data);
  };

  private onError = (event: Event): void => {
    logger.error("WebSocket error", event);
    this.handlers?.onError(event);
  };

  private onClose = (): void => {
    logger.warn("WebSocket closed");
    this.socket = null;
    this.handlers?.onClose();
  };

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
