export class TimeProvider {
  /** @returns {string} ISO-8601 */
  static nowIso() {
    return new Date().toISOString();
  }
}
