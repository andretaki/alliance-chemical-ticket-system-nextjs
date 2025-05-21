'use client';

import React, { useState, useEffect, ChangeEvent, FormEvent, useRef, useMemo } from 'react';
import axios, { AxiosError } from 'axios';
import { useRouter } from 'next/navigation';
import type { AppDraftOrderInput, DraftOrderLineItemInput, DraftOrderCustomerInput, DraftOrderAddressInput, ProductVariantData, ParentProductData, DraftOrderOutput } from '@/agents/quoteAssistant/quoteInterfaces';
import DOMPurify from 'dompurify';
import Image from 'next/image';
import { toast } from 'react-hot-toast';

// Updated SearchResult interface to match backend
interface SearchResult {
  parentProduct: ParentProductData;
  variant: ProductVariantData;
}

interface LineItemSearchData {
  id: string;
  searchTerm: string;
  searchResults: SearchResult[];
  isSearching: boolean;
  hasSelection: boolean;
  error?: string | null;
}

// List of common states/provinces
const provinces: Record<string, string[]> = {
  'United States': [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 
    'DC'
  ],
  'Canada': [
    'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 
    'QC', 'SK', 'YT'
  ]
};

const createNewLineItemSearchData = (): LineItemSearchData => ({
  id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  searchTerm: '',
  searchResults: [],
  isSearching: false,
  hasSelection: false,
  error: null,
});

