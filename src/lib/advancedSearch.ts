import Fuse, { IFuseOptions } from 'fuse.js';

export interface SearchQuery {
  originalQuery: string;
  terms: string[];
  orderNumbers: string[];
  emails: string[];
  customerNames: string[];
  skus: string[];
  dateRange?: {
    start?: Date;
    end?: Date;
  };
  statusFilters?: string[];
  amountRange?: {
    min?: number;
    max?: number;
  };
  searchType: 'simple' | 'advanced' | 'batch';
}

export interface SearchSuggestion {
  text: string;
  type: 'order' | 'customer' | 'email' | 'filter';
  count?: number;
  icon?: string;
}

export class AdvancedSearchProcessor {
  private static readonly ORDER_NUMBER_PATTERNS = [
    /order\s*#?\s*(\d{4,})/i, // "Order #12345" or "order 12345"
    /#(\d{4,})/,             // #4272
  ];
  private static readonly EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  private static readonly SKU_PATTERN = /\b([A-Z]{2,}-\d{3,}|\d{3,}-[A-Z]{2,}|[A-Z]{2,}\d{4,})\b/ig;

  /**
   * Parses a search query into structured components.
   */
  static parseQuery(query: string): {
    originalQuery: string;
    orderNumbers: string[];
    emails: string[];
    customerNames: string[];
    skus: string[];
  } {
    const originalQuery = query.trim();
    let remainingQuery = ` ${originalQuery} `; // Pad for easier regex

    // Extract Order Numbers
    const orderNumbers: string[] = [];
    this.ORDER_NUMBER_PATTERNS.forEach(pattern => {
      const globalPattern = new RegExp(pattern.source, 'gi');
      let match;
      while ((match = globalPattern.exec(remainingQuery)) !== null) {
        orderNumbers.push(match[1]);
      }
      remainingQuery = remainingQuery.replace(globalPattern, ' ');
    });
    // Add plain numbers as potential order numbers
    const plainNumbers = remainingQuery.match(/\b(\d{4,})\b/g);
    if (plainNumbers) {
        orderNumbers.push(...plainNumbers);
        remainingQuery = remainingQuery.replace(/\b(\d{4,})\b/g, ' ');
    }

    // Extract SKUs
    const skus = [...(remainingQuery.match(this.SKU_PATTERN) || [])];
    if (skus.length > 0) {
        remainingQuery = remainingQuery.replace(this.SKU_PATTERN, ' ');
    }

    // Extract Emails
    const emails = [...(remainingQuery.match(this.EMAIL_PATTERN) || [])];
    if (emails.length > 0) {
      remainingQuery = remainingQuery.replace(this.EMAIL_PATTERN, ' ');
    }

    // The rest is the customer name
    const customerNames = remainingQuery.trim().split(/\s+/).filter(Boolean);

    return {
      originalQuery,
      orderNumbers: [...new Set(orderNumbers)],
      emails: [...new Set(emails)],
      customerNames,
      skus: [...new Set(skus)],
    };
  }

  static buildShopifyQuery(parsedQuery: ReturnType<typeof this.parseQuery>): string {
    const parts: string[] = [];
    if (parsedQuery.orderNumbers.length > 0) {
      parts.push(parsedQuery.orderNumbers.map(on => `(name:${on} OR name:#${on})`).join(' OR '));
    }
    if (parsedQuery.emails.length > 0) {
      parts.push(parsedQuery.emails.map(e => `email:${e}`).join(' OR '));
    }
    if (parsedQuery.skus.length > 0) {
        parts.push(parsedQuery.skus.map(sku => `sku:${sku}`).join(' OR '));
    }
    if (parsedQuery.customerNames.length > 0) {
      const nameQuery = parsedQuery.customerNames.join(' ');
      parts.push(`(first_name:*${nameQuery}* OR last_name:*${nameQuery}* OR company:*${nameQuery}*)`);
    }
    return parts.join(' OR ');
  }

  /**
   * Generate fuzzy search variants for a term
   */
  static generateFuzzyVariants(term: string): string[] {
    const variants = [term];
    
    // Handle common typos and variations
    const replacements = [
      ['@', 'at'],
      ['&', 'and'],
      ['co', 'company'],
      ['corp', 'corporation'],
      ['inc', 'incorporated'],
      ['llc', 'limited liability company'],
    ];

    for (const [from, to] of replacements) {
      if (term.toLowerCase().includes(from)) {
        variants.push(term.toLowerCase().replace(from, to));
      }
      if (term.toLowerCase().includes(to)) {
        variants.push(term.toLowerCase().replace(to, from));
      }
    }

    return [...new Set(variants)];
  }

