'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDebounce } from 'use-debounce';
import axios from 'axios';
import Link from 'next/link';
import { OrderSearchResult } from '@/types/orderSearch';

interface UnifiedSearchResult {
  type: 'order' | 'customer' | 'ticket';
  data: any; // Can be OrderSearchResult, CustomerSearchResult, etc.
}

interface SearchSuggestion {
  text: string;
  type: 'history' | 'filter' | 'order' | 'batch';
  icon?: string;
  description?: string;
}

interface AdvancedSearchStats {
  searchType: 'simple' | 'advanced' | 'batch' | 'fuzzy';
  confidence: number;
  searchMethod: string;
  processingTime?: number;
}

interface SimpleOrderSearchProps {
  onResults?: (results: OrderSearchResult[]) => void;
  onSearching?: (isSearching: boolean) => void;
  onDebouncedQueryChange?: (query: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

// Search history management
const STORAGE_KEY = 'orderSearchHistory';
const MAX_HISTORY = 20;

const getSearchHistory = (): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const addToSearchHistory = (query: string): void => {
  if (typeof window === 'undefined') return;
  const history = getSearchHistory().filter(item => item !== query);
  const newHistory = [query, ...history].slice(0, MAX_HISTORY);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
};

export default function SimpleOrderSearch({
  onResults,
  onSearching,
  onDebouncedQueryChange,
  placeholder = "Search orders, customers, tickets...",
  autoFocus = false,
}: SimpleOrderSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OrderSearchResult[]>([]);
  const [unifiedResults, setUnifiedResults] = useState<UnifiedSearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const [searchStats, setSearchStats] = useState<AdvancedSearchStats | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showBatchMode, setShowBatchMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const [debouncedQuery] = useDebounce(query, 500);

  // Load search history on mount
  useEffect(() => {
    setSearchHistory(getSearchHistory());
  }, []);

  // Auto-focus input
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Generate suggestions as user types
  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    const newSuggestions: SearchSuggestion[] = [];

    // Recent searches that match current query
    const matchingHistory = searchHistory
      .filter(item => item.toLowerCase().includes(query.toLowerCase()) && item !== query)
      .slice(0, 3);
    
    matchingHistory.forEach(item => {
      newSuggestions.push({
        text: item,
        type: 'history',
        icon: '🕒',
        description: 'Recent search'
      });
    });

    // Order number suggestions
    if (/^\d+$/.test(query)) {
      newSuggestions.push({
        text: `#${query}`,
        type: 'order',
        icon: '🔢',
        description: 'Search as order number'
      });
    }

    // Batch search detection
    if (query.includes(',') || query.includes(';') || /\d+\s+\d+/.test(query)) {
      newSuggestions.push({
        text: query,
        type: 'batch',
        icon: '📋',
        description: 'Batch search multiple orders'
      });
    }

    // Filter suggestions for longer queries
    if (query.length >= 3) {
      const filterSuggestions = [
        { text: `${query} (paid orders)`, type: 'filter' as const, icon: '💰', description: 'Filter by payment status' },
        { text: `${query} (shipped orders)`, type: 'filter' as const, icon: '🚚', description: 'Filter by shipping status' },
        { text: `${query} (recent orders)`, type: 'filter' as const, icon: '📅', description: 'Recent orders only' },
      ];
      
      newSuggestions.push(...filterSuggestions.slice(0, 2));
    }

    setSuggestions(newSuggestions.slice(0, 8));
  }, [query, searchHistory]);

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery || searchQuery.length < 3) {
      setResults([]);
      setSearchStats(null);
      setUnifiedResults([]);
      if (onResults) onResults([]);
      return;
    }

    setIsSearching(true);
    if (onSearching) onSearching(true);
    setError(null);
    const startTime = Date.now();

    try {
      // Perform parallel searches
      const [orderRes, customerRes] = await Promise.all([
        fetch(`/api/orders/search?query=${encodeURIComponent(searchQuery)}`).then(res => res.json()),
        fetch(`/api/customers/search?query=${encodeURIComponent(searchQuery)}`).then(res => res.json())
      ]);

      const orderResults: UnifiedSearchResult[] = (orderRes.orders || []).map((o: any) => ({ type: 'order', data: o }));
      const customerResults: UnifiedSearchResult[] = (customerRes.customers || []).map((c: any) => ({ type: 'customer', data: c }));

      // Combine and set unified results
      const combinedResults = [...orderResults, ...customerResults];
      setUnifiedResults(combinedResults);

      // For backward compatibility with onResults prop
      const searchResults: OrderSearchResult[] = orderRes.orders || [];
      setResults(searchResults);
      const processingTime = Date.now() - startTime;

      // Determine search type based on query analysis
      let searchType: 'simple' | 'advanced' | 'batch' | 'fuzzy' = 'simple';
      let confidence = 0.8;

      // Enhanced query analysis
      const orderNumbers = searchQuery.match(/\d{4,}/g) || [];
      const hasEmail = /@/.test(searchQuery);
      const hasMultipleTerms = searchQuery.split(/\s+/).length > 1;
      const isBatch = orderNumbers.length > 1 || searchQuery.includes(',');

      if (isBatch) {
        searchType = 'batch';
        confidence = 0.9;
      } else if (hasEmail || hasMultipleTerms) {
        searchType = 'advanced';
        confidence = 0.8;
      } else if (orderNumbers.length === 0 && searchQuery.length >= 4) {
        searchType = 'fuzzy';
        confidence = 0.6;
      }

      setSearchStats({
        searchType,
        confidence,
        searchMethod: orderRes.searchMethod || 'unknown',
        processingTime
      });

      // Add to search history if results found
      if (searchResults.length > 0) {
        addToSearchHistory(searchQuery);
        setSearchHistory(getSearchHistory());
      }

      if (onResults) {
        onResults(searchResults);
      }
    } catch (error: any) {
      console.error('Search error:', error);
      setError(error.message || 'Search failed');
      setResults([]);
      setSearchStats(null);
      setUnifiedResults([]);
      if (onResults) onResults([]);
    } finally {
      setIsSearching(false);
      if (onSearching) onSearching(false);
    }
  }, [onResults, onSearching]);

  // Perform search with debounced query
  useEffect(() => {
    if (debouncedQuery.length >= 3) {
      performSearch(debouncedQuery);
    } else {
      setResults([]);
      setSearchStats(null);
      setUnifiedResults([]);
      if (onResults) onResults([]);
    }
  }, [debouncedQuery, performSearch, onResults]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setShowSuggestions(value.length >= 2);
    setSelectedSuggestion(-1);

    // Detect batch mode
    const isBatchQuery = value.includes(',') || value.includes(';') || /\d+\s+\d+/.test(value);
    setShowBatchMode(isBatchQuery);
  };

  const handleSuggestionClick = (suggestion: SearchSuggestion) => {
    setQuery(suggestion.text);
    setShowSuggestions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedSuggestion(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedSuggestion(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedSuggestion >= 0) {
          handleSuggestionClick(suggestions[selectedSuggestion]);
        } else {
          setShowSuggestions(false);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedSuggestion(-1);
        break;
    }
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setUnifiedResults([]);
    setSearchStats(null);
    setError(null);
    setShowSuggestions(false);
    if (onResults) onResults([]);
  };

  const clearHistory = () => {
    localStorage.removeItem(STORAGE_KEY);
    setSearchHistory([]);
  };

  // Get search type display info
  const getSearchTypeInfo = () => {
    if (!searchStats) return null;
    
    const typeColors = {
      simple: 'bg-blue-100 text-blue-800',
      advanced: 'bg-purple-100 text-purple-800',
      batch: 'bg-orange-100 text-orange-800',
      fuzzy: 'bg-yellow-100 text-yellow-800'
    };

    const typeIcons = {
      simple: '🔍',
      advanced: '⚡',
      batch: '📋',
      fuzzy: '🔮'
    };

    return {
      color: typeColors[searchStats.searchType],
      icon: typeIcons[searchStats.searchType],
      label: searchStats.searchType.charAt(0).toUpperCase() + searchStats.searchType.slice(1)
    };
  };

  return (
    <div className="relative w-full max-w-2xl mx-auto">
      {/* Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(query.length >= 2)}
          placeholder={placeholder}
          className="block w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
        />

        {/* Loading/Clear Button */}
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
          {isSearching ? (
            <div className="animate-spin h-5 w-5 text-blue-500">
              <svg fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          ) : query ? (
            <button
              onClick={clearSearch}
              className="h-5 w-5 text-gray-400 hover:text-gray-600"
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>

      {/* Batch Mode Indicator */}
      {showBatchMode && (
        <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded-md">
          <div className="flex items-center">
            <span className="text-orange-600 mr-2">📋</span>
            <span className="text-sm text-orange-800">
              Batch search mode detected. Separate multiple order numbers with commas or spaces.
            </span>
          </div>
        </div>
      )}

      {/* Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div 
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto"
        >
          {suggestions.map((suggestion, index) => (
            <div
              key={index}
              onClick={() => handleSuggestionClick(suggestion)}
              className={`px-4 py-3 cursor-pointer border-b border-gray-100 last:border-b-0 ${
                index === selectedSuggestion 
                  ? 'bg-blue-50 border-blue-200' 
                  : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <span className="mr-3 text-lg">{suggestion.icon}</span>
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {suggestion.text}
                    </div>
                    {suggestion.description && (
                      <div className="text-xs text-gray-500">
                        {suggestion.description}
                      </div>
                    )}
                  </div>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  suggestion.type === 'history' ? 'bg-gray-100 text-gray-600' :
                  suggestion.type === 'batch' ? 'bg-orange-100 text-orange-600' :
                  suggestion.type === 'filter' ? 'bg-purple-100 text-purple-600' :
                  'bg-blue-100 text-blue-600'
                }`}>
                  {suggestion.type}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Search Stats */}
      {searchStats && results.length > 0 && (
        <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
          <div className="flex items-center space-x-4">
            <span>
              Found <strong>{results.length}</strong> order{results.length !== 1 ? 's' : ''}
            </span>
            {searchStats.processingTime && (
              <span>({searchStats.processingTime}ms)</span>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            {(() => {
              const typeInfo = getSearchTypeInfo();
              return typeInfo ? (
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${typeInfo.color}`}>
                  {typeInfo.icon} {typeInfo.label}
                </span>
              ) : null;
            })()}
            
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              searchStats.searchMethod.includes('shopify') 
                ? 'bg-green-100 text-green-600' 
                : 'bg-blue-100 text-blue-600'
            }`}>
              {searchStats.searchMethod.includes('shopify') ? '🛍️ Shopify' : '🚢 ShipStation'}
            </span>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-center">
            <span className="text-red-500 mr-2">⚠️</span>
            <span className="text-sm text-red-800">{error}</span>
          </div>
        </div>
      )}

      {/* Search History Management */}
      {searchHistory.length > 0 && !showSuggestions && !query && (
        <div className="mt-3 p-3 bg-gray-50 rounded-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Recent Searches</span>
            <button
              onClick={clearHistory}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Clear
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {searchHistory.slice(0, 5).map((historyItem, index) => (
              <button
                key={index}
                onClick={() => {
                  setQuery(historyItem);
                }}
                className="px-2 py-1 text-xs bg-white border border-gray-200 rounded-md hover:bg-gray-50 text-gray-700"
              >
                {historyItem}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Unified Results Display */}
      {unifiedResults.length > 0 && (
        <div className="mt-4 space-y-3">
          {unifiedResults.map((result, index) => {
            if (result.type === 'order') {
              const order = result.data as OrderSearchResult;
              return (
                <div key={order.shopifyOrderGID} className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className="text-xl text-gray-400"><i className="fas fa-receipt"></i></span>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          Order {order.shopifyOrderName}
                        </h3>
                        <div className="text-sm text-gray-600 mt-1">
                          {order.customerFullName && (
                            <span className="mr-4">👤 {order.customerFullName}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <a href={order.shopifyAdminUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-primary">View Order</a>
                    </div>
                  </div>
                </div>
              );
            }
            if (result.type === 'customer') {
              const customer = result.data;
              return (
                <div key={customer.id} className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
                  <div className="flex items-center space-x-3">
                    <span className="text-xl text-gray-400"><i className="fas fa-user-circle"></i></span>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        Customer: {customer.firstName} {customer.lastName}
                      </h3>
                      <div className="text-sm text-gray-600 mt-1">
                        {customer.email}
                      </div>
                    </div>
                  </div>
                </div>
              );
            }
            return null;
          })}
        </div>
      )}

      {/* No Results */}
      {query.length >= 3 && !isSearching && unifiedResults.length === 0 && !error && (
        <div className="mt-4 text-center py-8">
          <div className="text-gray-400 mb-2">
            <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No orders found</h3>
          <p className="text-sm text-gray-500">
            Try searching with a different order number, email, or customer name.
          </p>
          
          {/* Search Tips */}
          <div className="mt-4 text-left max-w-md mx-auto">
            <h4 className="text-sm font-medium text-gray-700 mb-2">💡 Search Tips:</h4>
            <ul className="text-xs text-gray-600 space-y-1">
              <li>• Use order numbers: <code className="bg-gray-100 px-1 rounded">1234</code> or <code className="bg-gray-100 px-1 rounded">#1234</code></li>
              <li>• Search by email: <code className="bg-gray-100 px-1 rounded">customer@example.com</code></li>
              <li>• Customer names: <code className="bg-gray-100 px-1 rounded">John Smith</code></li>
              <li>• Multiple orders: <code className="bg-gray-100 px-1 rounded">1234, 5678, 9012</code></li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
} 