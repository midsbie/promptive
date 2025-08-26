export class FuzzySearch {
  search(query, items) {
    const queryLower = query.toLowerCase();
    const queryTokens = queryLower.split(/\s+/);

    const scored = items.map((item) => {
      let score = 0;
      const titleLower = (item.title || "").toLowerCase();
      const contentLower = (item.content || "").toLowerCase();
      const tagsLower = (item.tags || []).join(" ").toLowerCase();

      // Check each query token
      for (const token of queryTokens) {
        // Exact match in title (highest score)
        if (titleLower.includes(token)) score += 10;

        // Exact match in tags (high score)
        if (tagsLower.includes(token)) score += 7;

        // Exact match in content (medium score)
        if (contentLower.includes(token)) score += 5;

        // Fuzzy match (character presence)
        const chars = token.split("");
        let charIndex = 0;

        // Check title
        for (const char of titleLower) {
          if (chars[charIndex] === char) {
            charIndex++;
            score += 0.5;
            if (charIndex === chars.length) break;
          }
        }

        // Reset for content check
        charIndex = 0;
        for (const char of contentLower) {
          if (chars[charIndex] === char) {
            charIndex++;
            score += 0.2;
            if (charIndex === chars.length) break;
          }
        }
      }

      return { item, score };
    });

    // Filter and sort by score
    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((s) => s.item);
  }
}
