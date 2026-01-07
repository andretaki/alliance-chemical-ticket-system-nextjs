'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useFormContext, useFieldArray } from 'react-hook-form';
import axios from 'axios';
import Image from 'next/image';
import { ImageIcon, Trash2, Plus } from 'lucide-react';
import { QuoteFormData, createNewLineItem } from '../types';

interface ProductVariantData {
    numericVariantIdShopify: string;
    variantTitle: string;
    sku: string;
    price: number;
    currency: string;
}

interface ParentProductData {
    name: string;
    primaryImageUrl?: string;
}

interface SearchResult {
    parentProduct: ParentProductData;
    variant: ProductVariantData;
}

interface SearchState {
    term: string;
    results: SearchResult[];
    isLoading: boolean;
}

const ProductsStep = () => {
    const { control, setValue, watch, formState: { errors } } = useFormContext<QuoteFormData>();
    const { fields, append, remove } = useFieldArray({
        control,
        name: "lineItems",
    });

    // Watch the line items to get updated values after selection
    const watchedLineItems = watch("lineItems");

    const [searchStates, setSearchStates] = useState<SearchState[]>([]);
    const [activeDropdown, setActiveDropdown] = useState<number | null>(null);
    const searchContainerRefs = useRef<(HTMLDivElement | null)[]>([]);
    const debounceTimers = useRef<Map<number, NodeJS.Timeout>>(new Map());

    // Sync search states with fields length (only add/remove, don't reset existing)
    useEffect(() => {
        setSearchStates(prev => {
            if (prev.length === fields.length) return prev;
            if (prev.length < fields.length) {
                return [...prev, ...Array(fields.length - prev.length).fill({ term: '', results: [], isLoading: false })];
            }
            return prev.slice(0, fields.length);
        });
        searchContainerRefs.current = searchContainerRefs.current.slice(0, fields.length);
    }, [fields.length]);

    // Cleanup timers on unmount
    useEffect(() => {
        return () => {
            debounceTimers.current.forEach(timer => clearTimeout(timer));
        };
    }, []);

    // Handle clicking outside to close dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const isOutside = searchContainerRefs.current.every(ref => !ref?.contains(event.target as Node));
            if (isOutside && activeDropdown !== null) {
                setActiveDropdown(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [activeDropdown]);

    const handleSearchChange = useCallback((index: number, term: string) => {
        // Cancel any pending search for this index
        const existingTimer = debounceTimers.current.get(index);
        if (existingTimer) clearTimeout(existingTimer);

        // Immediately update term and show loading
        setSearchStates(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], term, isLoading: term.trim().length >= 2 };
            return updated;
        });
        setActiveDropdown(index);

        if (term.trim().length < 2) {
            setSearchStates(prev => {
                const updated = [...prev];
                updated[index] = { ...updated[index], results: [], isLoading: false };
                return updated;
            });
            return;
        }

        // Debounced search with proper cleanup
        const timer = setTimeout(async () => {
            try {
                const response = await axios.get<{ success: boolean; data: { results: SearchResult[] } }>(
                    `/api/products/search-variant?query=${encodeURIComponent(term.trim())}`
                );
                setSearchStates(prev => {
                    const updated = [...prev];
                    // Only update if term still matches (prevents stale responses)
                    if (updated[index]?.term === term) {
                        updated[index] = { ...updated[index], results: response.data.data?.results || [], isLoading: false };
                    }
                    return updated;
                });
            } catch (error) {
                console.error("Product search failed:", error);
                setSearchStates(prev => {
                    const updated = [...prev];
                    if (updated[index]?.term === term) {
                        updated[index] = { ...updated[index], results: [], isLoading: false };
                    }
                    return updated;
                });
            }
            debounceTimers.current.delete(index);
        }, 300);

        debounceTimers.current.set(index, timer);
    }, []);

    const handleProductSelect = (index: number, product: SearchResult) => {
        // Store all product data for display and submission
        setValue(`lineItems.${index}.numericVariantIdShopify`, product.variant.numericVariantIdShopify, { shouldValidate: true });
        setValue(`lineItems.${index}.productDisplay`, `${product.parentProduct.name} - ${product.variant.variantTitle} (SKU: ${product.variant.sku})`);
        setValue(`lineItems.${index}.unitPrice`, product.variant.price);
        setValue(`lineItems.${index}.currencyCode`, product.variant.currency);
        setValue(`lineItems.${index}.productName`, product.parentProduct.name);
        setValue(`lineItems.${index}.variantTitle`, product.variant.variantTitle);
        setValue(`lineItems.${index}.sku`, product.variant.sku);
        setValue(`lineItems.${index}.imageUrl`, product.parentProduct.primaryImageUrl || '');

        // Clear search for this item
        setSearchStates(prev => {
            const updated = [...prev];
            updated[index] = { term: '', results: [], isLoading: false };
            return updated;
        });
        setActiveDropdown(null);
    };

    return (
        <div>
            <h5 className="mb-3">Product Selection</h5>
            <div className="table-responsive">
                <table className="table table-bordered" aria-label="Quote line items">
                    <thead className="table-light">
                        <tr>
                            <th scope="col" style={{ width: '45%' }}>Product Search</th>
                            <th scope="col" style={{ width: '35%' }}>Selected Product</th>
                            <th scope="col" style={{ width: '10%' }}>Qty</th>
                            <th scope="col" style={{ width: '5%' }}>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {fields.map((field, index) => (
                            <tr key={field.id}>
                                <td className="align-middle">
                                    <div className="position-relative" ref={el => { searchContainerRefs.current[index] = el; }}>
                                        <input
                                            type="text"
                                            className="form-control form-control-sm"
                                            placeholder="Search by name, SKU..."
                                            value={searchStates[index]?.term || ''}
                                            onChange={(e) => handleSearchChange(index, e.target.value)}
                                            onFocus={() => setActiveDropdown(index)}
                                        />
                                        {/* Loading indicator */}
                                        {searchStates[index]?.isLoading && (
                                            <div className="position-absolute top-50 end-0 translate-middle-y me-2">
                                                <div className="spinner-border spinner-border-sm text-primary" role="status">
                                                    <span className="visually-hidden">Searching...</span>
                                                </div>
                                            </div>
                                        )}

                                        {/* Dropdown */}
                                        {activeDropdown === index && searchStates[index]?.term.trim().length >= 2 && (
                                            <div className="dropdown-menu d-block position-absolute start-0 w-100 mt-1 shadow-lg border-0" style={{ zIndex: 1050, minWidth: '400px' }}>
                                                {/* Loading skeleton */}
                                                {searchStates[index]?.isLoading && (
                                                    <div className="p-2">
                                                        {[1, 2, 3].map(i => (
                                                            <div key={i} className="d-flex align-items-center p-2 mb-1">
                                                                <div className="bg-secondary bg-opacity-25 rounded me-3 placeholder-glow" style={{ width: '48px', height: '48px' }} />
                                                                <div className="flex-grow-1">
                                                                    <div className="placeholder-glow mb-1"><span className="placeholder col-8 bg-secondary"></span></div>
                                                                    <div className="placeholder-glow"><span className="placeholder col-5 bg-secondary"></span></div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* No results */}
                                                {!searchStates[index]?.isLoading && searchStates[index]?.results.length === 0 && (
                                                    <div className="p-4 text-center text-muted">
                                                        <ImageIcon className="mb-2 opacity-50" style={{ width: '32px', height: '32px' }} />
                                                        <div className="small">No products found for &ldquo;{searchStates[index]?.term}&rdquo;</div>
                                                    </div>
                                                )}

                                                {/* Results */}
                                                {!searchStates[index]?.isLoading && searchStates[index]?.results.length > 0 && (
                                                    <div className="list-group list-group-flush" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                                        {searchStates[index].results.map((result) => (
                                                            <button
                                                                type="button"
                                                                key={result.variant.numericVariantIdShopify}
                                                                className="list-group-item list-group-item-action py-2 px-3 text-start border-0"
                                                                onClick={() => handleProductSelect(index, result)}
                                                            >
                                                                <div className="d-flex align-items-center">
                                                                    {result.parentProduct.primaryImageUrl ? (
                                                                        <Image
                                                                            src={result.parentProduct.primaryImageUrl}
                                                                            alt={result.parentProduct.name}
                                                                            width={48}
                                                                            height={48}
                                                                            className="object-fit-contain rounded border bg-white me-3"
                                                                        />
                                                                    ) : (
                                                                        <div className="bg-light d-flex align-items-center justify-content-center rounded border me-3" style={{ width: '48px', height: '48px' }}>
                                                                            <ImageIcon style={{ width: '20px', height: '20px' }} className="text-muted opacity-50" />
                                                                        </div>
                                                                    )}
                                                                    <div className="flex-grow-1 min-width-0">
                                                                        <div className="fw-semibold text-truncate" style={{ fontSize: '0.9rem' }}>
                                                                            {result.parentProduct.name}
                                                                        </div>
                                                                        <div className="d-flex align-items-center gap-2 text-muted" style={{ fontSize: '0.8rem' }}>
                                                                            <span>{result.variant.variantTitle}</span>
                                                                            <span className="text-muted">•</span>
                                                                            <span className="font-monospace">SKU: {result.variant.sku || 'N/A'}</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-end ms-3">
                                                                        <div className="fw-bold text-success" style={{ fontSize: '0.95rem' }}>
                                                                            ${result.variant.price.toFixed(2)}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="align-middle">
                                    {watchedLineItems?.[index]?.numericVariantIdShopify ? (
                                        <div className="d-flex align-items-center p-2 bg-light rounded border">
                                            {watchedLineItems[index].imageUrl ? (
                                                <Image
                                                    src={watchedLineItems[index].imageUrl!}
                                                    alt={watchedLineItems[index].productName || 'Product'}
                                                    width={48}
                                                    height={48}
                                                    className="object-fit-contain rounded border bg-white me-3 flex-shrink-0"
                                                />
                                            ) : (
                                                <div className="bg-white d-flex align-items-center justify-content-center rounded border me-3 flex-shrink-0" style={{ width: '48px', height: '48px' }}>
                                                    <ImageIcon style={{ width: '20px', height: '20px' }} className="text-muted opacity-50" />
                                                </div>
                                            )}
                                            <div className="flex-grow-1 min-width-0">
                                                <div className="fw-semibold text-truncate" style={{ fontSize: '0.85rem' }}>
                                                    {watchedLineItems[index].productName}
                                                </div>
                                                <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                                                    {watchedLineItems[index].variantTitle}
                                                </div>
                                                <div className="d-flex align-items-center gap-2 mt-1">
                                                    <span className="badge bg-secondary bg-opacity-10 text-secondary" style={{ fontSize: '0.7rem' }}>
                                                        SKU: {watchedLineItems[index].sku || 'N/A'}
                                                    </span>
                                                    <span className="fw-bold text-success" style={{ fontSize: '0.85rem' }}>
                                                        ${watchedLineItems[index].unitPrice?.toFixed(2)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-muted small fst-italic p-2 border rounded border-dashed text-center" style={{ borderStyle: 'dashed' }}>
                                            Search and select a product
                                        </div>
                                    )}
                                    {errors.lineItems?.[index]?.numericVariantIdShopify && (
                                        <div className="text-danger small mt-1">{errors.lineItems[index]?.numericVariantIdShopify?.message}</div>
                                    )}
                                </td>
                                <td className="align-middle">
                                    <input
                                        type="number"
                                        {...control.register(`lineItems.${index}.quantity`, { valueAsNumber: true })}
                                        className={`form-control form-control-sm ${errors.lineItems?.[index]?.quantity ? 'is-invalid' : ''}`}
                                        min="1"
                                    />
                                    {errors.lineItems?.[index]?.quantity && <div className="invalid-feedback">{errors.lineItems[index]?.quantity?.message}</div>}
                                </td>
                                <td className="align-middle text-center">
                                    {fields.length > 1 && (
                                        <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => remove(index)}><Trash2 className="w-4 h-4" /></button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <button type="button" className="btn btn-outline-primary" onClick={() => append(createNewLineItem())}>
                <Plus className="w-4 h-4 me-2" />Add Another Product
            </button>
             {errors.lineItems?.root && (
                <div className="text-danger small mt-2">{errors.lineItems.root.message}</div>
            )}
        </div>
    );
};

export default ProductsStep;
