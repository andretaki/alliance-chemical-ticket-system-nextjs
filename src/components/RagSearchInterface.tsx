import React, { useState, ChangeEvent, KeyboardEvent, useEffect, useCallback } from 'react';
import { RagFilters } from '@/services/ragQueryService';

interface RagSearchInterfaceProps {
    customerEmail?: string | null;
    orderNumber?: string | null;
    onResultSelect?: (result: any) => void;
    className?: string;
    enableInitialSearch?: boolean;
}

export const RagSearchInterface: React.FC<RagSearchInterfaceProps> = ({
    customerEmail,
    orderNumber,
    onResultSelect,
    className,
    enableInitialSearch = false
}) => {
    const [query, setQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [selectedSourceTypes, setSelectedSourceTypes] = useState<string[]>([]);

    const sourceTypeOptions = [
        { value: 'shipstation_order', label: 'ShipStation Orders' },
        { value: 'shopify_product_description', label: 'Product Descriptions' },
        { value: 'faq', label: 'FAQs' },
        { value: 'sds', label: 'SDS Documents' },
        { value: 'coa', label: 'COA Documents' }
    ];

    const performSearch = useCallback(async (searchQuery: string) => {
        if (!searchQuery.trim()) return;

        setIsLoading(true);
        setError(null);

        try {
            const currentFilters: RagFilters = {};
            
            if (selectedSourceTypes.length > 0) {
                currentFilters.sourceTypeIn = selectedSourceTypes as RagFilters['sourceTypeIn'];
            }

            // Include order number in identifiers filter if it exists
            if (orderNumber) {
                currentFilters.identifiers = {
                    orderNumber: orderNumber,
                };
            }

            const response = await fetch('/api/rag/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: searchQuery,
                    filters: currentFilters,
                    customerContext: customerEmail ? { email: customerEmail } : undefined
                }),
            });

            if (!response.ok) {
                throw new Error('Search failed');
            }

            const data = await response.json();
            setResults(data.results || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
            setResults([]);
        } finally {
            setIsLoading(false);
        }
    }, [customerEmail, orderNumber, selectedSourceTypes]);

    // Perform initial search when component mounts or when orderNumber/customerEmail changes
    useEffect(() => {
        if (enableInitialSearch && (orderNumber || customerEmail)) {
            const initialQuery = orderNumber ? `Order ${orderNumber}` : (customerEmail ? `Info for ${customerEmail}`: '');
            setQuery(initialQuery);
            performSearch(initialQuery);
        }
    }, [orderNumber, customerEmail, enableInitialSearch, performSearch]);

    const handleSearch = () => {
        performSearch(query);
    };

    const handleSourceTypeChange = (e: ChangeEvent<HTMLSelectElement>) => {
        const values = Array.from(e.target.selectedOptions, option => option.value);
        setSelectedSourceTypes(values);
        // Re-run search with new filters
        if (query) {
            performSearch(query);
        }
    };

    const handleKeyPress = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };

    return (
        <div className={className}>
            <div className="card shadow-sm mb-4">
                <div className="card-body">
                    <div className="d-flex flex-column gap-3">
                        <div className="d-flex gap-2">
                            <input
                                type="text"
                                className="form-control"
                                placeholder="Search related orders, products, or FAQs..."
                                value={query}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
                                onKeyPress={handleKeyPress}
                            />
                            <button
                                className="btn btn-primary"
                                onClick={handleSearch}
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <>
                                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                        Searching...
                                    </>
                                ) : 'Search'}
                            </button>
                        </div>

                        <select
                            className="form-select"
                            multiple
                            value={selectedSourceTypes}
                            onChange={handleSourceTypeChange}
                        >
                            <option value="" disabled>Filter by source type (optional)</option>
                            {sourceTypeOptions.map(option => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>

                        {error && (
                            <div className="alert alert-danger py-2">
                                {error}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {results.length > 0 && (
                <div className="d-flex flex-column gap-3">
                    {results.map((result, index) => (
                        <div key={index} 
                            className="card shadow-sm hover-shadow cursor-pointer"
                            onClick={() => onResultSelect?.(result)}
                            style={{ cursor: 'pointer' }}
                        >
                            <div className="card-body">
                                <p className="card-text small text-muted mb-2">
                                    {result.content}
                                </p>
                                <div className="d-flex flex-wrap gap-2">
                                    {result.metadata.orderId && (
                                        <span className="badge bg-primary">
                                            Order: {result.metadata.orderId}
                                        </span>
                                    )}
                                    {result.metadata.itemSkus?.map((sku: string) => (
                                        <span key={sku} className="badge bg-success">
                                            SKU: {sku}
                                        </span>
                                    ))}
                                    {result.metadata.trackingNumbers?.map((tracking: string) => (
                                        <span key={tracking} className="badge bg-info text-dark">
                                            Tracking: {tracking}
                                        </span>
                                    ))}
                                </div>
                                <small className="text-muted d-block mt-2">
                                    Similarity Score: {(result.similarityScore * 100).toFixed(1)}%
                                </small>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {!isLoading && results.length === 0 && query && (
                <div className="text-center text-muted mt-4">
                    No results found
                </div>
            )}
        </div>
    );
}; 