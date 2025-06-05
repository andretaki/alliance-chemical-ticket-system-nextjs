'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDebounce } from 'use-debounce';
import axios from 'axios';
import Link from 'next/link';
import { OrderSearchResult } from '@/types/orderSearch';

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
  placeholder = "Search orders by number, email, or customer name...",
  autoFocus = false 
}: SimpleOrderSearchProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebounce(query, 500);
  const [results, setResults] = useState<OrderSearchResult[]>([]);
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
      if (onResults) onResults([]);
      return;
    }

    setIsSearching(true);
    setError(null);
    const startTime = Date.now();

    try {
      const response = await fetch(`/api/orders/search?query=${encodeURIComponent(searchQuery)}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Search failed');
      }

      const data = await response.json();
      const searchResults: OrderSearchResult[] = data.orders || [];
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
        searchMethod: data.searchMethod || 'unknown',
        processingTime
      });

      setResults(searchResults);
      
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
      if (onResults) onResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [onResults]);

  // Perform search with debounced query
  useEffect(() => {
    if (debouncedQuery.length >= 3) {
      performSearch(debouncedQuery);
    } else {
      setResults([]);
      setSearchStats(null);
      if (onResults) onResults([]);
    }
  }, [debouncedQuery, onResults, performSearch]);

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
    performSearch(suggestion.text);
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
          performSearch(query);
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
                  performSearch(historyItem);
                }}
                className="px-2 py-1 text-xs bg-white border border-gray-200 rounded-md hover:bg-gray-50 text-gray-700"
              >
                {historyItem}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results Display */}
      {results.length > 0 && (
        <div className="mt-4 space-y-3">
          {results.map((order, index) => (
            <div key={index} className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {order.shopifyOrderName}
                      </h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        order.source === 'shopify' 
                          ? 'bg-green-100 text-green-600' 
                          : 'bg-blue-100 text-blue-600'
                      }`}>
                        {order.source === 'shopify' ? '🛍️ Shopify' : '🚢 ShipStation'}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {order.customerFullName && (
                        <span className="mr-4">👤 {order.customerFullName}</span>
                      )}
                      {order.customerEmail && (
                        <span>📧 {order.customerEmail}</span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  {order.totalPrice && (
                    <div className="text-lg font-semibold text-gray-900">
                      {order.currencyCode || '$'}{order.totalPrice}
                    </div>
                  )}
                  <div className="text-sm text-gray-500">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {/* Order Status */}
              <div className="mt-3 flex items-center space-x-4 text-sm">
                {order.financialStatus && (
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    order.financialStatus.toLowerCase().includes('paid') 
                      ? 'bg-green-100 text-green-600'
                      : 'bg-yellow-100 text-yellow-600'
                  }`}>
                    💳 {order.financialStatus}
                  </span>
                )}
                {order.fulfillmentStatus && (
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    order.fulfillmentStatus.toLowerCase().includes('shipped') 
                      ? 'bg-green-100 text-green-600'
                      : 'bg-orange-100 text-orange-600'
                  }`}>
                    📦 {order.fulfillmentStatus}
                  </span>
                )}
              </div>

              {/* Tracking Information */}
              {order.trackingNumbers && order.trackingNumbers.length > 0 && (
                <div className="mt-3 p-2 bg-blue-50 rounded-md">
                  <div className="text-sm font-medium text-blue-800 mb-1">
                    📍 Tracking Numbers:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {order.trackingNumbers.map((tracking, idx) => (
                      <span 
                        key={idx}
                        className="px-2 py-1 bg-white border border-blue-200 rounded text-xs font-mono"
                      >
                        {tracking}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="mt-4 flex space-x-2">
                {order.shopifyAdminUrl && order.shopifyAdminUrl !== '#' && (
                  <a
                    href={order.shopifyAdminUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1 text-xs bg-green-600 text-white rounded-md hover:bg-green-700"
                  >
                    View in Shopify
                  </a>
                )}
                {order.shipStationUrl && (
                  <a
                    href={order.shipStationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    View in ShipStation
                  </a>
                )}
                {order.relatedTicketUrl && (
                  <a
                    href={order.relatedTicketUrl}
                    className="px-3 py-1 text-xs bg-purple-600 text-white rounded-md hover:bg-purple-700"
                  >
                    View Ticket
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No Results */}
      {query.length >= 3 && !isSearching && results.length === 0 && !error && (
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