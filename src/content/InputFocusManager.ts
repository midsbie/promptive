import { Provider, detectProvider, getProviderConfig } from "../lib/providers";

export class InputFocusManager {
  focusProviderInput(provider?: Provider): boolean {
    if (!provider) {
      provider = detectProvider(window.location.href);
      if (!provider) return false;
    }

    const config = getProviderConfig(provider);
    if (!config) return false; // not supposed to happen

    const inputElement = document.querySelector(config.inputSelector) as HTMLElement | null;
    if (!inputElement) return false;

    inputElement.focus();
    if (!inputElement.isContentEditable) return true;

    const selection = window.getSelection();
    if (!selection) return true;

    const range = document.createRange();
    range.selectNodeContents(inputElement);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }
}
