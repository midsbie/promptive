export class Logger {
  constructor(namespace) {
    this.namespace = namespace;
  }

  debug(...args) {
    this._log("debug", ...args);
  }

  log(...args) {
    this._log("log", ...args);
  }

  info(...args) {
    this._log("info", ...args);
  }

  warn(...args) {
    this._log("warn", ...args);
  }

  error(...args) {
    this._log("error", ...args);
  }

  _log(fn, ...args) {
    // eslint-disable-next-line no-console
    console[fn](`[${this.namespace}]`, ...args);
  }
}
