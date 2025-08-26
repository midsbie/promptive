export class Logger {
  constructor(namespace) {
    this.namespace = namespace;
  }

  debug(...args) {
    console.debug(`[${this.namespace}]`, ...args);
  }

  info(...args) {
    console.info(`[${this.namespace}]`, ...args);
  }

  warn(...args) {
    console.warn(`[${this.namespace}]`, ...args);
  }

  error(...args) {
    console.error(`[${this.namespace}]`, ...args);
  }
}
