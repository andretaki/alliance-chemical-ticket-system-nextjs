'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useFormContext, useFieldArray } from 'react-hook-form';
import axios from 'axios';
import Image from 'next/image';
import { QuoteFormData, createNewLineItem } from '../types';
import { SEARCH_DEBOUNCE_MS, MIN_PRODUCT_SEARCH_LENGTH } from '@/config/constants';

// Interfaces from the old component, adapted for this step
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

const ProductsStep = () => {
    const { control, setValue, formState: { errors } } = useFormContext<QuoteFormData>();
    const { fields, append, remove } = useFieldArray({
        control,
        name: "lineItems",
    });

    // State to manage search functionality for each line item
    const [searchStates, setSearchStates] = useState<Array<{ term: string; results: SearchResult[]; isLoading: boolean }>>([]);
    const [activeDropdown, setActiveDropdown] = useState<number | null>(null);
    const searchContainerRefs = useRef<(HTMLDivElement | null)[]>([]);

    // Initialize search states when fields change
    useEffect(() => {
        setSearchStates(fields.map(() => ({ term: '', results: [], isLoading: false })));
        searchContainerRefs.current = searchContainerRefs.current.slice(0, fields.length);
    }, [fields]);
    
    // Handle clicking outside to close dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
          const isOutside = searchContainerRefs.current.every((ref) => !ref || !ref.contains(event.target as Node));
          if (isOutside && activeDropdown !== null) {
            setActiveDropdown(null);
          }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [activeDropdown]);


    const handleSearchChange = useCallback(async (index: number, term: string) => {
        // Update the search term in the local state
        const newSearchStates = [...searchStates];
        newSearchStates[index] = { ...newSearchStates[index], term, isLoading: true };
        setSearchStates(newSearchStates);
        setActiveDropdown(index);

        if (term.trim().length < MIN_PRODUCT_SEARCH_LENGTH) {
            newSearchStates[index] = { ...newSearchStates[index], results: [], isLoading: false };
            setSearchStates(newSearchStates);
            return;
        }

        // Debounced search
        setTimeout(async () => {
            try {
                const response = await axios.get<{ results: SearchResult[] }>(`/api/products/search-variant?query=${encodeURIComponent(term.trim())}`);
                const updatedStates = [...searchStates];
                updatedStates[index] = { ...updatedStates[index], results: response.data.results || [], isLoading: false };
                setSearchStates(updatedStates);
            } catch (error) {
                console.error("Product search failed:", error);
                const updatedStates = [...searchStates];
                updatedStates[index] = { ...updatedStates[index], results: [], isLoading: false };
                setSearchStates(updatedStates);
            }
        }, SEARCH_DEBOUNCE_MS);
    }, [searchStates]);

    const handleProductSelect = (index: number, product: SearchResult) => {
        setValue(`lineItems.${index}.numericVariantIdShopify`, product.variant.numericVariantIdShopify, { shouldValidate: true });
        setValue(`lineItems.${index}.productDisplay`, `${product.parentProduct.name} - ${product.variant.variantTitle} (SKU: ${product.variant.sku})`);
        setValue(`lineItems.${index}.unitPrice`, product.variant.price);
        setValue(`lineItems.${index}.currencyCode`, product.variant.currency);
        
        // Clear search for this item
        const newSearchStates = [...searchStates];
        newSearchStates[index] = { term: `${product.parentProduct.name} - ${product.variant.variantTitle}`, results: [], isLoading: false };
        setSearchStates(newSearchStates);
        setActiveDropdown(null);
    };

    return (
        <div>
            <h5 className="mb-3">
                Product Selection
                <i className="fas fa-info-circle ms-2 text-muted"
                   data-bs-toggle="tooltip"
                   title="Search for products by name or SKU code. You can add multiple products to your quote."
                   style={{ fontSize: '0.9rem', cursor: 'help' }}></i>
            </h5>
            <div className="alert alert-info alert-dismissible fade show" role="alert">
                <i className="fas fa-lightbulb me-2"></i>
                <strong>Tip:</strong> Type at least 2 characters of a product name or SKU to search.
                Click a product from the dropdown to add it, then set the quantity you need.
                <button type="button" className="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
            </div>
            <div className="table-responsive">
                <table className="table table-bordered">
                    <thead className="table-light">
                        <tr>
                            <th style={{ width: '45%' }}>
                                <i className="fas fa-search me-2"></i>Product Search
                                <small className="d-block text-muted fw-normal">Type to search by name or SKU</small>
                            </th>
                            <th style={{ width: '35%' }}>
                                <i className="fas fa-box me-2"></i>Selected Product
                                <small className="d-block text-muted fw-normal">Product details will appear here</small>
                            </th>
                            <th style={{ width: '10%' }}>
                                <i className="fas fa-hashtag me-2"></i>Quantity
                            </th>
                            <th style={{ width: '5%' }} className="text-center">
                                <i className="fas fa-cog"></i>
                            </th>
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
                                        {searchStates[index]?.isLoading && <div className="spinner-border spinner-border-sm position-absolute top-50 end-0 me-2" role="status"></div>}
                                        {activeDropdown === index && searchStates[index]?.results.length > 0 && (
                                            <div className="dropdown-menu d-block position-absolute start-0 w-100 mt-1 shadow-lg" style={{ zIndex: 1050 }}>
                                                <div className="list-group list-group-flush" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                                                    {searchStates[index].results.map((result) => (
                                                        <button
                                                            type="button"
                                                            key={result.variant.numericVariantIdShopify}
                                                            className="list-group-item list-group-item-action py-2 px-3 text-start"
                                                            onClick={() => handleProductSelect(index, result)}
                                                        >
                                                            <div className="d-flex align-items-center">
                                                                {result.parentProduct.primaryImageUrl ? (
                                                                    <Image src={result.parentProduct.primaryImageUrl} alt={result.parentProduct.name} width={30} height={30} className="object-fit-contain me-2 rounded border"/>
                                                                ) : (
                                                                    <div className="bg-light d-flex align-items-center justify-content-center rounded border me-2" style={{ width: '30px', height: '30px' }}>
                                                                        <i className="fas fa-image text-muted"></i>
                                                                    </div>
                                                                )}
                                                                <div>
                                                                    <div className="fw-medium small">{result.parentProduct.name}</div>
                                                                    <div className="small text-muted">{result.variant.variantTitle} (SKU: {result.variant.sku})</div>
                                                                </div>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="align-middle">
                                    <input 
                                        type="text" 
                                        className="form-control form-control-sm" 
                                        readOnly
                                        value={fields[index].productDisplay || 'Product details appear here'}
                                        tabIndex={-1}
                                    />
                                     {errors.lineItems?.[index]?.numericVariantIdShopify && <div className="text-danger small mt-1">{errors.lineItems[index]?.numericVariantIdShopify?.message}</div>}
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
                                        <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => remove(index)}><i className="fas fa-trash-alt"></i></button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <button type="button" className="btn btn-outline-primary btn-lg" onClick={() => append(createNewLineItem())}>
                <i className="fas fa-plus-circle me-2"></i>Add Another Product
            </button>
            <small className="d-block text-muted mt-2">
                <i className="fas fa-info-circle me-1"></i>
                Need multiple products? Click here to add more lines to your quote.
            </small>
             {errors.lineItems?.root && (
                <div className="text-danger small mt-2">{errors.lineItems.root.message}</div>
            )}
        </div>
    );
};

export default ProductsStep;
