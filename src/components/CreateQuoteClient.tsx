// src/components/CreateQuoteClient.tsx
'use client';

import React, { useState, useEffect, ChangeEvent, FormEvent, useRef, useMemo, useCallback } from 'react';
import axios, { AxiosError } from 'axios';
import { useRouter } from 'next/navigation';
import type { AppDraftOrderInput, DraftOrderLineItemInput, DraftOrderCustomerInput, DraftOrderAddressInput, ProductVariantData, ParentProductData, DraftOrderOutput } from '@/agents/quoteAssistant/quoteInterfaces';
import DOMPurify from 'dompurify';
import Image from 'next/image'; // For Next.js optimized images
import { toast } from 'sonner';
import { ImageIcon, Trash2, Plus, FileText } from 'lucide-react';

// Updated SearchResult interface to match backend
interface SearchResult {
  parentProduct: ParentProductData;
  variant: ProductVariantData;
}

interface LineItemSearchData {
  id: string; // Unique ID for React keys
  searchTerm: string;
  searchResults: SearchResult[];
  isSearching: boolean;
  hasSelection: boolean;
  error?: string | null;
}

const createNewLineItemSearchData = (): LineItemSearchData => ({
  id: crypto.randomUUID(),
  searchTerm: '',
  searchResults: [],
  isSearching: false,
  hasSelection: false,
  error: null,
});

interface CreateQuoteClientProps {
  ticketId: number;
  initialCustomer: Partial<DraftOrderCustomerInput & { phone?: string; company?: string }>;
}

