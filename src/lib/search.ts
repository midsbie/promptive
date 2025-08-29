import { Prompt } from "./storage";
import { normalizeForComparison } from "./string";

export type SearchableItem = Prompt;

interface AdvancedSearchScoredItem {
  score: number;
  matched: boolean;
}

interface FuzzySearchScoredItem<T extends SearchableItem> {
  item: T;
  score: number;
  matched: boolean;
}

interface ParsedQuery {
  phrases: string[]; // Exact phrases to match
  regularTerms: string[]; // Regular search terms
}

export interface ISearchStrategy {
  search<T extends SearchableItem>(query: string, items: T[]): T[];
}

class AdvancedSearchScorer<T extends SearchableItem> {
  private readonly RECENCY_WEIGHT = 0.3;
  private readonly POPULARITY_WEIGHT = 0.2;
  private readonly POSITION_WEIGHT = 2.0;
  private readonly TITLE_BASE_SCORE = 10;
  private readonly TAG_BASE_SCORE = 7;
  private readonly CONTENT_BASE_SCORE = 3;
  private readonly EXACT_PHRASE_MULTIPLIER = 2;

  private readonly item: T;
  private readonly title: string;
  private readonly content: string;
  private readonly tags: string[];

  constructor(item: T) {
    this.item = item;
    this.title = item.title.toLowerCase();
    this.content = item.content.toLowerCase();
    this.tags = item.tags.map((t) => t.toLowerCase());
  }

  score(parsedQuery: ParsedQuery): number {
    let total = 0;
    let r = this.scoreConjunctive(parsedQuery.phrases, this.scorePhrase.bind(this));
    if (!r.matched) return 0;
    total += r.score;

    r = this.scoreConjunctive(parsedQuery.regularTerms, this.scoreTerm.bind(this));
    if (!r.matched) return 0;
    total += r.score;

    return this.applyRankingFactors(total);
  }

  private scoreConjunctive(arr: string[], scorer: (s: string) => number): AdvancedSearchScoredItem {
    let total = 0;
    for (const term of arr) {
      const score = scorer(term);
      if (score <= 0) return { score: 0, matched: false };

      total += score;
    }

    return { score: total, matched: true };
  }

  private scorePhrase(phrase: string): number {
    let score = 0;
    const titleMatches = this.containsPhrase(this.title, phrase);
    const contentMatches = this.containsPhrase(this.content, phrase);
    const tagMatches = this.tags.filter((tag: string) => tag.includes(phrase)).length;

    if (titleMatches > 0) {
      const pos = this.title.indexOf(phrase.toLowerCase());
      score +=
        this.TITLE_BASE_SCORE *
        this.EXACT_PHRASE_MULTIPLIER *
        titleMatches *
        this.getPositionBonus(pos, this.title.length) *
        this.POSITION_WEIGHT;
    }

    if (contentMatches > 0) {
      const pos = this.content.indexOf(phrase.toLowerCase());
      score +=
        this.CONTENT_BASE_SCORE *
        this.EXACT_PHRASE_MULTIPLIER *
        contentMatches *
        this.getPositionBonus(pos, this.content.length);
    }

    if (tagMatches > 0) {
      score += this.TAG_BASE_SCORE * this.EXACT_PHRASE_MULTIPLIER * tagMatches;
    }

    return score;
  }

