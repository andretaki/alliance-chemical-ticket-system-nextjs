'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDebounce } from 'use-debounce';
import axios from 'axios';
import Link from 'next/link';
import { OrderSearchResult } from '@/types/orderSearch';
import { Receipt, CheckCircle, Clock, PauseCircle, HelpCircle, Ticket, ShoppingBag, Ship, FileText, Search, XCircle } from 'lucide-react';

// This is the new "Customer 360" Card component
const SearchResultCard: React.FC<{ result: OrderSearchResult }> = ({ result }) => {
    const getStatusInfo = () => {
        const fulfillment = result.fulfillmentStatus?.replace(/_/g, ' ') || 'Unknown';
        const shipstation = result.shipStationStatus?.replace(/_/g, ' ') || 'Awaiting Shipment';

        let colorClasses = 'bg-gray-200 text-gray-800'; // Default
        let icon: React.ReactNode = <HelpCircle className="w-4 h-4" />;

        const lowerFulfillment = fulfillment.toLowerCase();
        const lowerShipstation = shipstation.toLowerCase();

        if (lowerFulfillment.includes('fulfilled') || lowerShipstation.includes('shipped')) {
            colorClasses = 'bg-green-100 text-green-800'; icon = <CheckCircle className="w-4 h-4" />;
        } else if (lowerFulfillment.includes('unfulfilled') || lowerShipstation.includes('awaiting')) {
            colorClasses = 'bg-yellow-100 text-yellow-800'; icon = <Clock className="w-4 h-4" />;
        } else if (lowerShipstation.includes('on hold')) {
            colorClasses = 'bg-red-100 text-red-800'; icon = <PauseCircle className="w-4 h-4" />;
        }

        const statusText = lowerFulfillment.includes('fulfilled') ? fulfillment : shipstation;

        return { text: statusText, colorClasses, icon };
    };

    const statusInfo = getStatusInfo();

    return (
        <div className="bg-white border border-gray-200 dark:bg-gray-800/50 dark:border-gray-700 rounded-2xl mb-4 shadow-lg transition-all duration-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:shadow-2xl hover:-translate-y-1">
            <header className="px-6 py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-3">
                    <Receipt className="w-5 h-5 text-primary" />
                    <span>Order {result.shopifyOrderName}</span>
                </h3>
                <div className={`px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-2 ${statusInfo.colorClasses}`}>
                    {statusInfo.icon}
                    <span>{statusInfo.text}</span>
                </div>
            </header>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Customer Info */}
                <div>
                    <h4 className="text-xs text-indigo-600 dark:text-indigo-300 uppercase font-bold tracking-wider mb-2">Customer</h4>
                    <p className="text-gray-900 dark:text-white font-semibold text-lg">{result.customerFullName || 'N/A'}</p>
                    {result.customerEmail && <a href={`mailto:${result.customerEmail}`} className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors">{result.customerEmail}</a>}
                    <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Ordered on: {new Date(result.createdAt).toLocaleDateString()}</p>
                </div>

                {/* Order Details */}
                <div>
                    <h4 className="text-xs text-indigo-600 dark:text-indigo-300 uppercase font-bold tracking-wider mb-2">Details</h4>
                    <p className="text-gray-900 dark:text-white"><strong className="font-medium">Total:</strong> ${result.totalPrice || 'N/A'} {result.currencyCode}</p>
                    <p className="text-gray-900 dark:text-white"><strong className="font-medium">Items:</strong> <span className="text-gray-600 dark:text-gray-300 text-sm">{result.itemSummary || 'N/A'}</span></p>
                    {result.trackingNumbers && result.trackingNumbers.length > 0 &&
                        <p className="text-gray-900 dark:text-white mt-1"><strong className="font-medium">Tracking:</strong> <span className="px-2 py-1 bg-indigo-100 text-indigo-700 dark:bg-indigo-500/50 dark:text-white rounded-md font-mono text-xs">{result.trackingNumbers.join(', ')}</span></p>
                    }
                </div>
            </div>

            <footer className="px-6 py-3 bg-gray-50 dark:bg-gray-900/50 rounded-b-2xl flex justify-end items-center gap-2 flex-wrap">
                {result.relatedTicketUrl && (
                    <Link href={result.relatedTicketUrl} className="px-3 py-1 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:hover:bg-blue-500/40 dark:hover:text-white transition-all text-sm flex items-center gap-2" title="View Related Ticket">
                        <Ticket className="w-4 h-4" /> Ticket #{result.relatedTicketId}
                    </Link>
                )}
                {result.shopifyAdminUrl && (
                    <a href={result.shopifyAdminUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-1 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-500/20 dark:text-green-300 dark:hover:bg-green-500/40 dark:hover:text-white transition-all text-sm flex items-center gap-2" title="View in Shopify">
                        <ShoppingBag className="w-4 h-4" /> Shopify
                    </a>
                )}
                {result.shipStationUrl && (
                    <a href={result.shipStationUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-1 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-500/20 dark:text-gray-300 dark:hover:bg-gray-500/40 dark:hover:text-white transition-all text-sm flex items-center gap-2" title="View in ShipStation">
                        <Ship className="w-4 h-4" /> ShipStation
                    </a>
                )}
                <Link href={`/admin/quotes/create`} className="px-4 py-1 rounded-lg bg-gradient-to-r from-primary to-primary-hover text-white font-bold hover:scale-105 transition-transform text-sm flex items-center gap-2" title="Create a new quote for this customer">
                    <FileText className="w-4 h-4" /> New Quote
                </Link>
            </footer>
        </div>
    );
};

export default function SimpleOrderSearch({ placeholder = "Search Orders, Customers, Emails...", autoFocus = false }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OrderSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debouncedQuery] = useDebounce(query, 300);

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery || searchQuery.trim().length < 2) { // Allow 2 chars for SKU searches
      setResults([]);
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const response = await axios.get<{ results: OrderSearchResult[] }>(`/api/orders/search?query=${encodeURIComponent(searchQuery)}`);
      setResults(response.data.results || []);
    } catch (err: any) {
      console.error('Search error:', err);
      setError(err.response?.data?.error || err.message || 'Search failed');
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    performSearch(debouncedQuery);
  }, [debouncedQuery, performSearch]);

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setError(null);
  };

  return (
    <div className="w-100 mx-auto">
      <div className="relative mb-4">
          <Search className="w-5 h-5 absolute top-1/2 left-4 -translate-y-1/2 text-gray-400" />
          <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className="w-full bg-white border border-gray-200 dark:bg-gray-800 dark:border-gray-700 rounded-xl py-3 pl-12 pr-12 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary focus:border-primary transition-all"
              autoFocus={autoFocus}
          />
          <div className="absolute top-1/2 right-4 -translate-y-1/2 flex items-center gap-3">
              {isSearching && (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600 dark:border-white"></div>
              )}
              {query && !isSearching && (
                  <button onClick={clearSearch} className="text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors">
                      <XCircle className="w-5 h-5" />
                  </button>
              )}
          </div>
      </div>

      <div className="mt-4">
          {error && <div className="bg-red-100 text-red-700 border border-red-300 dark:bg-red-500/30 dark:text-red-100 dark:border-red-500/50 rounded-lg p-4 text-center">{error}</div>}

          {isSearching && results.length === 0 && (
            <div className="text-center text-gray-500 dark:text-gray-400 p-6 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 dark:border-white mx-auto mb-3"></div>
                <span>Searching for &quot;{debouncedQuery}&quot;...</span>
            </div>
          )}

          {!isSearching && debouncedQuery.length >= 2 && results.length === 0 && (
              <div className="text-center text-gray-500 dark:text-gray-400 p-6 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                  <Search className="w-8 h-8 mx-auto mb-3" />
                  <p className="font-semibold">No results found for &quot;{debouncedQuery}&quot;</p>
                  <p className="text-sm">Try an order number, customer name, or email.</p>
              </div>
          )}
          {results.map(result => <SearchResultCard key={result.shopifyOrderGID} result={result} />)}
      </div>
    </div>
  );
}