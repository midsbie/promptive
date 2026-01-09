export class ClipboardService {
  async write(text: string): Promise<void> {
    await navigator.clipboard.writeText(text);
  }

  /** Alias for write() */
  async copy(text: string): Promise<void> {
    return this.write(text);
  }

  async read(): Promise<string> {
    return navigator.clipboard.readText();
  }
}
