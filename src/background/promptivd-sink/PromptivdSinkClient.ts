import { ClientState } from "../../lib/promptivd";

import { ClientEvent, ClientStateMachine, StateChangeDetail } from "./ClientStateMachine";
import { ConnectionEventHandlers, ConnectionManager } from "./ConnectionManager";
import { AckStatus, JobManager, JobTimeoutEvent } from "./JobManager";
import { PolicyFrame, PolicyManager } from "./PolicyManager";
import { logger } from "./logger";

const SCHEMA_VERSION = "1.0" as const;

type SchemaVersion = typeof SCHEMA_VERSION;
type Capability = "insert";

interface RegisterFrame {
  type: "register";
  schema_version: SchemaVersion;
  version: string;
  capabilities: Capability[];
  providers: string[];
}

interface PingFrame {
  type: "ping";
  schema_version: SchemaVersion;
}

interface PongFrame {
  type: "pong";
  schema_version: SchemaVersion;
}
export interface Source {
  client: string;
  label: string | null;
  path: string | null;
}

export interface Target {
  provider: string | null;
  session_policy: "reuse_or_create" | "reuse_only" | "start_fresh" | null;
}

export type PlacementType = "top" | "bottom" | "cursor";

export interface InsertTextFrame {
  type: "insert_text";
  schema_version: SchemaVersion;
  id: string;
  payload: {
    text: string;
    placement: { type: PlacementType } | null;
    source: Source;
    target: Target | null;
    metadata?: Record<string, unknown> | null;
  };
}

type RelayInboundFrame = PolicyFrame | PingFrame | InsertTextFrame;

interface AckFrame {
  type: "ack";
  schema_version: SchemaVersion;
  id: string;
  status: AckStatus;
  error: string | null;
}

export type InsertTextDetail = { frame: InsertTextFrame };
export type ConnectionErrorDetail = { error: string };
export type RegisteredDetail = void;

interface PromptivdSinkOptions {
  endpoint: string;
  extensionVersion: string;
  providers?: string[];
  reconnectDelayMs?: number;
  jobTimeoutMs?: number;
}

export interface InsertTextHandler {
  (frame: InsertTextFrame): Promise<boolean>;
}

export class PromptivdSinkClient extends EventTarget {
  static readonly DEFAULT_JOB_TIMEOUT_MS = 2500 as const;

  static readonly EVENT_INSERT_TEXT = "inserttext" as const;
  static readonly EVENT_STATE_CHANGE = "statechange" as const;
  static readonly EVENT_CONNECTION_ERROR = "connectionerror" as const;
  static readonly EVENT_REGISTERED = "registered" as const;

  readonly endpoint: string;
  private readonly extensionVersion: string;
  private readonly providers: string[];
  private readonly policyManager: PolicyManager;
  private readonly connectionManager: ConnectionManager;
  private readonly jobManager: JobManager;
  private readonly stateMachine: ClientStateMachine;

  constructor(options: PromptivdSinkOptions) {
    super();

    this.endpoint = options.endpoint;
    this.extensionVersion = options.extensionVersion;
    this.providers = options.providers ?? [];

    this.policyManager = new PolicyManager();

    this.connectionManager = new ConnectionManager({
      endpoint: this.endpoint,
      reconnectDelayMs: options.reconnectDelayMs,
    });

    this.jobManager = new JobManager({
      jobTimeoutMs: options.jobTimeoutMs ?? PromptivdSinkClient.DEFAULT_JOB_TIMEOUT_MS,
    });
    this.jobManager.addEventListener(JobManager.EVENT_JOB_TIMEOUT, this.onJobTimeout);

    this.stateMachine = new ClientStateMachine();
    this.stateMachine.addEventListener(ClientStateMachine.EVENT_STATE_CHANGE, this.onStateChange);
  }

  start(): void {
    logger.info("Starting promptivd sink client");
    this.stateMachine.transition(ClientEvent.Start);
  }

  stop(): void {
    logger.info("Stopping promptivd sink client");
    this.stateMachine.transition(ClientEvent.Stop);
  }

  isConnected(): boolean {
    return this.stateMachine.isConnected();
  }

  isRegistered(): boolean {
    return this.stateMachine.isRegistered();
  }

  getCurrentState(): ClientState {
    return this.stateMachine.getCurrentState();
  }

