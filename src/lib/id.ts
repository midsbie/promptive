export class IdGenerator {
  static newId(): string {
    // 12+ chars, URL-safe, stable across environments
    return (
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 10) +
      "-" +
      crypto.getRandomValues(new Uint32Array(1))[0].toString(36)
    );
  }
}
