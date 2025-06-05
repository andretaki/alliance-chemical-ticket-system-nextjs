import Fuse, { IFuseOptions } from 'fuse.js';

export interface SearchQuery {
  originalQuery: string;
  terms: string[];
  orderNumbers: string[];
  emails: string[];
  customerNames: string[];
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
    /^\s*#?(\d{4,})\s*$/i,                    // #1234 or 1234
    /order\s*#?\s*(\d+)/i,                    // order #1234
    /inv(?:oice)?\s*#?\s*(\d+)/i,            // invoice #1234
    /po\s*#?\s*(\d+)/i,                      // PO #1234
    /ref\s*#?\s*(\d+)/i,                     // ref #1234
  ];

  private static readonly EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

  /**
   * Parse a search query into structured components
   */
  static parseQuery(query: string): SearchQuery {
    const originalQuery = query.trim();
    const terms = originalQuery.split(/\s+/).filter(term => term.length > 0);
    
    const orderNumbers: string[] = [];
    const emails: string[] = [];
    const customerNames: string[] = [];
    let remainingQuery = originalQuery;

    // Extract order numbers
    for (const pattern of this.ORDER_NUMBER_PATTERNS) {
      const matches = remainingQuery.match(pattern);
      if (matches) {
        orderNumbers.push(matches[1]);
        remainingQuery = remainingQuery.replace(pattern, '').trim();
      }
    }

    // Extract emails
    const emailMatches = remainingQuery.match(this.EMAIL_PATTERN);
    if (emailMatches) {
      emails.push(...emailMatches);
      remainingQuery = remainingQuery.replace(this.EMAIL_PATTERN, '').trim();
    }

    // Extract date filters (simple format: after:2024-01-01, before:2024-12-31)
    let dateRange: { start?: Date; end?: Date } | undefined;
    const afterMatch = remainingQuery.match(/after:(\d{4}-\d{2}-\d{2})/i);
    const beforeMatch = remainingQuery.match(/before:(\d{4}-\d{2}-\d{2})/i);
    
    if (afterMatch || beforeMatch) {
      dateRange = {};
      if (afterMatch) {
        dateRange.start = new Date(afterMatch[1]);
        remainingQuery = remainingQuery.replace(/after:\d{4}-\d{2}-\d{2}/i, '').trim();
      }
      if (beforeMatch) {
        dateRange.end = new Date(beforeMatch[1]);
        remainingQuery = remainingQuery.replace(/before:\d{4}-\d{2}-\d{2}/i, '').trim();
      }
    }

    // Extract status filters (status:paid, status:shipped)
    const statusMatches = remainingQuery.match(/status:(\w+)/gi);
    let statusFilters: string[] | undefined;
    if (statusMatches) {
      statusFilters = statusMatches.map(match => match.split(':')[1]);
      remainingQuery = remainingQuery.replace(/status:\w+/gi, '').trim();
    }

    // Extract amount filters (amount:>100, amount:<500)
    let amountRange: { min?: number; max?: number } | undefined;
    const amountMatches = remainingQuery.match(/amount:([><]=?)(\d+)/gi);
    if (amountMatches) {
      amountRange = {};
      amountMatches.forEach(match => {
        const [, operator, value] = match.match(/amount:([><]=?)(\d+)/i) || [];
        const amount = parseFloat(value);
        if (operator === '>' || operator === '>=') {
          amountRange!.min = amount;
        } else if (operator === '<' || operator === '<=') {
          amountRange!.max = amount;
        }
      });
      remainingQuery = remainingQuery.replace(/amount:[><]=?\d+/gi, '').trim();
    }

    // Remaining text is considered customer names
    if (remainingQuery) {
      customerNames.push(remainingQuery);
    }

    // Determine search type
    let searchType: 'simple' | 'advanced' | 'batch' = 'simple';
    if (orderNumbers.length > 1) {
      searchType = 'batch';
    } else if (dateRange || statusFilters || amountRange || (orderNumbers.length + emails.length + customerNames.length > 1)) {
      searchType = 'advanced';
    }

    return {
      originalQuery,
      terms,
      orderNumbers,
      emails,
      customerNames,
      dateRange,
      statusFilters,
      amountRange,
      searchType
    };
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