export class HTMLEscaper {
  static escape(text: string | null | undefined): string {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
  }
}

// Normalize a string for case- and accent-insensitive comparisons.
//
// Steps performed:
//  1. .trim(): removes leading and trailing whitespace
//  2. .toLowerCase(): converts to lowercase
//  3. .normalize("NFKD"): applies Unicode compatibility decomposition, splitting characters with
//     accents into base letters + combining marks
//     (e.g. "ó" -> "o" + "◌́")
//  4. .replace(/\p{Diacritic}/gu, ""): removes all combining diacritical marks (accents, tildes,
//     umlauts, etc.)
//
// Example:
//   "  Canción  " -> "cancion"
//
// The result is suitable for accent-insensitive, lowercase search or matching.
export function normalizeForComparison(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "");
}