  /**
   * Clean and normalize order number for better matching
   */
  static normalizeOrderNumber(orderNumber: string): string[] {
    const clean = orderNumber.replace(/[#\s-]/g, '');
    const variants = [
      clean,
      `#${clean}`,
      clean.padStart(4, '0'), // Pad with zeros
      clean.padStart(5, '0'),
    ];
    
    return [...new Set(variants)];
  }

  /**
   * Generate search suggestions based on input
   */
  static generateSuggestions(query: string, recentSearches: string[] = []): SearchSuggestion[] {
    const suggestions: SearchSuggestion[] = [];
    const parsed = this.parseQuery(query);

    // Recent searches
    recentSearches
      .filter(search => search.toLowerCase().includes(query.toLowerCase()) && search !== query)
      .slice(0, 3)
      .forEach(search => {
        suggestions.push({
          text: search,
          type: 'filter',
          icon: 'fa-history'
        });
      });

    // Order number suggestions
    if (parsed.orderNumbers.length === 0 && /^\d+$/.test(query)) {
      suggestions.push({
        text: `#${query}`,
        type: 'order',
        icon: 'fa-hashtag'
      });
    }

    // Filter suggestions
    if (query.length >= 2) {
      const filterSuggestions = [
        { text: `${query} status:paid`, type: 'filter' as const, icon: 'fa-filter' },
        { text: `${query} status:shipped`, type: 'filter' as const, icon: 'fa-shipping-fast' },
        { text: `${query} after:${new Date().toISOString().split('T')[0]}`, type: 'filter' as const, icon: 'fa-calendar' },
        { text: `${query} amount:>100`, type: 'filter' as const, icon: 'fa-dollar-sign' },
      ];
      
      suggestions.push(...filterSuggestions.slice(0, 2));
    }

    return suggestions.slice(0, 8);
  }

  /**
   * Create Fuse.js configuration for fuzzy searching
   */
  static createFuseConfig<T>(keys: string[], threshold: number = 0.3): IFuseOptions<T> {
    return {
      keys,
      threshold,
      distance: 100,
      minMatchCharLength: 2,
      shouldSort: true,
      includeScore: true,
      includeMatches: true,
      findAllMatches: true,
    };
  }

  /**
   * Perform fuzzy search on customer data
   */
  static fuzzySearchCustomers<T extends { customerFullName?: string; customerEmail?: string }>(
    data: T[],
    query: string,
    threshold: number = 0.4
  ): T[] {
    if (!query || data.length === 0) return [];

    const fuse = new Fuse(data, this.createFuseConfig([
      'customerFullName',
      'customerEmail'
    ], threshold));

    const results = fuse.search(query);
    return results.map(result => result.item);
  }

  /**
   * Extract meaningful parts from a query for better matching
   */
  static extractSearchContext(query: string): {
    isOrderNumber: boolean;
    isEmail: boolean;
    isCustomerName: boolean;
    confidence: number;
    suggestions: string[];
  } {
    const parsed = this.parseQuery(query);
    
    let confidence = 0;
    const suggestions: string[] = [];
    
    const isOrderNumber = parsed.orderNumbers.length > 0;
    const isEmail = parsed.emails.length > 0;
    const isCustomerName = parsed.customerNames.length > 0;

    if (isOrderNumber) {
      confidence += 0.8;
      suggestions.push('Try with or without # prefix');
    }
    
    if (isEmail) {
      confidence += 0.9;
      suggestions.push('Search by customer email');
    }
    
    if (isCustomerName) {
      confidence += 0.6;
      suggestions.push('Try partial name matching', 'Check spelling variants');
    }

    // Boost confidence for exact patterns
    if (/^\d{4,}$/.test(query)) confidence += 0.2;
    if (/@.*\./.test(query)) confidence += 0.1;

    return {
      isOrderNumber,
      isEmail,
      isCustomerName,
      confidence: Math.min(confidence, 1),
      suggestions
    };
  }
}

/**
 * Search history manager
 */
export class SearchHistoryManager {
  private static readonly STORAGE_KEY = 'orderSearchHistory';
  private static readonly MAX_HISTORY = 20;

  static addSearch(query: string): void {
    if (typeof window === 'undefined') return;
    
    const history = this.getHistory();
    const filtered = history.filter(item => item.query !== query);
    const newHistory = [
      { query, timestamp: new Date().toISOString() },
      ...filtered
    ].slice(0, this.MAX_HISTORY);
    
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(newHistory));
  }

  static getHistory(): Array<{ query: string; timestamp: string }> {
    if (typeof window === 'undefined') return [];
    
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  static getRecentQueries(limit: number = 10): string[] {
    return this.getHistory()
      .slice(0, limit)
      .map(item => item.query);
  }

  static clearHistory(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(this.STORAGE_KEY);
  }
} 