'use client';

import React, { useState, useEffect, ChangeEvent, FormEvent, useRef } from 'react';
import axios, { AxiosError } from 'axios';
import { useRouter } from 'next/navigation';
import type { AppDraftOrderInput, DraftOrderLineItemInput, DraftOrderCustomerInput, DraftOrderAddressInput, ProductVariantData, DraftOrderOutput } from '@/agents/quoteAssistant/quoteInterfaces';
import DOMPurify from 'dompurify';

interface SearchResult {
  parentProduct: {
    id: string;
    name: string;
    productIdShopify?: string;
    handleShopify?: string;
    pageUrl?: string;
    primaryImageUrl?: string;
    description?: string;
  };
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

interface CreateQuoteClientProps {
  ticketId: number;
  initialCustomer: Partial<DraftOrderCustomerInput & { phone?: string; company?: string }>;
}

const CreateQuoteClient: React.FC<CreateQuoteClientProps> = ({ ticketId, initialCustomer }) => {
  const router = useRouter();

  const [lineItems, setLineItems] = useState<Array<DraftOrderLineItemInput & { productDisplay?: string }>>([{ numericVariantIdShopify: '', quantity: 1, productDisplay: '' }]);
  const [customer, setCustomer] = useState<DraftOrderCustomerInput>({
    email: initialCustomer.email || '',
    firstName: initialCustomer.firstName || '',
    lastName: initialCustomer.lastName || '',
    phone: initialCustomer.phone || '',
    company: initialCustomer.company || '',
  });
  const [shippingAddress, setShippingAddress] = useState<DraftOrderAddressInput>({
    firstName: initialCustomer.firstName || '',
    lastName: initialCustomer.lastName || '',
    address1: '', city: '', country: 'United States', zip: '', province: '',
    company: initialCustomer.company || '', phone: initialCustomer.phone || '',
  });
  const [note, setNote] = useState<string>('');
  const [sendShopifyInvoice, setSendShopifyInvoice] = useState<boolean>(true);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [createdDraftOrder, setCreatedDraftOrder] = useState<DraftOrderOutput | null>(null);
  
  // Helper function to create initial search data for a line item
  const createNewLineItemSearchData = (): LineItemSearchData => ({
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    searchTerm: '',
    searchResults: [],
    isSearching: false,
    hasSelection: false,
    error: null
  });

  // Consolidated search state
  const [lineItemSearchData, setLineItemSearchData] = useState<LineItemSearchData[]>([createNewLineItemSearchData()]);
  const [activeSearchDropdown, setActiveSearchDropdown] = useState<number | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<ProductVariantData[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductVariantData | null>(null);

  // Add refs to track search terms
  const searchTermsRef = useRef<string[]>(['']);

  // Debounced search for each line item
  useEffect(() => {
    const debounceFns = lineItemSearchData.map((searchData, index) => {
      const currentSearchTerm = searchData.searchTerm;
      const previousSearchTerm = searchTermsRef.current[index];

      // Only proceed if search term has changed
      if (currentSearchTerm === previousSearchTerm) {
        return null;
      }

      // Update ref with current search term
      searchTermsRef.current[index] = currentSearchTerm;

      if (!currentSearchTerm.trim() || currentSearchTerm.length < 2) {
        setLineItemSearchData(prevData => {
          const newData = [...prevData];
          newData[index] = { ...newData[index], searchResults: [], isSearching: false, hasSelection: false };
          return newData;
        });
        return null;
      }

      // Set searching state for this specific line item
      setLineItemSearchData(prevData => {
        const newData = [...prevData];
        newData[index] = { ...newData[index], isSearching: true, error: null };
        return newData;
      });
      
      const timerId = setTimeout(async () => {
        try {
          console.log(`Searching for: ${currentSearchTerm}`); // Debug log
          const response = await axios.get<{ results: SearchResult[] }>(`/api/products/search-variant?query=${encodeURIComponent(currentSearchTerm.trim())}`);
          const { results } = response.data;
          console.log(`Search results:`, results); // Debug log
          
          setLineItemSearchData(prevData => {
            const newData = [...prevData];
            newData[index] = { 
              ...newData[index], 
              searchResults: results || [], 
              isSearching: false,
              hasSelection: false
            };
            return newData;
          });
        } catch (error: any) {
          console.error(`Search error for line item ${index}:`, error);
          let errorMessage = 'Failed to search products. Please try again.';
          
          if (error.response) {
            if (error.response.status === 401) {
              errorMessage = 'Please log in to search products.';
            } else if (error.response.data?.error) {
              errorMessage = error.response.data.error;
            }
          }
          
          setLineItemSearchData(prevData => {
            const newData = [...prevData];
            newData[index] = { 
              ...newData[index], 
              searchResults: [], 
              isSearching: false, 
              hasSelection: false,
              error: errorMessage
            };
            return newData;
          });
        }
      }, 700);

      return timerId;
    });

    return () => {
      debounceFns.forEach(timeoutId => {
        if (timeoutId) clearTimeout(timeoutId);
      });
    };
  }, [lineItemSearchData]); // Depend on the entire lineItemSearchData to catch all changes

  // Add keyboard navigation support with visual feedback
  const [focusedResultIndex, setFocusedResultIndex] = useState<number | null>(null);

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    const currentSearchData = lineItemSearchData[index];
    if (!currentSearchData.searchResults.length) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedResultIndex(prev => {
          if (prev === null || prev >= currentSearchData.searchResults.length - 1) {
            return 0;
          }
          return prev + 1;
        });
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedResultIndex(prev => {
          if (prev === null || prev <= 0) {
            return currentSearchData.searchResults.length - 1;
          }
          return prev - 1;
        });
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedResultIndex !== null) {
          addProductToLineItems(currentSearchData.searchResults[focusedResultIndex].variant, index);
        } else if (currentSearchData.searchResults.length === 1) {
          addProductToLineItems(currentSearchData.searchResults[0].variant, index);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setActiveSearchDropdown(null);
        setFocusedResultIndex(null);
        break;
    }
  };