export const DirectQuoteCreationClient: React.FC = () => {
  const router = useRouter();

  // Customer data states
  const [lineItems, setLineItems] = useState<Array<DraftOrderLineItemInput & { productDisplay?: string; unitPrice?: number; currencyCode?: string }>>([{ numericVariantIdShopify: '', quantity: 1, productDisplay: '' }]);
  const [customer, setCustomer] = useState<DraftOrderCustomerInput>({
    email: '',
    firstName: '',
    lastName: '',
    phone: '',
    company: '',
  });
  const [shippingAddress, setShippingAddress] = useState<DraftOrderAddressInput>({
    firstName: '',
    lastName: '',
    address1: '', 
    city: '', 
    country: 'United States', 
    zip: '', 
    province: '',
    company: '', 
    phone: '',
  });
  const [note, setNote] = useState<string>('');
  const [sendShopifyInvoice, setSendShopifyInvoice] = useState<boolean>(true);

  // UI states
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [createdDraftOrder, setCreatedDraftOrder] = useState<DraftOrderOutput | null>(null);
  const [createdTicketId, setCreatedTicketId] = useState<number | null>(null);
  const [isCalculatingShipping, setIsCalculatingShipping] = useState(false);
  const [selectedProvinces, setSelectedProvinces] = useState<string[]>(provinces['United States']);
  
  // Search functionality states
  const [lineItemSearchData, setLineItemSearchData] = useState<LineItemSearchData[]>([createNewLineItemSearchData()]);
  const [activeSearchDropdown, setActiveSearchDropdown] = useState<number | null>(null);
  const [focusedResultIndex, setFocusedResultIndex] = useState<number | null>(null);

  const searchTermsForEffect = useMemo(() => 
    lineItemSearchData.map(item => item.searchTerm).join('||'),
    [lineItemSearchData]
  );

  const searchContainerRefs = useRef<(HTMLDivElement | null)[]>([]);
  
  const setRef = (index: number) => (el: HTMLDivElement | null) => {
    searchContainerRefs.current[index] = el;
  };

  // Fix the province check to safely check includes
  useEffect(() => {
    if (shippingAddress.country in provinces) {
      const countryProvinces = provinces[shippingAddress.country as keyof typeof provinces];
      setSelectedProvinces(countryProvinces);
      
      // Clear province if changing countries and the province isn't valid for the new country
      if (shippingAddress.province && !countryProvinces.includes(shippingAddress.province)) {
        setShippingAddress(prev => ({ ...prev, province: '' }));
      }
    }
  }, [shippingAddress.country]);

  // Handle product search with debounce
  useEffect(() => {
    console.log('🔎 Search terms effect triggered:', searchTermsForEffect);
    
    const timers: (NodeJS.Timeout | null)[] = lineItemSearchData.map((searchData, index) => {
      const { id: itemId, searchTerm, hasSelection } = searchData;
      console.log(`🔎 Processing search item ${index}: "${searchTerm}" (hasSelection: ${hasSelection})`);

      if (hasSelection || !searchTerm || searchTerm.trim().length < 1) {
        console.log(`🔎 Skipping search for item ${index}: hasSelection=${hasSelection}, term=${searchTerm}`);
        if (searchData.isSearching || searchData.searchResults.length > 0 || searchData.error) {
           setLineItemSearchData(prev => prev.map(item => 
            item.id === itemId ? { ...item, isSearching: false, searchResults: [], error: null } : item
          ));
        }
        if(activeSearchDropdown === index && (!searchTerm || searchTerm.trim().length < 1)){
            setActiveSearchDropdown(null);
        }
        return null;
      }

      console.log(`🔎 Setting up search for item ${index}: "${searchTerm}"`);
      setLineItemSearchData(prev => prev.map(item => 
        item.id === itemId ? { ...item, isSearching: true, searchResults: [], error: null } : item
      ));
      setActiveSearchDropdown(index);

      const timerId = setTimeout(async () => {
        console.log(`🔎 Timer fired for item ${index}: "${searchTerm}"`);
        
        // SIMPLER APPROACH: Get the latest state first
        try {
          console.log(`🔎 Making API call for item ${index}: "${searchTerm}"`);
          const response = await axios.get<{ results: SearchResult[] }>(
            `/api/products/search-variant?query=${encodeURIComponent(searchTerm.trim())}`
          );
          console.log(`🔎 Search results for "${searchTerm}":`, response.data.results.length);
          
          // Debug first 3 results if any
          if (response.data.results.length > 0) {
            console.log(`🔎 First result:`, {
              name: response.data.results[0].parentProduct.name,
              variant: response.data.results[0].variant.variantTitle,
              sku: response.data.results[0].variant.sku
            });
          }
          
          // Direct state update without checking stale state
          setLineItemSearchData(prev => {
            // Find current item state in the prev array
            const currentItem = prev.find(item => item.id === itemId);
            
            // Skip update if item no longer exists or has changed
            if (!currentItem) {
              console.log(`🔎 Item with ID ${itemId} no longer exists in state`);
              return prev;
            }
            
            if (currentItem.searchTerm !== searchTerm) {
              console.log(`🔎 Search term changed: "${currentItem.searchTerm}" vs "${searchTerm}"`);
              return prev;
            }
            
            if (currentItem.hasSelection) {
              console.log(`🔎 Item now has a selection, ignoring results`);
              return prev;
            }
            
            // Make sure the dropdown is visible if there are results
            if (response.data.results.length > 0) {
              setActiveSearchDropdown(index);
            }
            
            // Update with results
            const updated = prev.map(item =>
              item.id === itemId
                ? { 
                    ...item, 
                    searchResults: response.data.results || [], 
                    isSearching: false, 
                    error: response.data.results?.length === 0 ? 'No products found.' : null 
                  }
                : item
            );
            
            console.log(`🔎 Updated line item search data:`, 
              updated.map(item => ({
                id: item.id,
                searchTerm: item.searchTerm,
                resultsCount: item.searchResults.length,
                hasSelection: item.hasSelection
              }))
            );
            
            return updated;
          });
        } catch (e: any) {
          console.error(`🔎 Search API Error for "${searchTerm}":`, e);
          setLineItemSearchData(prev =>
            prev.map(item =>
              item.id === itemId && item.searchTerm === searchTerm
                ? { ...item, searchResults: [], isSearching: false, error: 'Search failed. Please try again.' }
                : item
            )
          );
        }
      }, 300); // Reduced debounce delay for faster response
      return timerId;
    });

    return () => {
      console.log('🔎 Cleanup: Clearing timers');
      timers.forEach(timerId => {
        if (timerId) clearTimeout(timerId);
      });
    };
  }, [searchTermsForEffect, activeSearchDropdown]);

  // Handle line item changes
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
    console.log(`⭐ Search term change triggered - Index: ${index}, Value: "${value}"`);
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
    
    // Show toast notification
    toast.success(`Added "${variant.variantTitle}" to quote`);
  };
  
  const addLineItem = () => {
    setLineItems([...lineItems, { numericVariantIdShopify: '', quantity: 1, productDisplay: '' }]);
    setLineItemSearchData([...lineItemSearchData, createNewLineItemSearchData()]);
    searchContainerRefs.current.push(null);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length <= 1) return; // Always keep at least one line item

    const updatedLineItems = [...lineItems];
    updatedLineItems.splice(index, 1);
    setLineItems(updatedLineItems);

    const updatedSearchData = [...lineItemSearchData];
    updatedSearchData.splice(index, 1);
    setLineItemSearchData(updatedSearchData);
    
    toast.success("Line item removed");
  };

  // Handle click outside for search dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const isOutside = searchContainerRefs.current.every((ref, index) => {
        return !ref || !ref.contains(event.target as Node);
      });
      
      if (isOutside && activeSearchDropdown !== null) {
        setActiveSearchDropdown(null);
        setFocusedResultIndex(null);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeSearchDropdown]);

  const handleInputFocus = (index: number) => {
    console.log(`🎯 Focus on search input ${index}`, {
      searchTerm: lineItemSearchData[index]?.searchTerm,
      hasResults: lineItemSearchData[index]?.searchResults.length > 0,
      hasSelection: lineItemSearchData[index]?.hasSelection
    });
    
    const currentSearchData = lineItemSearchData[index];
    if (currentSearchData?.searchTerm && 
        !currentSearchData.hasSelection &&
        (currentSearchData.searchResults.length > 0 || currentSearchData.isSearching)) {
      console.log(`🎯 Setting activeSearchDropdown to ${index}`);
      setActiveSearchDropdown(index);
    }
    
    // Always show dropdown on focus if there's a search term
    if (currentSearchData?.searchTerm && !currentSearchData.hasSelection) {
      setActiveSearchDropdown(index);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    const currentData = lineItemSearchData[index];
    if (!currentData.searchResults.length) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSearchDropdown(index);
      
      const resultsLength = currentData.searchResults.length;
      if (resultsLength > 0) {
        let newIndex: number;
        
        if (focusedResultIndex === null) {
          newIndex = e.key === 'ArrowDown' ? 0 : resultsLength - 1;
        } else {
          newIndex = e.key === 'ArrowDown' 
            ? Math.min(focusedResultIndex + 1, resultsLength - 1)
            : Math.max(focusedResultIndex - 1, 0);
        }
        
        setFocusedResultIndex(newIndex);
      }
    } else if (e.key === 'Enter' && focusedResultIndex !== null && activeSearchDropdown === index) {
      e.preventDefault();
      const selectedResult = currentData.searchResults[focusedResultIndex];
      if (selectedResult) {
        addProductToLineItems(selectedResult, index);
      }
    } else if (e.key === 'Escape') {
      setActiveSearchDropdown(null);
      setFocusedResultIndex(null);
    }
  };

  // Pre-calculate shipping based on address
  const calculateShipping = async () => {
    if (!shippingAddress.address1 || !shippingAddress.city || !shippingAddress.zip || !shippingAddress.province) {
      toast.error("Complete shipping address required for calculation");
      return;
    }
    
    if (!lineItems.some(item => item.numericVariantIdShopify)) {
      toast.error("Add at least one product to calculate shipping");
      return;
    }
    
    setIsCalculatingShipping(true);
    try {
      const response = await axios.post('/api/shipping-rates/calculate', {
        lineItems: lineItems.filter(item => item.numericVariantIdShopify),
        shippingAddress
      });
      
      if (response.data?.availableRates?.length > 0) {
        setShippingRates(response.data.availableRates);
        setShowShippingRatesModal(true);
        // Update price summary
        setPriceSummary({
          subtotal: response.data.subtotal || null,
          total: response.data.total || null,
          shipping: response.data.availableRates[0].price || null,
          currencyCode: response.data.availableRates[0].currencyCode || 'USD'
        });
        toast.success("Shipping rates calculated successfully");
      } else {
        toast.error("No shipping rates available for this address");
      }
    } catch (error) {
      console.error("Shipping calculation error:", error);
      toast.error("Could not calculate shipping at this time");
    } finally {
      setIsCalculatingShipping(false);
    }
  };

  // Create a ticket and then create a quote
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);
    setCreatedDraftOrder(null);
    setCreatedTicketId(null);
    setIsLoading(true);

    try {
      // Validate inputs first
      if (!customer.email && sendShopifyInvoice) {
        throw new Error("Customer email is required if you want to send an invoice");
      }
      
      const filteredLineItems = lineItems.filter(item => item.numericVariantIdShopify && item.quantity > 0);
      if (filteredLineItems.length === 0) {
        throw new Error("Please add at least one valid product to the quote");
      }
      
      if (!shippingAddress.address1 || !shippingAddress.city || !shippingAddress.country || !shippingAddress.zip || !shippingAddress.province) {
        throw new Error("Complete shipping address is required");
      }

      // 1. Create a ticket first
      const ticketResponse = await axios.post('/api/tickets', {
        title: `Quote Request - ${customer.company || `${customer.firstName} ${customer.lastName}`.trim() || customer.email}`,
        description: `Quote request created from the direct quote form.\n\nCustomer: ${customer.firstName} ${customer.lastName}\nEmail: ${customer.email}\nPhone: ${customer.phone}\nCompany: ${customer.company}`,
        type: 'Quote Request',
        priority: 'medium',
        status: 'new',
        senderEmail: customer.email,
        senderPhone: customer.phone,
        senderName: `${customer.firstName} ${customer.lastName}`.trim(),
        sendercompany: customer.company
      });

      const ticketId = ticketResponse.data.ticket.id;
      setCreatedTicketId(ticketId);

      // 2. Now create the draft order with the ticket ID
      const draftOrderInput: AppDraftOrderInput = {
        lineItems: filteredLineItems.map(({ productDisplay, unitPrice, currencyCode, ...rest }) => rest),
        customer,
        shippingAddress,
        note: `Quote created from direct quote form. Related to Ticket #${ticketId}. ${note || ''}`,
        email: sendShopifyInvoice ? customer.email : undefined,
        tags: ['TicketSystemQuote', `TicketID-${ticketId}`],
      };

      // Create the draft order
      const response = await axios.post<DraftOrderOutput>('/api/draft-orders', draftOrderInput);
      setSuccessMessage(`Quote #${response.data.name} created successfully!`);
      setCreatedDraftOrder(response.data);
      
      // Show success toast
      toast.success("Quote created successfully!");
    } catch (err) {
      console.error("Error in quote creation process:", err);
      const axiosError = err as AxiosError<{ error?: string }>;
      const errorMessage = axiosError.response?.data?.error || 
                          (err instanceof Error ? err.message : 'Failed to create quote');
      setFormError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCustomerChange = (e: ChangeEvent<HTMLInputElement>) => setCustomer({ ...customer, [e.target.name]: e.target.value });
  const handleShippingAddressChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setShippingAddress({ ...shippingAddress, [e.target.name]: e.target.value });

  // Auto-populate shipping address from customer info
  useEffect(() => {
    setShippingAddress(prev => ({
      ...prev,
      firstName: customer.firstName || prev.firstName || '',
      lastName: customer.lastName || prev.lastName || '',
      company: customer.company || prev.company || '',
      phone: customer.phone || prev.phone || ''
    }));
  }, [customer.firstName, customer.lastName, customer.company, customer.phone]);

  // Check session status on component mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        console.log('🔐 Checking session status...');
        const response = await fetch('/api/auth/session');
        const data = await response.json();
        console.log('🔐 Session check response:', data);
      } catch (error) {
        console.error('🔐 Session check error:', error);
      }
    };
    
    checkSession();
  }, []);

  const [shippingRates, setShippingRates] = useState<Array<{ handle: string; title: string; price: number }>>([]);
  const [showShippingRatesModal, setShowShippingRatesModal] = useState(false);
  const [selectedShippingRate, setSelectedShippingRate] = useState<string | null>(null);

  const [priceSummary, setPriceSummary] = useState<{
    subtotal: number | null;
    total: number | null;
    shipping: number | null;
    currencyCode: string;
  }>({
    subtotal: null,
    total: null,
    shipping: null,
    currencyCode: 'USD'
  });

  return (
    <div className="card shadow-sm">
      <div className="card-header bg-primary text-white">
        <h3 className="mb-0">Create Quote</h3>
      </div>
      <div className="card-body">
        {/* Test button for debugging */}
        <button 
          type="button" 
          className="btn btn-sm btn-warning mb-3" 
          onClick={async () => {
            console.log('📡 Testing direct API call');
            try {
              const response = await axios.get('/api/products/search-variant?query=test');
              console.log('📡 Test API response:', response.data);
            } catch (error) {
              console.error('📡 Test API error:', error);
            }
          }}
        >
          Test API Connection
        </button>
        
        {formError && <div className="alert alert-danger" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(formError) }}></div>}
        {successMessage && <div className="alert alert-success">{successMessage}</div>}
        {createdTicketId && (
          <div className="alert alert-info">
            <p><strong>Ticket #{createdTicketId}</strong> was created automatically for this quote request.</p>
          </div>
        )}
        {createdDraftOrder && (
          <div className="alert alert-info">
            <p className="mb-1"><strong>Quote Name:</strong> {createdDraftOrder.name}</p>
            <p className="mb-1"><strong>Status:</strong> {createdDraftOrder.status}</p>
            <p className="mb-1"><strong>Total:</strong> {createdDraftOrder.totalPrice.toFixed(2)} {createdDraftOrder.currencyCode}</p>
            {createdDraftOrder.invoiceUrl && (
              <p className="mb-1"><strong>Invoice URL:</strong> <a href={createdDraftOrder.invoiceUrl} target="_blank" rel="noopener noreferrer" className="text-break">{createdDraftOrder.invoiceUrl}</a></p>
            )}
            <div className="mt-3">
              <a href={`/admin/tickets/${createdTicketId}`} className="btn btn-sm btn-outline-primary me-2">
                <i className="fas fa-ticket-alt me-1"></i> View Ticket
              </a>
              {(createdDraftOrder as any).adminUrl && (
                <a href={(createdDraftOrder as any).adminUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-primary">
                  <i className="fas fa-external-link-alt me-1"></i> View in Shopify
                </a>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <fieldset className="mb-4">
            <h5 className="mb-3">Customer Information</h5>
            <div className="row g-3">
              <div className="col-md-4">
                <label htmlFor="firstName" className="form-label">First Name</label>
                <input type="text" className="form-control" id="firstName" name="firstName" value={customer.firstName} onChange={handleCustomerChange} />
              </div>
              <div className="col-md-4">
                <label htmlFor="lastName" className="form-label">Last Name</label>
                <input type="text" className="form-control" id="lastName" name="lastName" value={customer.lastName} onChange={handleCustomerChange} />
              </div>
              <div className="col-md-4">
                <label htmlFor="company" className="form-label">Company</label>
                <input type="text" className="form-control" id="company" name="company" value={customer.company} onChange={handleCustomerChange} />
              </div>
              <div className="col-md-6">
                <label htmlFor="email" className="form-label">Email {sendShopifyInvoice && <span className="text-danger">*</span>}</label>
                <input type="email" className="form-control" id="email" name="email" value={customer.email} onChange={handleCustomerChange} required={sendShopifyInvoice} />
              </div>
              <div className="col-md-6">
                <label htmlFor="phone" className="form-label">Phone</label>
                <input type="tel" className="form-control" id="phone" name="phone" value={customer.phone} onChange={handleCustomerChange} />
              </div>
            </div>
          </fieldset>

          <fieldset className="mb-4">
            <h5 className="mb-3">Line Items</h5>
            {lineItems.map((itemData, index) => {
              const currentSearchState = lineItemSearchData[index] || createNewLineItemSearchData();
              
              return (
                <div key={index} className="mb-3 p-3 border rounded">
                  <div className="row g-3 mb-2">
                    {/* Product Search */}
                    <div className="col-md-5">
                      <label htmlFor={`product-${index}`} className="form-label">Search for Product</label>
                      <div className="position-relative" ref={setRef(index)}>
                        <input
                          type="text"
                          className="form-control"
                          id={`product-${index}`}
                          placeholder="Search by name, SKU, or variant..."
                          value={currentSearchState.searchTerm}
                          onChange={(e) => handleSearchTermChange(index, e.target.value)}
                          onFocus={() => handleInputFocus(index)}
                          onKeyDown={(e) => handleKeyDown(index, e)}
                          autoComplete="off"
                        />
                        {currentSearchState.isSearching && (
                          <div className="position-absolute top-50 end-0 translate-middle-y me-2">
                            <div className="spinner-border spinner-border-sm text-secondary" role="status">
                              <span className="visually-hidden">Searching...</span>
                            </div>
                          </div>
                        )}
                        {currentSearchState.error && !currentSearchState.isSearching && (
                          <div className="invalid-feedback d-block">{currentSearchState.error}</div>
                        )}
                        
                        {/* Dropdown Results */}
                        {activeSearchDropdown === index && (
                          <div className="position-absolute start-0 w-100 mt-1 overflow-hidden shadow-sm bg-white border border-light rounded z-index-dropdown">
                            <div className="px-2 py-1 bg-light text-muted small">
                              {currentSearchState.isSearching ? (
                                <span>Searching...</span>
                              ) : (
                                <span>
                                  Found {currentSearchState.searchResults.length} results for "{currentSearchState.searchTerm}"
                                </span>
                              )}
                            </div>
                            
                            {currentSearchState.error && (
                              <div className="p-2 text-danger">{currentSearchState.error}</div>
                            )}
                            
                            {!currentSearchState.error && currentSearchState.searchResults.length === 0 && !currentSearchState.isSearching && (
                              <div className="p-2 text-muted">No products found matching "{currentSearchState.searchTerm}"</div>
                            )}
                            
                            <div className="list-group list-group-flush" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                              {currentSearchState.searchResults.map((result, resultIdx) => (
                                <div
                                  key={`${result.variant.sku}-${resultIdx}`}
                                  className={`list-group-item list-group-item-action py-2 px-3 ${resultIdx === focusedResultIndex ? 'active bg-primary text-white' : ''} hover-bg-light cursor-pointer`}
                                  onClick={() => addProductToLineItems(result, index)}
                                >
                                  <div className="d-flex align-items-center">
                                    {result.parentProduct.primaryImageUrl && (
                                      <div className="me-2" style={{ width: '40px', height: '40px' }}>
                                        {/* Temporary workaround for image domain config */}
                                        <div 
                                          className="bg-light d-flex align-items-center justify-content-center rounded" 
                                          style={{ width: '40px', height: '40px' }}
                                        >
                                          <i className="fas fa-box"></i>
                                        </div>
                                        {/* Commented until next.config.ts changes take effect
                                        <Image 
                                          src={result.parentProduct.primaryImageUrl} 
                                          alt={result.parentProduct.name} 
                                          width={40} 
                                          height={40} 
                                          className="object-fit-contain" 
                                        />
                                        */}
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
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Selected Product Display */}
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

                    {/* Quantity */}
                    <div className="col-md-2">
                      <label htmlFor={`quantity-${index}`} className="form-label">Quantity</label>
                      <input
                        type="number"
                        className="form-control"
                        id={`quantity-${index}`}
                        min="1"
                        value={itemData.quantity}
                        onChange={(e) => handleLineItemChange(index, 'quantity', e.target.value)}
                      />
                    </div>

                    {/* Remove Button */}
                    <div className="col-md-1 d-flex align-items-end">
                      <button
                        type="button"
                        className="btn btn-outline-danger"
                        onClick={() => removeLineItem(index)}
                        disabled={lineItems.length <= 1}
                        aria-label="Remove item"
                      >
                        <i className="fas fa-trash-alt"></i>
                      </button>
                    </div>

                    {/* Debug button */}
                    <button 
                      type="button" 
                      className="btn btn-sm btn-outline-secondary mt-1" 
                      onClick={() => {
                        console.log(`🔍 Current search state for item ${index}:`, currentSearchState);
                        console.log(`🔍 activeSearchDropdown:`, activeSearchDropdown);
                        if (currentSearchState.searchResults.length > 0) {
                          console.log(`🔍 Sample result:`, currentSearchState.searchResults[0]);
                          setActiveSearchDropdown(index);
                        }
                      }}
                    >
                      Debug Search ({currentSearchState.searchResults.length} results)
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Add Line Item Button */}
            <button type="button" className="btn btn-outline-secondary" onClick={addLineItem}>
              <i className="fas fa-plus me-2"></i>Add Another Product
            </button>
          </fieldset>

          <fieldset className="mb-4">
            <h5 className="mb-3">Shipping Address <small className="text-muted">(Required for shipping calculation)</small></h5>
            <div className="row g-3">
              <div className="col-md-6">
                <label htmlFor="shipCompany" className="form-label">Company</label>
                <input type="text" className="form-control" id="shipCompany" name="company" value={shippingAddress.company || ''} onChange={handleShippingAddressChange} />
              </div>
              <div className="col-md-3">
                <label htmlFor="shipFirstName" className="form-label">First Name <span className="text-danger">*</span></label>
                <input type="text" className="form-control" id="shipFirstName" name="firstName" value={shippingAddress.firstName || ''} onChange={handleShippingAddressChange} required />
              </div>
              <div className="col-md-3">
                <label htmlFor="shipLastName" className="form-label">Last Name <span className="text-danger">*</span></label>
                <input type="text" className="form-control" id="shipLastName" name="lastName" value={shippingAddress.lastName || ''} onChange={handleShippingAddressChange} required />
              </div>
              
              <div className="col-md-12">
                <label htmlFor="shipAddress1" className="form-label">Address <span className="text-danger">*</span></label>
                <input type="text" className="form-control" id="shipAddress1" name="address1" value={shippingAddress.address1 || ''} onChange={handleShippingAddressChange} required />
              </div>
              
              <div className="col-md-4">
                <label htmlFor="shipCity" className="form-label">City <span className="text-danger">*</span></label>
                <input type="text" className="form-control" id="shipCity" name="city" value={shippingAddress.city || ''} onChange={handleShippingAddressChange} required />
              </div>
              
              <div className="col-md-3">
                <label htmlFor="shipCountry" className="form-label">Country <span className="text-danger">*</span></label>
                <select id="shipCountry" name="country" className="form-select" value={shippingAddress.country} onChange={handleShippingAddressChange} required>
                  <option value="United States">United States</option>
                  <option value="Canada">Canada</option>
                </select>
              </div>
              <div className="col-md-3">
                <label htmlFor="shipProvince" className="form-label">State/Province <span className="text-danger">*</span></label>
                <select className="form-select" id="shipProvince" name="province" value={shippingAddress.province || ''} onChange={handleShippingAddressChange} required>
                  <option value="">Select {shippingAddress.country === 'Canada' ? 'Province' : 'State'}</option>
                  {selectedProvinces.map(province => (
                    <option key={province} value={province}>{province}</option>
                  ))}
                </select>
              </div>
              <div className="col-md-2">
                <label htmlFor="shipZip" className="form-label">ZIP/Postal <span className="text-danger">*</span></label>
                <input type="text" className="form-control" id="shipZip" name="zip" value={shippingAddress.zip || ''} onChange={handleShippingAddressChange} required />
              </div>
              <div className="col-md-4">
                <label htmlFor="shipPhone" className="form-label">Phone</label>
                <input type="tel" className="form-control" id="shipPhone" name="phone" value={shippingAddress.phone || ''} onChange={handleShippingAddressChange} />
              </div>
              
              <div className="col-md-8 d-flex align-items-end">
                <button 
                  type="button" 
                  className="btn btn-outline-primary" 
                  onClick={calculateShipping}
                  disabled={isCalculatingShipping}
                >
                  {isCalculatingShipping ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      Calculating...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-shipping-fast me-2"></i> Calculate Shipping
                    </>
                  )}
                </button>
              </div>
            </div>
          </fieldset>

          {/* Price Summary Section */}
          {(priceSummary.subtotal !== null || priceSummary.shipping !== null || priceSummary.total !== null) && (
            <div className="card mt-4">
              <div className="card-header bg-light">
                <h5 className="mb-0">Price Summary</h5>
              </div>
              <div className="card-body">
                <div className="row">
                  <div className="col-md-6 offset-md-6">
                    <table className="table table-sm">
                      <tbody>
                        <tr>
                          <td>Subtotal:</td>
                          <td className="text-end">
                            {priceSummary.subtotal !== null ? 
                              `${priceSummary.subtotal.toFixed(2)} ${priceSummary.currencyCode}` : 
                              'Calculating...'}
                          </td>
                        </tr>
                        <tr>
                          <td>Shipping:</td>
                          <td className="text-end">
                            {priceSummary.shipping !== null ? 
                              `${priceSummary.shipping.toFixed(2)} ${priceSummary.currencyCode}` : 
                              'Calculating...'}
                          </td>
                        </tr>
                        <tr className="fw-bold">
                          <td>Total:</td>
                          <td className="text-end">
                            {priceSummary.total !== null ? 
                              `${priceSummary.total.toFixed(2)} ${priceSummary.currencyCode}` : 
                              'Calculating...'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default DirectQuoteCreationClient;