const CreateQuoteClient: React.FC<CreateQuoteClientProps> = ({ ticketId, initialCustomer }) => {
  const router = useRouter();

  const [lineItems, setLineItems] = useState<Array<DraftOrderLineItemInput & { productDisplay?: string; unitPrice?: number; currencyCode?: string }>>([{ numericVariantIdShopify: '', quantity: 1, productDisplay: '' }]);
  const [customer, setCustomer] = useState<DraftOrderCustomerInput>(initialCustomer);
  const [shippingAddress, setShippingAddress] = useState<DraftOrderAddressInput>({
    firstName: initialCustomer.firstName || '',
    lastName: initialCustomer.lastName || '',
    address1: '', city: '', country: 'United States', zip: '', province: '', 
    company: initialCustomer.company || '', 
    phone: initialCustomer.phone || '',
  });
  const [billingAddress, setBillingAddress] = useState<DraftOrderAddressInput>({
    firstName: initialCustomer.firstName || '',
    lastName: initialCustomer.lastName || '',
    address1: '', city: '', country: 'United States', zip: '', province: '', 
    company: initialCustomer.company || '', 
    phone: initialCustomer.phone || '',
  });
  const [useSameAddressForBilling, setUseSameAddressForBilling] = useState<boolean>(true);
  const [quoteType, setQuoteType] = useState<'material_only' | 'material_and_delivery'>('material_and_delivery');
  const [materialOnlyDisclaimer, setMaterialOnlyDisclaimer] = useState<string>('This quote includes materials only. Shipping, installation, and setup services are not included. Customer is responsible for arranging transportation and installation.');
  const [deliveryTerms, setDeliveryTerms] = useState<string>('Customer arranges pickup');
  const [note, setNote] = useState<string>('');
  const [sendShopifyInvoice, setSendShopifyInvoice] = useState<boolean>(true);

  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [createdDraftOrder, setCreatedDraftOrder] = useState<DraftOrderOutput | null>(null);
  
  const [lineItemSearchData, setLineItemSearchData] = useState<LineItemSearchData[]>([createNewLineItemSearchData()]);
  const [activeSearchDropdown, setActiveSearchDropdown] = useState<number | null>(null);
  const [focusedResultIndex, setFocusedResultIndex] = useState<number | null>(null);

  const searchTermsForEffect = useMemo(() => 
    lineItemSearchData.map(item => item.searchTerm).join('||'),
    [lineItemSearchData]
  );

  const searchContainerRefs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    searchContainerRefs.current = searchContainerRefs.current.slice(0, lineItems.length);
  }, [lineItems.length]);

  useEffect(() => {
    // console.log('[Search Effect Hook] searchTermsForEffect changed:', searchTermsForEffect);
    const timers: (NodeJS.Timeout | null)[] = lineItemSearchData.map((searchData, index) => {
      const { id: itemId, searchTerm, hasSelection } = searchData;
      // console.log(`[Search Effect Loop] Index: ${index}, Item ID: ${itemId}, Term: "${searchTerm}", HasSelection: ${hasSelection}, Search Term Length: ${searchTerm.trim().length}`);

      if (hasSelection || !searchTerm.trim() || searchTerm.length < 1) {
        // console.log(`[Search Effect Condition Met] Skipping API call for Item ID: ${itemId}. HasSelection: ${hasSelection}, Term: "${searchTerm}"`);
        if (searchData.isSearching || searchData.searchResults.length > 0 || searchData.error) {
           setLineItemSearchData(prev => prev.map(item => 
            item.id === itemId ? { ...item, isSearching: false, searchResults: [], error: null } : item
          ));
        }
        if(activeSearchDropdown === index && (!searchTerm.trim() || searchTerm.length < 1)){
            setActiveSearchDropdown(null); // Close dropdown if search term is cleared
        }
        return null;
      }

      // console.log(`[Search Effect] Preparing to search for Item ID: ${itemId}, Term: "${searchTerm}"`);
      // Only set isSearching to true if it's not already true to prevent infinite loops if lineItemSearchData is in deps
      if (!searchData.isSearching) {
        setLineItemSearchData(prev => prev.map(item => 
          item.id === itemId ? { ...item, isSearching: true, searchResults: [], error: null } : item
        ));
      }
      // Ensure dropdown is active when search starts
      if (activeSearchDropdown !== index) { // Only set if not already active
          setActiveSearchDropdown(index);
      }

      const timerId = setTimeout(async () => {
        // console.log(`[Search Effect Timeout] Fired for Item ID: ${itemId}, Term: "${searchTerm}"`);
        
        // Re-fetch the current state of the item to ensure we're not acting on stale data
        let currentItemForApiCall: LineItemSearchData | undefined;
        setLineItemSearchData(currentDynamicData => {
            currentItemForApiCall = currentDynamicData.find(item => item.id === itemId);
            return currentDynamicData;
        });
        
        // Abort if the search term has changed since the timer was set, or if a selection was made
        if (!currentItemForApiCall || currentItemForApiCall.searchTerm !== searchTerm || currentItemForApiCall.hasSelection) {
          // console.log(`[Search Effect Timeout] Aborting stale search for Item ID: ${itemId}. StaleTerm: "${searchTerm}", CurrentTerm: "${currentItemForApiCall?.searchTerm}", HasSelection: ${currentItemForApiCall?.hasSelection}`);
          // Ensure isSearching is false if we abort a search that was marked as searching
          setLineItemSearchData(prev => prev.map(item => 
            (item.id === itemId && item.isSearching && item.searchTerm === searchTerm) ? { ...item, isSearching: false } : item
          ));
          return;
        }
        
        // console.log(`[Search Effect API Call] Item ID: ${itemId}, Calling API for term: "${searchTerm}"`);
        try {
          const response = await axios.get<{ results: SearchResult[] }>(
            `/api/products/search-variant?query=${encodeURIComponent(searchTerm.trim())}`
          );
          // console.log(`[Search Effect API Success] Item ID: ${itemId}, Results for "${searchTerm}":`, response.data.results);
          
          setLineItemSearchData(prev =>
            prev.map(item =>
              item.id === itemId && item.searchTerm === searchTerm // Double check if still the relevant search
                ? { ...item, searchResults: response.data.results || [], isSearching: false, error: response.data.results?.length === 0 ? 'No products found in Shopify.' : null }
                : item
            )
          );
        } catch (e: any) {
          console.error(`[Search API Error] Item ID: ${itemId}, Term: "${searchTerm}"`, e);
          setLineItemSearchData(prev =>
            prev.map(item =>
              item.id === itemId && item.searchTerm === searchTerm // Double check
                ? { ...item, searchResults: [], isSearching: false, error: 'Shopify search failed. Check console for details.' }
                : item
            )
          );
        }
      }, 500); // Debounce delay
      return timerId;
    });

    return () => {
      timers.forEach(timerId => {
        if (timerId) clearTimeout(timerId);
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps 
  }, [searchTermsForEffect, activeSearchDropdown]); // ADDED activeSearchDropdown here. lineItemSearchData is indirectly part of searchTermsForEffect.
                                                  // Avoid adding lineItemSearchData directly if setLineItemSearchData is called within, to prevent loops.

  const handleLineItemChange = (index: number, field: keyof DraftOrderLineItemInput, value: string | number) => {
    const updatedLineItems = [...lineItems];
    if (field === 'quantity') {
        updatedLineItems[index] = { ...updatedLineItems[index], [field]: Math.max(1, Number(value)) };
    } else {
        updatedLineItems[index] = { ...updatedLineItems[index], [field]: String(value) };
    }
    setLineItems(updatedLineItems);
  };

  const handleSearchTermChange = (index: number, value: string) => {
    const currentItem = lineItemSearchData[index];
    setLineItemSearchData(prevData =>
      prevData.map((item, i) =>
        item.id === currentItem.id
          ? { ...item, searchTerm: value, hasSelection: false, error: null }
          : item
      )
    );

    if (lineItems[index].numericVariantIdShopify) {
      const updatedLineItems = [...lineItems];
      updatedLineItems[index] = {
        ...updatedLineItems[index],
        numericVariantIdShopify: '',
        productDisplay: '',
        title: '',
        unitPrice: undefined,
        currencyCode: undefined,
      };
      setLineItems(updatedLineItems);
    }
  };

  const addProductToLineItems = (searchResult: SearchResult, index: number) => {
    const { parentProduct, variant } = searchResult;
    const currentItemSearchId = lineItemSearchData[index]?.id;
    if (!currentItemSearchId) return;

    if (!variant.numericVariantIdShopify) {
      setLineItemSearchData(prev => prev.map(item => item.id === currentItemSearchId ? {...item, error: `Variant ${variant.sku} is missing ID.`} : item));
      return;
    }

    const updatedLineItems = [...lineItems];
    const displayValue = `${parentProduct.name} - ${variant.variantTitle} (SKU: ${variant.sku})`;
    updatedLineItems[index] = {
      ...updatedLineItems[index],
      numericVariantIdShopify: variant.numericVariantIdShopify,
      title: variant.displayName || variant.variantTitle,
      productDisplay: displayValue,
      unitPrice: variant.price, 
      currencyCode: variant.currency,
    };
    setLineItems(updatedLineItems);

    setLineItemSearchData(prevData =>
      prevData.map(item =>
        item.id === currentItemSearchId
          ? {
              ...item,
              searchTerm: displayValue,
              searchResults: [],
              isSearching: false,
              hasSelection: true,
              error: null,
            }
          : item
      )
    );
    setActiveSearchDropdown(null);
    setFocusedResultIndex(null);
  };
  
  const addLineItem = () => {
    setLineItems([...lineItems, { numericVariantIdShopify: '', quantity: 1, productDisplay: '' }]);
    setLineItemSearchData([...lineItemSearchData, createNewLineItemSearchData()]);
    searchContainerRefs.current.push(null);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
      setLineItemSearchData(lineItemSearchData.filter((_, i) => i !== index));
      searchContainerRefs.current.splice(index, 1);
      if (activeSearchDropdown === index) {
        setActiveSearchDropdown(null);
      }
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (activeSearchDropdown !== null) {
        const currentSearchContainerRef = searchContainerRefs.current[activeSearchDropdown];
        if (currentSearchContainerRef && !currentSearchContainerRef.contains(event.target as Node)) {
          setActiveSearchDropdown(null);
          setFocusedResultIndex(null);
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [activeSearchDropdown]);

  const handleInputFocus = (index: number) => {
    const currentSearchData = lineItemSearchData[index];
    if (currentSearchData?.searchTerm.length >= 1 && !currentSearchData?.hasSelection && (currentSearchData?.searchResults.length > 0 || currentSearchData?.error || currentSearchData?.isSearching)) {
        setActiveSearchDropdown(index);
    }
  };
  
  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    const currentSearchData = lineItemSearchData[index];
    if (!currentSearchData || !currentSearchData.searchResults?.length || activeSearchDropdown !== index) {
      if (e.key === 'Escape') setActiveSearchDropdown(null);
      return;
    }

    const resultsCount = currentSearchData.searchResults.length;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedResultIndex(prev => (prev === null || prev >= resultsCount - 1) ? 0 : prev + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedResultIndex(prev => (prev === null || prev <= 0) ? resultsCount - 1 : prev - 1);
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedResultIndex !== null && currentSearchData.searchResults[focusedResultIndex]) {
          addProductToLineItems(currentSearchData.searchResults[focusedResultIndex], index);
        } else if (resultsCount === 1) {
          addProductToLineItems(currentSearchData.searchResults[0], index);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setActiveSearchDropdown(null);
        setFocusedResultIndex(null);
        break;
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);
    setCreatedDraftOrder(null);
    setIsLoading(true);

    const draftOrderInput: AppDraftOrderInput = {
      lineItems: lineItems
        .filter(item => item.numericVariantIdShopify && item.quantity > 0)
        .map(({ productDisplay, unitPrice, currencyCode, ...rest }) => rest),
      customer,
      shippingAddress,
      billingAddress: useSameAddressForBilling ? shippingAddress : billingAddress,
      note: `Quote related to Ticket #${ticketId}. ${note || ''}`,
      email: sendShopifyInvoice ? customer.email : undefined,
      tags: ['TicketSystemQuote', `TicketID-${ticketId}`, 
             quoteType === 'material_only' ? 'MaterialOnly' : 
             quoteType === 'material_and_delivery' ? 'MaterialAndDelivery' : 'FullService'],
      quoteType,
      materialOnlyDisclaimer: quoteType === 'material_only' ? materialOnlyDisclaimer : undefined,
      deliveryTerms: quoteType === 'material_only' ? deliveryTerms : undefined,
    };

    if (draftOrderInput.lineItems.length === 0) {
      setFormError("Please add at least one valid line item with a Shopify Variant ID and quantity.");
      setIsLoading(false); return;
    }
    if (!draftOrderInput.shippingAddress?.address1 || !draftOrderInput.shippingAddress.city || !draftOrderInput.shippingAddress.country || !draftOrderInput.shippingAddress.zip) {
        setFormError("A complete shipping address (Address, City, Country, Zip) is required to calculate shipping.");
        setIsLoading(false); return;
    }
    if (!draftOrderInput.customer?.email && sendShopifyInvoice) { 
        setFormError("Customer email is required if you want to send an invoice.");
        setIsLoading(false); return; 
    }

    try {
      const response = await axios.post<DraftOrderOutput>('/api/draft-orders', draftOrderInput);
      setSuccessMessage(`Draft order ${response.data.name} created! Status: ${response.data.status}. Shipping: ${response.data.shippingLine?.price !== undefined ? `${response.data.shippingLine.price.toFixed(2)} ${response.data.currencyCode}` : 'To be calculated or free'}.`);
      setCreatedDraftOrder(response.data);
      toast.success(`Draft order ${response.data.name} created successfully!`);
    } catch (err) {
      const axiosError = err as AxiosError<{ error?: string }>;
      const errorMsg = axiosError.response?.data?.error || 'Failed to create draft order. Check server logs for details.';
      setFormError(errorMsg);
      toast.error(errorMsg);
      console.error("Draft order creation error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCustomerChange = (e: ChangeEvent<HTMLInputElement>) => setCustomer({ ...customer, [e.target.name]: e.target.value });
  const handleShippingAddressChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setShippingAddress({ ...shippingAddress, [e.target.name]: e.target.value });
  const handleBillingAddressChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setBillingAddress(prev => ({ ...prev, [name]: value }));
  };

  useEffect(() => {
    if (useSameAddressForBilling) {
      setBillingAddress({
        firstName: shippingAddress.firstName || '',
        lastName: shippingAddress.lastName || '',
        company: shippingAddress.company || '',
        address1: shippingAddress.address1 || '',
        address2: shippingAddress.address2 || '',
        city: shippingAddress.city || '',
        province: shippingAddress.province || '',
        zip: shippingAddress.zip || '',
        country: shippingAddress.country || 'United States',
        phone: shippingAddress.phone || '',
      });
    }
  }, [useSameAddressForBilling, shippingAddress]);

  return (
    <div className="card shadow-sm">
      <div className="card-header bg-primary text-white">
        <h3 className="mb-0">Create Quote for Ticket #{ticketId}</h3>
      </div>
      <div className="card-body">
        {formError && <div className="alert alert-danger" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(formError) }}></div>}
        {successMessage && <div className="alert alert-success">{successMessage}</div>}
        {createdDraftOrder && (
          <div className="alert alert-info">
            <p className="mb-1"><strong>Draft Order Name:</strong> {createdDraftOrder.name}</p>
            {createdDraftOrder.invoiceUrl && (
              <p className="mb-1"><strong>Invoice URL:</strong> <a href={createdDraftOrder.invoiceUrl} target="_blank" rel="noopener noreferrer" className="text-break">{createdDraftOrder.invoiceUrl}</a></p>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <fieldset className="mb-4 p-3 border rounded">
            <legend className="h5 fw-normal">Customer Information</legend>
             <div className="row g-3">
              <div className="col-md-6">
                <label htmlFor="customerFirstName" className="form-label">First Name</label>
                <input type="text" className="form-control" id="customerFirstName" name="firstName" value={customer.firstName || ''} onChange={handleCustomerChange} />
              </div>
              <div className="col-md-6">
                <label htmlFor="customerLastName" className="form-label">Last Name</label>
                <input type="text" className="form-control" id="customerLastName" name="lastName" value={customer.lastName || ''} onChange={handleCustomerChange} />
              </div>
              <div className="col-md-6">
                <label htmlFor="customerEmail" className="form-label">Email *</label>
                <input type="email" className="form-control" id="customerEmail" name="email" value={customer.email || ''} onChange={handleCustomerChange} required={sendShopifyInvoice} />
              </div>
              <div className="col-md-6">
                <label htmlFor="customerPhone" className="form-label">Phone</label>
                <input type="tel" className="form-control" id="customerPhone" name="phone" value={customer.phone || ''} onChange={handleCustomerChange} />
              </div>
              <div className="col-md-12">
                <label htmlFor="customerCompany" className="form-label">Company</label>
                <input type="text" className="form-control" id="customerCompany" name="company" value={customer.company || ''} onChange={handleCustomerChange} />
              </div>
            </div>
          </fieldset>

          <fieldset className="mb-4 p-3 border rounded">
            <legend className="h5 fw-normal">Line Items</legend>
            {lineItems.map((itemData, index) => {
              const currentSearchState = lineItemSearchData[index] || createNewLineItemSearchData();
              return (
                <div key={currentSearchState.id} className="row g-3 align-items-start mb-3 p-3 border-bottom position-relative">
                  <div className="col-md-5">
                    <label htmlFor={`productSearch-${index}`} className="form-label">Product Search *</label>
                    <div 
                      className="position-relative product-search-container" 
                      ref={el => { searchContainerRefs.current[index] = el; }}
                    >
                      <div className="input-group">
                        <input
                          type="text"
                          className="form-control"
                          id={`productSearch-${index}`}
                          placeholder="SKU, Name, Variant ID..."
                          value={currentSearchState.searchTerm}
                          onChange={(e) => handleSearchTermChange(index, e.target.value)}
                          onFocus={() => handleInputFocus(index)}
                          onKeyDown={(e) => handleKeyDown(index, e)}
                          required={!currentSearchState.hasSelection}
                          autoComplete="off"
                        />
                        <span className="input-group-text bg-primary text-white" title="Searching directly in Shopify">
                          <small>Shopify Direct</small>
                        </span>
                      </div>
                      {currentSearchState.isSearching && (
                        <div className="position-absolute top-50 end-0 translate-middle-y me-2" style={{ zIndex: 5 }}>
                          <div className="spinner-border spinner-border-sm text-primary" role="status">
                            <span className="visually-hidden">Searching...</span>
                          </div>
                        </div>
                      )}
                      {activeSearchDropdown === index && (
                        <div 
                          className="position-absolute w-100 mt-1 bg-white border rounded shadow-lg" 
                          style={{ zIndex: 1000, maxHeight: '300px', overflowY: 'auto' }}
                        >
                          {currentSearchState.error && (
                            <div className="p-2 text-danger small">{currentSearchState.error}</div>
                          )}
                          {!currentSearchState.error && currentSearchState.searchResults.length === 0 && currentSearchState.searchTerm.length >= 1 && !currentSearchState.isSearching && (
                            <div className="p-2 text-muted small">No products found.</div>
                          )}
                          {currentSearchState.searchResults.map((result, resultIdx) => (
                            <div
                              key={result.variant.id}
                              className={`p-2 border-bottom cursor-pointer d-flex align-items-center ${resultIdx === focusedResultIndex ? 'bg-primary text-white' : 'hover-bg-light'}`}
                              onClick={() => addProductToLineItems(result, index)}
                              onMouseEnter={() => setFocusedResultIndex(resultIdx)}
                              role="option"
                              aria-selected={resultIdx === focusedResultIndex}
                            >
                              {result.parentProduct.primaryImageUrl && (
                                <Image 
                                  src={result.parentProduct.primaryImageUrl} 
                                  alt={result.parentProduct.name} 
                                  width={40} height={40} 
                                  className="me-2 rounded object-fit-contain"
                                  onError={(e) => (e.currentTarget.style.display = 'none')}
                                />
                              )}
                              {!result.parentProduct.primaryImageUrl && (
                                <div className="me-2 rounded bg-light d-flex align-items-center justify-content-center" style={{width: '40px', height: '40px'}}>
                                  <ImageIcon className="w-4 h-4 text-muted" />
                                </div>
                              )}
                              <div>
                                <div className="fw-medium">{result.parentProduct.name}</div>
                                <div className={`small ${resultIdx === focusedResultIndex ? 'text-white-75' : 'text-muted'}`}>
                                  {result.variant.variantTitle} (SKU: {result.variant.sku})
                                </div>
                                <div className={`small fw-bold ${resultIdx === focusedResultIndex ? 'text-white' : 'text-success'}`}>
                                  ${result.variant.price.toFixed(2)} {result.variant.currency}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="col-md-4">
                    <label htmlFor={`itemTitle-${index}`} className="form-label">Selected Product</label>
                    <input 
                      type="text" 
                      className="form-control bg-light" 
                      id={`itemTitle-${index}`} 
                      value={itemData.productDisplay || ''} 
                      readOnly 
                      placeholder="Select a product"
                    />
                    {itemData.unitPrice !== undefined && itemData.currencyCode && (
                        <small className="text-muted d-block mt-1">
                            Price: {itemData.unitPrice.toFixed(2)} {itemData.currencyCode}
                        </small>
                    )}
                  </div>

                  <div className="col-md-2">
                    <label htmlFor={`itemQuantity-${index}`} className="form-label">Quantity *</label>
                    <input
                      type="number"
                      className="form-control"
                      id={`itemQuantity-${index}`}
                      value={itemData.quantity}
                      onChange={(e) => handleLineItemChange(index, 'quantity', parseInt(e.target.value, 10))}
                      min="1"
                      required
                      disabled={!currentSearchState.hasSelection}
                    />
                  </div>

                  <div className="col-md-1 align-self-center mt-4 pt-2">
                    {lineItems.length > 1 && (
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => removeLineItem(index)} title="Remove Item">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <button type="button" className="btn btn-outline-secondary btn-sm mt-2 d-inline-flex align-items-center gap-1" onClick={addLineItem}>
              <Plus className="w-4 h-4" /> Add Item
            </button>
          </fieldset>
          
          <fieldset className="border p-3 rounded mb-4">
            <legend className="h5 fw-normal mb-3">Quote Type & Options</legend>
            
            <div className="mb-3">
              <label htmlFor="quoteType" className="form-label">Quote Type <span className="text-danger">*</span></label>
              <select 
                className="form-select" 
                id="quoteType" 
                value={quoteType} 
                onChange={(e) => setQuoteType(e.target.value as 'material_only' | 'material_and_delivery')}
                required
              >
                <option value="material_and_delivery">Material and Delivery</option>
                <option value="material_only">Material Only (Customer arranges shipping/installation)</option>
              </select>
              <div className="form-text">
                {quoteType === 'material_only' && 'Materials only - customer arranges pickup/delivery'}
                {quoteType === 'material_and_delivery' && 'Materials with delivery - Alliance Chemical delivers to customer location'}
              </div>
            </div>

            {quoteType === 'material_only' && (
              <>
                <div className="mb-3">
                  <label htmlFor="deliveryTerms" className="form-label">Delivery Terms</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    id="deliveryTerms" 
                    value={deliveryTerms} 
                    onChange={(e) => setDeliveryTerms(e.target.value)}
                    placeholder="e.g., Customer arranges pickup, FOB Origin, etc."
                  />
                </div>
                
                <div className="mb-3">
                  <label htmlFor="materialOnlyDisclaimer" className="form-label">Material-Only Disclaimer</label>
                  <textarea 
                    className="form-control" 
                    id="materialOnlyDisclaimer" 
                    rows={3} 
                    value={materialOnlyDisclaimer} 
                    onChange={(e) => setMaterialOnlyDisclaimer(e.target.value)}
                    placeholder="Disclaimer text that will appear on the quote..."
                  />
                  <div className="form-text">This disclaimer will appear prominently on the quote and email.</div>
                </div>
              </>
            )}
          </fieldset>

          <fieldset className="border p-3 rounded mb-4">
            <legend className="h5 fw-normal mb-3">Billing Address</legend>
            
            <div className="form-check mb-3">
              <input 
                className="form-check-input" 
                type="checkbox" 
                id="useSameAddressForBilling"
                checked={useSameAddressForBilling}
                onChange={(e) => setUseSameAddressForBilling(e.target.checked)}
              />
              <label className="form-check-label" htmlFor="useSameAddressForBilling">
                Same as shipping address
              </label>
            </div>

            {!useSameAddressForBilling && (
              <div className="row g-3">
                <div className="col-md-6">
                  <label htmlFor="billCompany" className="form-label">Company</label>
                  <input type="text" className="form-control" id="billCompany" name="company" value={billingAddress.company || ''} onChange={handleBillingAddressChange} />
                </div>
                <div className="col-md-3">
                  <label htmlFor="billFirstName" className="form-label">First Name <span className="text-danger">*</span></label>
                  <input type="text" className="form-control" id="billFirstName" name="firstName" value={billingAddress.firstName || ''} onChange={handleBillingAddressChange} required />
                </div>
                <div className="col-md-3">
                  <label htmlFor="billLastName" className="form-label">Last Name <span className="text-danger">*</span></label>
                  <input type="text" className="form-control" id="billLastName" name="lastName" value={billingAddress.lastName || ''} onChange={handleBillingAddressChange} required />
                </div>
                
                <div className="col-12">
                  <label htmlFor="billAddress1" className="form-label">Address <span className="text-danger">*</span></label>
                  <input type="text" className="form-control" id="billAddress1" name="address1" value={billingAddress.address1 || ''} onChange={handleBillingAddressChange} required />
                </div>
                
                <div className="col-12">
                  <label htmlFor="billAddress2" className="form-label">Address Line 2</label>
                  <input type="text" className="form-control" id="billAddress2" name="address2" value={billingAddress.address2 || ''} onChange={handleBillingAddressChange} />
                </div>
                
                <div className="col-md-4">
                  <label htmlFor="billCity" className="form-label">City <span className="text-danger">*</span></label>
                  <input type="text" className="form-control" id="billCity" name="city" value={billingAddress.city || ''} onChange={handleBillingAddressChange} required />
                </div>
                
                <div className="col-md-3">
                  <label htmlFor="billCountry" className="form-label">Country <span className="text-danger">*</span></label>
                  <select id="billCountry" name="country" className="form-select" value={billingAddress.country} onChange={handleBillingAddressChange} required>
                    <option value="United States">United States</option>
                    <option value="Canada">Canada</option>
                  </select>
                </div>
                
                <div className="col-md-3">
                  <label htmlFor="billProvince" className="form-label">State/Province <span className="text-danger">*</span></label>
                  <input type="text" className="form-control" id="billProvince" name="province" value={billingAddress.province || ''} onChange={handleBillingAddressChange} placeholder="e.g., TX or Texas" required />
                </div>
                
                <div className="col-md-2">
                  <label htmlFor="billZip" className="form-label">ZIP/Postal Code <span className="text-danger">*</span></label>
                  <input type="text" className="form-control" id="billZip" name="zip" value={billingAddress.zip || ''} onChange={handleBillingAddressChange} required />
                </div>
                
                <div className="col-md-6">
                  <label htmlFor="billPhone" className="form-label">Phone</label>
                  <input type="tel" className="form-control" id="billPhone" name="phone" value={billingAddress.phone || ''} onChange={handleBillingAddressChange} />
                </div>
              </div>
            )}
          </fieldset>
          
          <fieldset className="mb-4 p-3 border rounded">
            <legend className="h5 fw-normal">
              {quoteType === 'material_only' ? 'Material Pickup/Delivery Address' : 'Shipping Address'}
            </legend>
            <div className="row g-3">
              <div className="col-md-6"><label htmlFor="shipFirstName" className="form-label">First Name *</label><input type="text" className="form-control" id="shipFirstName" name="firstName" value={shippingAddress.firstName || ''} onChange={handleShippingAddressChange} required /></div>
              <div className="col-md-6"><label htmlFor="shipLastName" className="form-label">Last Name *</label><input type="text" className="form-control" id="shipLastName" name="lastName" value={shippingAddress.lastName || ''} onChange={handleShippingAddressChange} required /></div>
              <div className="col-12"><label htmlFor="shipCompany" className="form-label">Company</label><input type="text" className="form-control" id="shipCompany" name="company" value={shippingAddress.company || ''} onChange={handleShippingAddressChange} /></div>
              <div className="col-12"><label htmlFor="shipAddress1" className="form-label">Address Line 1 *</label><input type="text" className="form-control" id="shipAddress1" name="address1" value={shippingAddress.address1 || ''} onChange={handleShippingAddressChange} required /></div>
              <div className="col-12"><label htmlFor="shipAddress2" className="form-label">Address Line 2</label><input type="text" className="form-control" id="shipAddress2" name="address2" value={shippingAddress.address2 || ''} onChange={handleShippingAddressChange} /></div>
              <div className="col-md-6"><label htmlFor="shipCity" className="form-label">City *</label><input type="text" className="form-control" id="shipCity" name="city" value={shippingAddress.city || ''} onChange={handleShippingAddressChange} required /></div>
              <div className="col-md-4">
                <label htmlFor="shipCountry" className="form-label">Country *</label>
                <select id="shipCountry" name="country" className="form-select" value={shippingAddress.country} onChange={handleShippingAddressChange} required>
                  <option value="United States">United States</option>
                  <option value="Canada">Canada</option>
                </select>
              </div>
              <div className="col-md-4">
                <label htmlFor="shipProvince" className="form-label">State/Province *</label>
                <input type="text" className="form-control" id="shipProvince" name="province" value={shippingAddress.province || ''} onChange={handleShippingAddressChange} placeholder="e.g., TX or Texas" required />
              </div>
              <div className="col-md-4">
                <label htmlFor="shipZip" className="form-label">ZIP/Postal Code *</label>
                <input type="text" className="form-control" id="shipZip" name="zip" value={shippingAddress.zip || ''} onChange={handleShippingAddressChange} required />
              </div>
              <div className="col-md-6"><label htmlFor="shipPhone" className="form-label">Phone</label><input type="tel" className="form-control" id="shipPhone" name="phone" value={shippingAddress.phone || ''} onChange={handleShippingAddressChange} /></div>
            </div>
          </fieldset>

          <div className="mb-3">
            <label htmlFor="quoteNote" className="form-label">Notes (visible to customer)</label>
            <textarea className="form-control" id="quoteNote" value={note} onChange={(e) => setNote(e.target.value)} rows={3}></textarea>
          </div>
          <div className="form-check mb-3">
            <input className="form-check-input" type="checkbox" id="sendShopifyInvoice" checked={sendShopifyInvoice} onChange={(e) => setSendShopifyInvoice(e.target.checked)} />
            <label className="form-check-label" htmlFor="sendShopifyInvoice">
              Send Shopify Draft Order Invoice to Customer Email (if provided)
            </label>
          </div>

          <div className="d-flex justify-content-end">
            <button type="submit" className="btn btn-success btn-lg d-inline-flex align-items-center gap-2" disabled={isLoading}>
              {isLoading ? (
                <>
                  <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                  Creating & Sending Quote...
                </>
              ) : (
                <><FileText className="w-5 h-5" /> Create Draft Order & Send Invoice</>
              )}
            </button>
          </div>
        </form>
      </div>
      <style jsx>{`
        .hover-bg-light:hover {
          background-color: #f8f9fa !important;
        }
        .cursor-pointer {
          cursor: pointer;
        }
        .object-fit-contain {
            object-fit: contain;
        }
      `}</style>
    </div>
  );
};

export default CreateQuoteClient;