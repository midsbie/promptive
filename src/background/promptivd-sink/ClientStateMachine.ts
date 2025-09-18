import { logger } from "./logger";

export enum ClientState {
  Disconnected = "DISCONNECTED",
  Connecting = "CONNECTING",
  Connected = "CONNECTED",
  Registered = "REGISTERED",
  Reconnecting = "RECONNECTING",
  Stopped = "STOPPED",
}

export enum ClientEvent {
  Start = "START",
  Stop = "STOP",
  ConnectionOpened = "CONNECTION_OPENED",
  ConnectionClosed = "CONNECTION_CLOSED",
  ConnectionError = "CONNECTION_ERROR",
  Registered = "REGISTERED",
  ReconnectRequested = "RECONNECT_REQUESTED",
}

export interface StateChangeHandler {
  (oldState: ClientState, newState: ClientState, event: ClientEvent): void;
}

export interface StateTransitionTable {
  [state: string]: {
    [event: string]: ClientState;
  };
}

export type StateChangeEvent = {
  oldState: ClientState;
  newState: ClientState;
  event: ClientEvent;
};

export class ClientStateMachine extends EventTarget {
  static readonly EVENT_STATE_CHANGE = "stateChange";

  private currentState: ClientState = ClientState.Disconnected;

  private readonly transitions: StateTransitionTable = {
    [ClientState.Disconnected]: {
      [ClientEvent.Start]: ClientState.Connecting,
      [ClientEvent.Stop]: ClientState.Stopped,
    },
    [ClientState.Connecting]: {
      [ClientEvent.ConnectionOpened]: ClientState.Connected,
      [ClientEvent.ConnectionError]: ClientState.Reconnecting,
      [ClientEvent.ConnectionClosed]: ClientState.Reconnecting,
      [ClientEvent.Stop]: ClientState.Stopped,
    },
    [ClientState.Connected]: {
      [ClientEvent.Registered]: ClientState.Registered,
      [ClientEvent.ConnectionClosed]: ClientState.Reconnecting,
      [ClientEvent.ConnectionError]: ClientState.Reconnecting,
      [ClientEvent.Stop]: ClientState.Stopped,
    },
    [ClientState.Registered]: {
      [ClientEvent.ConnectionClosed]: ClientState.Reconnecting,
      [ClientEvent.ConnectionError]: ClientState.Reconnecting,
      [ClientEvent.Stop]: ClientState.Stopped,
    },
    [ClientState.Reconnecting]: {
      [ClientEvent.Start]: ClientState.Connecting,
      [ClientEvent.ReconnectRequested]: ClientState.Connecting,
      [ClientEvent.Stop]: ClientState.Stopped,
    },
    [ClientState.Stopped]: {},
  };

  getCurrentState(): ClientState {
    return this.currentState;
  }

  transition(event: ClientEvent): boolean {
    const validTransitions = this.transitions[this.currentState];
    const newState = validTransitions?.[event];

    if (!newState) {
      logger.warn("Invalid transition", {
        currentState: this.currentState,
        event,
        validTransitions: Object.keys(validTransitions || {}),
      });
      return false;
    }

    const oldState = this.currentState;
    this.currentState = newState;

    logger.info("State transition", {
      from: oldState,
      to: newState,
      event,
    });

    this.dispatchEvent(
      new CustomEvent<StateChangeEvent>(ClientStateMachine.EVENT_STATE_CHANGE, {
        detail: { oldState, newState, event },
      })
    );
    return true;
  }

  canTransition(event: ClientEvent): boolean {
    const validTransitions = this.transitions[this.currentState];
    return Boolean(validTransitions?.[event]);
  }

  isRunning(): boolean {
    return ![ClientState.Disconnected, ClientState.Stopped].includes(this.currentState);
  }

  isConnected(): boolean {
    return [ClientState.Connected, ClientState.Registered].includes(this.currentState);
  }

  isRegistered(): boolean {
    return this.currentState === ClientState.Registered;
  }

  reset(): void {
    const oldState = this.currentState;
    this.currentState = ClientState.Disconnected;
    logger.info("State machine reset", { from: oldState, to: this.currentState });
  }
}
