'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDebounce } from 'use-debounce';
import axios from 'axios';
import Link from 'next/link';
import { OrderSearchResult } from '@/types/orderSearch';

// This is the new "Customer 360" Card component
const SearchResultCard: React.FC<{ result: OrderSearchResult }> = ({ result }) => {
    const getStatusInfo = () => {
        const fulfillment = result.fulfillmentStatus?.replace(/_/g, ' ') || 'Unknown';
        const shipstation = result.shipStationStatus?.replace(/_/g, ' ') || 'Unknown';
        
        let color = 'secondary';
        let icon = 'fa-question-circle';

        const lowerFulfillment = fulfillment.toLowerCase();
        const lowerShipstation = shipstation.toLowerCase();

        if (lowerFulfillment.includes('fulfilled') || lowerShipstation.includes('shipped')) {
            color = 'success'; icon = 'fa-check-circle';
        } else if (lowerFulfillment.includes('unfulfilled') || lowerShipstation.includes('awaiting')) {
            color = 'warning'; icon = 'fa-clock';
        } else if (lowerFulfillment.includes('on hold')) {
            color = 'danger'; icon = 'fa-pause-circle';
        }
        
        const statusText = lowerFulfillment.includes('fulfilled') ? fulfillment : (shipstation !== 'Unknown' ? shipstation : fulfillment);

        return { text: statusText, color: `bg-${color}`, icon };
    };

    const statusInfo = getStatusInfo();

    return (
        <div className="card mb-3 shadow-sm border-start border-4" style={{ borderColor: `var(--bs-${statusInfo.color.replace('bg-','')}) !important`}}>
            <div className="card-header d-flex justify-content-between align-items-center bg-light py-2">
                <h5 className="mb-0 h6">
                    <i className="fas fa-receipt me-2 text-primary"></i>
                    Order {result.shopifyOrderName}
                </h5>
                <span className={`badge ${statusInfo.color} text-uppercase small`}>
                    <i className={`fas ${statusInfo.icon} me-1`}></i>
                    {statusInfo.text}
                </span>
            </div>
            <div className="card-body p-3">
                <div className="row">
                    <div className="col-md-6 mb-3 mb-md-0">
                        <h6 className="text-muted small text-uppercase fw-bold">Customer</h6>
                        <p className="mb-1"><strong>{result.customerFullName || 'N/A'}</strong></p>
                        {result.customerEmail && <p className="mb-1"><a href={`mailto:${result.customerEmail}`}>{result.customerEmail}</a></p>}
                        <p className="mb-0 small text-muted">Ordered on: {new Date(result.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="col-md-6">
                        <h6 className="text-muted small text-uppercase fw-bold">Details</h6>
                        <p className="mb-1"><strong>Total:</strong> ${result.totalPrice || 'N/A'} {result.currencyCode}</p>
                        <p className="mb-1"><strong>Items:</strong> <span className="text-muted small">{result.itemSummary || 'N/A'}</span></p>
                        {result.trackingNumbers && result.trackingNumbers.length > 0 &&
                            <p className="mb-0"><strong>Tracking:</strong> <span className="badge bg-info text-dark font-monospace">{result.trackingNumbers.join(', ')}</span></p>
                        }
                    </div>
                </div>
            </div>
            <div className="card-footer bg-white d-flex justify-content-end gap-2 py-2">
                {result.relatedTicketUrl && (
                    <Link href={result.relatedTicketUrl} className="btn btn-sm btn-outline-info" title="View Related Ticket">
                        <i className="fas fa-ticket-alt me-1"></i> Ticket #{result.relatedTicketId}
                    </Link>
                )}
                {result.shopifyAdminUrl && (
                    <a href={result.shopifyAdminUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-success" title="View in Shopify">
                        <i className="fab fa-shopify me-1"></i> Shopify
                    </a>
                )}
                {result.shipStationUrl && (
                    <a href={result.shipStationUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-secondary" title="View in ShipStation">
                        <i className="fas fa-ship me-1"></i> ShipStation
                    </a>
                )}
                <Link href={`/admin/quotes/create`} className="btn btn-sm btn-primary" title="Create a new quote for this customer">
                    <i className="fas fa-file-invoice-dollar me-1"></i> New Quote
                </Link>
            </div>
        </div>
    );
};

export default function SimpleOrderSearch({ placeholder = "Search Orders, Customers, Emails...", autoFocus = false }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OrderSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debouncedQuery] = useDebounce(query, 500);

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
      <div className="position-relative mb-3">
          <i className="fas fa-search position-absolute top-50 start-0 translate-middle-y ms-3 text-muted"></i>
          <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className="form-control form-control-lg ps-5"
              autoFocus={autoFocus}
          />
          <div className="position-absolute top-50 end-0 translate-middle-y me-2">
              {isSearching && (
                  <div className="spinner-border spinner-border-sm text-primary" role="status">
                      <span className="visually-hidden">Loading...</span>
                  </div>
              )}
              {query && !isSearching && (
                  <button onClick={clearSearch} className="btn btn-sm btn-link text-muted p-0" style={{lineHeight: 1}}>
                      <i className="fas fa-times-circle"></i>
                  </button>
              )}
          </div>
      </div>
      
      <div className="mt-4">
          {error && <div className="alert alert-danger">{error}</div>}
          {!isSearching && debouncedQuery.length >= 2 && results.length === 0 && (
              <div className="text-center text-muted p-4 border rounded bg-light">
                  <p className="mb-0">No results found for &quot;{debouncedQuery}&quot;. Try an order number, customer name, or email.</p>
              </div>
          )}
          {results.map(result => <SearchResultCard key={result.shopifyOrderGID} result={result} />)}
      </div>
    </div>
  );
}