  private scoreTerm(term: string): number {
    let score = 0;

    // Escape regex metacharacters in term
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}`, "gi");

    // Title matches
    const titleMatches = this.title.match(regex);
    if (titleMatches) {
      const pos = this.title.search(regex);
      score +=
        this.TITLE_BASE_SCORE *
        titleMatches.length *
        this.getPositionBonus(pos, this.title.length) *
        this.POSITION_WEIGHT;
    }

    // Tag matches
    const matchingTags = this.tags.filter((tag) => regex.test(tag));
    if (matchingTags.length > 0) {
      score += this.TAG_BASE_SCORE * matchingTags.length;
    }

    // Content matches
    const contentMatches = this.content.match(regex);
    if (contentMatches) {
      const pos = this.content.search(regex);
      score +=
        this.CONTENT_BASE_SCORE *
        contentMatches.length *
        this.getPositionBonus(pos, this.content.length);
    }

    return score;
  }

  private applyRankingFactors(score: number): number {
    // Apply smart ranking factors if item has date/usage info
    if (score <= 0 || !("last_used_at" in this.item) || !("used_times" in this.item)) {
      return score;
    }

    // Recency boost
    const recencyScore = Math.max(
      this.getRecencyScore(this.item.last_used_at),
      this.getRecencyScore(this.item.updated_at) * 0.5
    );
    score *= 1 + recencyScore * this.RECENCY_WEIGHT;

    // Popularity boost
    const popularityScore = this.getPopularityScore(this.item.used_times);
    score *= 1 + popularityScore * this.POPULARITY_WEIGHT;

    return score;
  }

  /**
   * Check if text contains exact phrase
   */
  private containsPhrase(text: string, phrase: string): number {
    const textLower = text.toLowerCase();
    const phraseLower = phrase.toLowerCase();
    let count = 0;
    let pos = 0;

    while ((pos = textLower.indexOf(phraseLower, pos)) !== -1) {
      count++;
      pos += phraseLower.length;
    }

    return count;
  }

  /**
   * Calculate position bonus - matches at the beginning score higher
   */
  private getPositionBonus(position: number, textLength: number): number {
    if (textLength === 0) return 0;
    // Linear decay from 1.0 at position 0 to 0.1 at end
    return Math.max(0.1, 1 - (position / textLength) * 0.9);
  }

  /**
   * Calculate recency score (0-1 range)
   */
  private getRecencyScore(dateStr: string | null): number {
    if (!dateStr) return 0;

    const date = new Date(dateStr);
    const now = new Date();
    const daysDiff = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);

    // Score decay: 1.0 for today, 0.5 for 30 days ago, approaches 0 for older
    return Math.exp(-daysDiff / 30);
  }

  /**
   * Calculate popularity score (0-1 range)
   */
  private getPopularityScore(usedTimes: number): number {
    // Logarithmic scale to prevent runaway scores
    return Math.min(1, Math.log10(usedTimes + 1) / 2);
  }
}

export class AdvancedSearch implements ISearchStrategy {
  /**
   * Parse search query to extract operators
   */
  private parseQuery(query: string): ParsedQuery {
    const result: ParsedQuery = {
      phrases: [],
      regularTerms: [],
    };

    // Extract exact phrases (in quotes)
    const phraseRegex = /"([^"]+)"/g;
    let phraseMatch: RegExpExecArray;
    const phrasesFound: string[] = [];
    while ((phraseMatch = phraseRegex.exec(query)) !== null) {
      result.phrases.push(phraseMatch[1]);
      phrasesFound.push(phraseMatch[0]);
    }

    // Remove phrases from query for further processing
    let remainingQuery = query;
    phrasesFound.forEach((p) => {
      remainingQuery = remainingQuery.replace(p, "");
    });

    // Split remaining query into tokens
    const tokens = remainingQuery.split(/\s+/).filter((t) => t.length > 0);

    for (const token of tokens) {
      result.regularTerms.push(token);
    }

    // Deduplicate and normalize
    return {
      phrases: [...new Set(result.phrases.map(normalizeForComparison))],
      regularTerms: [...new Set(result.regularTerms.map(normalizeForComparison))],
    };
  }

  /**
   * Main search method
   */
  search = <T extends SearchableItem>(query: string, items: T[]): T[] => {
    if (!query.trim()) return items;

    const parsed = this.parseQuery(query);
    if (parsed.phrases.length + parsed.regularTerms.length < 1) return items;

    return items
      .map((item) => {
        const scorer = new AdvancedSearchScorer(item);
        return { item, score: scorer.score(parsed) };
      })
      .filter((si) => si.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((s) => s.item);
  };
}

export class FuzzySearch implements ISearchStrategy {
  search<T extends SearchableItem>(query: string, items: T[]): T[] {
    const queryLower = query.toLowerCase();
    const queryTokens = queryLower.split(/\s+/);

    const scored: FuzzySearchScoredItem<T>[] = items.map((item) => {
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

      return { item, score, matched: score > 0 };
    });

    // Filter and sort by score
    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((s) => s.item);
  }
}
