import { AdvancedSearch, ISearchStrategy, SearchableItem } from "./search";

export class SearchService {
  private strategy: ISearchStrategy;

  constructor(strategy: ISearchStrategy = new AdvancedSearch()) {
    this.strategy = strategy;
  }

  search = <T extends SearchableItem>(query: string, items: T[]): T[] => {
    if (!query || !query.trim()) return items;
    return this.strategy.search(query, items);
  };
}