  private onStateChange = (event: CustomEvent<StateChangeDetail>): void => {
    const { oldState, newState, event: stateEvent } = event.detail;

    this.dispatchEvent(
      new CustomEvent<StateChangeDetail>(PromptivdSinkClient.EVENT_STATE_CHANGE, {
        detail: { oldState, newState, event: stateEvent },
      })
    );

    switch (newState) {
      case ClientState.Connecting:
        this.connectToRelay();
        break;
      case ClientState.Connected:
        this.sendRegister();
        break;
      case ClientState.Registered:
        logger.info("Client registered and ready");
        this.dispatchEvent(new CustomEvent<RegisteredDetail>(PromptivdSinkClient.EVENT_REGISTERED));
        break;
      case ClientState.Reconnecting:
        this.connectionManager.scheduleReconnect();
        break;
      case ClientState.Stopped:
        this.connectionManager.disconnect();
        this.jobManager.clearAll();
        break;
    }
  };

  private onMessage = (data: string): void => {
    let frame: RelayInboundFrame | PongFrame | null = null;
    try {
      frame = JSON.parse(data) as RelayInboundFrame | PongFrame;
    } catch (error) {
      logger.warn("Failed to parse frame", error, data);
      return;
    }

    if (!frame || typeof frame !== "object") return;

    switch (frame.type) {
      case "policy":
        this.policyManager.applyPolicy(frame);
        return;
      case "ping":
        this.sendFrame({ type: "pong", schema_version: SCHEMA_VERSION });
        return;
      case "insert_text":
        this.insertTextFrame(frame).catch((error) => {
          logger.error("Unhandled insert handler error", error);
        });
        return;
      default:
        logger.warn("Ignoring unsupported frame", frame);
    }
  };

  private onJobTimeout = (event: CustomEvent<JobTimeoutEvent>): void => {
    this.sendAck({
      id: event.detail.jobId,
      status: "failed",
      error: "Job timed out before completion",
    });
  };

  private connectToRelay(): void {
    const handlers: ConnectionEventHandlers = {
      onOpen: () => {
        this.policyManager.reset();
        this.stateMachine.transition(ClientEvent.ConnectionOpened);
      },
      onMessage: this.onMessage,
      onError: (_event: Event) => {
        this.dispatchEvent(
          new CustomEvent<ConnectionErrorDetail>(PromptivdSinkClient.EVENT_CONNECTION_ERROR, {
            detail: { error: "WebSocket connection error" },
          })
        );
        this.stateMachine.transition(ClientEvent.ConnectionError);
      },
      onClose: () => {
        this.jobManager.clearOutstanding();
        this.stateMachine.transition(ClientEvent.ConnectionClosed);
      },
    };

    this.connectionManager.connect(handlers);
  }

  private async insertTextFrame(frame: InsertTextFrame): Promise<void> {
    if (!this.jobManager.startJob(frame.id)) return;

    this.dispatchEvent(
      new CustomEvent<InsertTextDetail>(PromptivdSinkClient.EVENT_INSERT_TEXT, {
        detail: { frame },
      })
    );
  }

  completeJob(jobId: string): void {
    this.resolveJob(jobId, "ok", null);
  }

  failJob(jobId: string, error: string): void {
    this.resolveJob(jobId, "failed", error);
  }

  private resolveJob(jobId: string, status: AckStatus, error: string | null): void {
    if (!this.stateMachine.isRegistered()) {
      logger.warn("Cannot complete job - client not registered", jobId);
      return;
    }

    if (!this.jobManager.completeJob(jobId)) return;
    this.sendAck({ id: jobId, status, error });
  }

  private sendRegister(): void {
    const frame: RegisterFrame = {
      type: "register",
      schema_version: SCHEMA_VERSION,
      version: this.extensionVersion,
      capabilities: ["insert"],
      providers: this.providers,
    };

    this.jobManager.clearAll();

    logger.info("REGISTER frame", frame);
    this.sendFrame(frame);
    this.stateMachine.transition(ClientEvent.Registered);
  }

  private sendAck(frame: Omit<AckFrame, "type" | "schema_version">): void {
    this.sendFrame({
      type: "ack",
      schema_version: SCHEMA_VERSION,
      ...frame,
    });
  }

  private sendFrame(frame: RegisterFrame | PongFrame | AckFrame): void {
    const success = this.connectionManager.send(JSON.stringify(frame));
    if (!success) {
      logger.warn("Failed to send frame", frame);
    }
  }
}
