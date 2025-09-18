type LogLevel = "debug" | "log" | "info" | "warn" | "error";

export class Logger {
  private namespace: string;

  constructor(namespace: string) {
    this.namespace = namespace;
  }

  debug(...args: unknown[]): void {
    this.output("debug", ...args);
  }

  log(...args: unknown[]): void {
    this.output("log", ...args);
  }

  info(...args: unknown[]): void {
    this.output("info", ...args);
  }

  warn(...args: unknown[]): void {
    this.output("warn", ...args);
  }

  error(...args: unknown[]): void {
    this.output("error", ...args);
  }

  private output(fn: LogLevel, ...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console[fn](`[${this.namespace}]`, ...args);
  }
}
