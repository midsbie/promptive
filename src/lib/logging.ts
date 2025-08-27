type LogLevel = "debug" | "log" | "info" | "warn" | "error";

export class Logger {
  private namespace: string;

  constructor(namespace: string) {
    this.namespace = namespace;
  }

  debug(...args: unknown[]): void {
    this._log("debug", ...args);
  }

  log(...args: unknown[]): void {
    this._log("log", ...args);
  }

  info(...args: unknown[]): void {
    this._log("info", ...args);
  }

  warn(...args: unknown[]): void {
    this._log("warn", ...args);
  }

  error(...args: unknown[]): void {
    this._log("error", ...args);
  }

  private _log(fn: LogLevel, ...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console[fn](`[${this.namespace}]`, ...args);
  }
}
