export class TimeProvider {
  static nowIso(): string {
    return new Date().toISOString();
  }
}
