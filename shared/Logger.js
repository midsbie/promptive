export class Logger {
  constructor(namespace) {
    this.namespace = namespace;
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