  // Reset focused result when dropdown closes
  useEffect(() => {
    if (activeSearchDropdown === null) {
      setFocusedResultIndex(null);
    }
  }, [activeSearchDropdown]);

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
    console.log(`Search term changed to: ${value}`); // Debug log
    setLineItemSearchData(prevData =>
      prevData.map((item, i) =>
        i === index
          ? {
              ...item,
              searchTerm: value,
              searchResults: [], // Clear results on new typing
              hasSelection: false, // Reset selection status
              error: null,
            }
          : item
      )
    );

    // If user types into an input that previously had a selected product, clear that selection from main lineItems data
    if (lineItems[index].numericVariantIdShopify) {
      const updatedLineItems = [...lineItems];
      updatedLineItems[index] = {
        ...updatedLineItems[index],
        numericVariantIdShopify: '',
        productDisplay: '',
        title: '', // Also clear title if it was set from product
      };
      setLineItems(updatedLineItems);
    }

    // Show dropdown if search term is long enough
    if (value.length >= 2) {
      setActiveSearchDropdown(index);
    } else {
      setActiveSearchDropdown(null);
    }
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { numericVariantIdShopify: '', quantity: 1, productDisplay: '' }]);
    setLineItemSearchData([...lineItemSearchData, createNewLineItemSearchData()]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
      setLineItemSearchData(lineItemSearchData.filter((_, i) => i !== index));
    }
  };
  
  const addProductToLineItems = (variant: ProductVariantData, index: number) => {
    if (!variant.numericVariantIdShopify) {
      alert("Selected variant is missing a numeric Shopify ID. Cannot add to quote.");
      setError(`Variant ${variant.sku} is missing its numeric Shopify ID.`);
      return;
    }

    const updatedLineItems = [...lineItems];
    const displayValue = `${variant.displayName || variant.variantTitle} (SKU: ${variant.sku}, ID: ${variant.numericVariantIdShopify})`;
    updatedLineItems[index] = {
      ...updatedLineItems[index],
      numericVariantIdShopify: variant.numericVariantIdShopify,
      title: variant.displayName || variant.variantTitle,
      productDisplay: displayValue,
    };
    setLineItems(updatedLineItems);

    // Update search state: show the selected product in the input, clear results, mark as selected
    setLineItemSearchData(prevData =>
      prevData.map((item, i) =>
        i === index
          ? {
              ...item,
              searchTerm: displayValue, // Show what was selected
              searchResults: [],
              isSearching: false,
              hasSelection: true, // Mark that a selection has been made
              error: null,
            }
          : item
      )
    );

    // Close the dropdown
    setActiveSearchDropdown(null);
  };

  // Add click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.product-search-container')) {
        setActiveSearchDropdown(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCustomerChange = (e: ChangeEvent<HTMLInputElement>) => {
    setCustomer({ ...customer, [e.target.name]: e.target.value });
  };

  const handleShippingAddressChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setShippingAddress({ ...shippingAddress, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setCreatedDraftOrder(null);
    setIsLoading(true);

    const draftOrderInput: AppDraftOrderInput = {
      lineItems: lineItems
        .filter(item => item.numericVariantIdShopify && item.quantity > 0)
        .map(({ productDisplay, ...rest }) => rest),
      customer,
      shippingAddress,
      note: `Quote related to Ticket #${ticketId}. ${note || ''}`,
      email: sendShopifyInvoice ? customer.email : undefined,
      tags: ['TicketSystemQuote', `TicketID-${ticketId}`],
    };

    if (draftOrderInput.lineItems.length === 0) {
      setError("Please add at least one valid line item with a Shopify Variant ID and quantity.");
      setIsLoading(false);
      return;
    }
    if (!draftOrderInput.shippingAddress?.address1 || !draftOrderInput.shippingAddress.city || !draftOrderInput.shippingAddress.country || !draftOrderInput.shippingAddress.zip) {
        setError("A complete shipping address (Address, City, Country, Zip) is required to calculate shipping.");
        setIsLoading(false);
        return;
    }
    if (!draftOrderInput.customer?.email && sendShopifyInvoice) { 
        setError("Customer email is required if you want to send an invoice.");
        setIsLoading(false); 
        return; 
    }

    try {
      const response = await axios.post<DraftOrderOutput>('/api/draft-orders', draftOrderInput);
      setSuccessMessage(`Draft order ${response.data.name} created! Status: ${response.data.status}. Shipping: ${response.data.shippingLine?.price !== undefined ? `${response.data.shippingLine.price.toFixed(2)} ${response.data.currencyCode}` : 'To be calculated or free'}.`);
      setCreatedDraftOrder(response.data);
    } catch (err) {
      const axiosError = err as AxiosError<{ error?: string }>;
      setError(axiosError.response?.data?.error || 'Failed to create draft order. Check server logs for details.');
      console.error("Draft order creation error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    try {
      const response = await axios.get(`/api/products/search-variant?query=${encodeURIComponent(query)}`);
      const { results } = response.data;
      
      if (results && results.length > 0) {
        setSearchResults(results);
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Error searching products:', error);
      setSearchError('Failed to search products. Please try again.');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="card shadow-sm">
      <div className="card-header bg-primary text-white">
        <h3 className="mb-0">Create Quote for Ticket #{ticketId}</h3>
      </div>
      <div className="card-body">
        {error && <div className="alert alert-danger" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(error) }}></div>}
        {successMessage && <div className="alert alert-success">{successMessage}</div>}
        {createdDraftOrder && (
          <div className="alert alert-info">
            <p className="mb-1"><strong>Draft Order Name:</strong> {createdDraftOrder.name}</p>
            <p className="mb-1"><strong>Status:</strong> {createdDraftOrder.status}</p>
            {createdDraftOrder.invoiceUrl && (
              <p className="mb-1"><strong>Invoice URL:</strong> <a href={createdDraftOrder.invoiceUrl} target="_blank" rel="noopener noreferrer" className="text-break">{createdDraftOrder.invoiceUrl}</a></p>
            )}
            <p className="mb-1"><strong>Total:</strong> {createdDraftOrder.totalPrice.toFixed(2)} {createdDraftOrder.currencyCode}</p>
            {createdDraftOrder.shippingLine && (
                <p className="mb-0"><strong>Shipping:</strong> {createdDraftOrder.shippingLine.title} - {createdDraftOrder.shippingLine.price.toFixed(2)} {createdDraftOrder.currencyCode}</p>
            )}
            {createdDraftOrder.note && (
                <p className="mt-2 mb-0 small text-muted"><strong>Note:</strong> {createdDraftOrder.note}</p>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Customer Section */}
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

          {/* Line Items Section */}
          <fieldset className="mb-4 p-3 border rounded">
            <legend className="h5 fw-normal">Line Items</legend>
            {lineItems.map((item, index) => (
              <div key={index} className="row g-3 align-items-start mb-3 p-3 border-bottom position-relative">
                <div className="col-md-5">
                  <label htmlFor={`itemSku-${index}`} className="form-label">Product Search *</label>
                  <div className="position-relative product-search-container">
                    <input
                      type="text"
                      className="form-control"
                      id={`itemSku-${index}`}
                      placeholder="Search by SKU, Variant ID, or product name..."
                      value={lineItemSearchData[index].searchTerm}
                      onChange={(e) => handleSearchTermChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      required
                      readOnly={lineItemSearchData[index].hasSelection}
                    />
                    {lineItemSearchData[index].isSearching && (
                      <div className="position-absolute top-0 end-0 mt-2 me-2">
                        <div className="spinner-border spinner-border-sm text-primary" role="status">
                          <span className="visually-hidden">Searching...</span>
                        </div>
                      </div>
                    )}
                    {lineItemSearchData[index].error && (
                      <div className="position-absolute w-100 mt-1 p-2 bg-danger-subtle text-danger-emphasis border border-danger rounded small">
                        {lineItemSearchData[index].error}
                      </div>
                    )}
                    {!lineItemSearchData[index].isSearching &&
                     !lineItemSearchData[index].hasSelection &&
                     lineItemSearchData[index].searchTerm.length >= 2 &&
                     lineItemSearchData[index].searchResults.length === 0 &&
                     !lineItemSearchData[index].error && (
                      <div className="position-absolute w-100 mt-1 p-2 bg-white border rounded text-muted small">
                        No products found.
                      </div>
                    )}
                    {activeSearchDropdown === index &&
                     lineItemSearchData[index].searchResults.length > 0 && (
                      <div className="position-absolute w-100 mt-1 bg-white border rounded shadow-lg" style={{ zIndex: 1000, maxHeight: '300px', overflowY: 'auto' }}>
                        {lineItemSearchData[index].searchResults.map((result, resultIndex) => (
                          <div
                            key={`${result.variant.id}-${resultIndex}`}
                            className={`p-2 cursor-pointer border-bottom ${
                              resultIndex === focusedResultIndex ? 'bg-primary text-white' : 'hover:bg-light'
                            }`}
                            onClick={() => addProductToLineItems(result.variant, index)}
                          >
                            <div className="fw-medium">{result.parentProduct.name}</div>
                            <div className={`small ${resultIndex === focusedResultIndex ? 'text-white-50' : 'text-muted'}`}>
                              SKU: {result.variant.sku} | Variant: {result.variant.variantTitle}
                            </div>
                            <div className={`small ${resultIndex === focusedResultIndex ? 'text-white-50' : 'text-muted'}`}>
                              Price: ${result.variant.price.toFixed(2)} | Stock: {result.variant.inventoryQuantity || 0}
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
                    className="form-control" 
                    id={`itemTitle-${index}`} 
                    value={item.productDisplay || ''} 
                    readOnly 
                    placeholder="Select a product from search results"
                  />
                </div>
                <div className="col-md-2">
                  <label htmlFor={`itemQuantity-${index}`} className="form-label">Quantity *</label>
                  <input
                    type="number"
                    className="form-control"
                    id={`itemQuantity-${index}`}
                    value={item.quantity}
                    onChange={(e) => handleLineItemChange(index, 'quantity', parseInt(e.target.value, 10))}
                    min="1"
                    required
                  />
                </div>
                <div className="col-md-1 align-self-center mt-4 pt-2">
                  {lineItems.length > 1 && (
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => removeLineItem(index)} title="Remove Item">
                      <i className="fas fa-trash"></i>
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button type="button" className="btn btn-outline-secondary btn-sm mt-2" onClick={addLineItem}>
              <i className="fas fa-plus me-1"></i> Add Item
            </button>
          </fieldset>

          {/* Shipping Address Section */}
          <fieldset className="mb-4 p-3 border rounded">
            <legend className="h5 fw-normal">Shipping Address</legend>
            <div className="row g-3">
              <div className="col-md-6"><label htmlFor="shipFirstName" className="form-label">First Name *</label><input type="text" className="form-control" id="shipFirstName" name="firstName" value={shippingAddress.firstName} onChange={handleShippingAddressChange} required /></div>
              <div className="col-md-6"><label htmlFor="shipLastName" className="form-label">Last Name *</label><input type="text" className="form-control" id="shipLastName" name="lastName" value={shippingAddress.lastName} onChange={handleShippingAddressChange} required /></div>
              <div className="col-12"><label htmlFor="shipCompany" className="form-label">Company</label><input type="text" className="form-control" id="shipCompany" name="company" value={shippingAddress.company || ''} onChange={handleShippingAddressChange} /></div>
              <div className="col-12"><label htmlFor="shipAddress1" className="form-label">Address Line 1 *</label><input type="text" className="form-control" id="shipAddress1" name="address1" value={shippingAddress.address1} onChange={handleShippingAddressChange} required /></div>
              <div className="col-12"><label htmlFor="shipAddress2" className="form-label">Address Line 2</label><input type="text" className="form-control" id="shipAddress2" name="address2" value={shippingAddress.address2 || ''} onChange={handleShippingAddressChange} /></div>
              <div className="col-md-6"><label htmlFor="shipCity" className="form-label">City *</label><input type="text" className="form-control" id="shipCity" name="city" value={shippingAddress.city} onChange={handleShippingAddressChange} required /></div>
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
                <input type="text" className="form-control" id="shipZip" name="zip" value={shippingAddress.zip} onChange={handleShippingAddressChange} required />
              </div>
              <div className="col-md-6"><label htmlFor="shipPhone" className="form-label">Phone</label><input type="tel" className="form-control" id="shipPhone" name="phone" value={shippingAddress.phone || ''} onChange={handleShippingAddressChange} /></div>
            </div>
          </fieldset>

          {/* Notes and Options */}
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
            <button type="submit" className="btn btn-success btn-lg" disabled={isLoading}>
              {isLoading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  Creating & Sending Quote...
                </>
              ) : (
                <><i className="fas fa-file-invoice-dollar me-2"></i> Create Draft Order & Send Invoice</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateQuoteClient; 