'use client';

import React, { useState, useEffect, ChangeEvent, FormEvent, useRef, useMemo, useCallback, memo } from 'react';
import axios, { AxiosError } from 'axios';
import { useRouter } from 'next/navigation';
import type { AppDraftOrderInput, DraftOrderLineItemInput, DraftOrderCustomerInput, DraftOrderAddressInput, ProductVariantData, ParentProductData, DraftOrderOutput } from '@/agents/quoteAssistant/quoteInterfaces';
import DOMPurify from 'dompurify';
import Image from 'next/image';
import { toast } from 'react-hot-toast';

// Customer search interface
interface CustomerSearchResult {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  company: string;
  defaultAddress?: {
    firstName?: string;
    lastName?: string;
    address1?: string;
    address2?: string;
    city?: string;
    province?: string;
    country?: string;
    zip?: string;
    company?: string;
    phone?: string;
  };
  source?: string;
}

// Add ShipStation order interface
interface ShipStationOrderHistory {
  orderNumber: string;
  orderDate: string;
  orderStatus: string;
  customerEmail?: string;
  shippingAddress?: {
    firstName?: string;
    lastName?: string;
    company?: string;
    address1?: string;
    address2?: string;
    city?: string;
    province?: string;
    country?: string;
    zip?: string;
    phone?: string;
  };
  items?: Array<{
    sku: string;
    name: string;
    quantity: number;
  }>;
  trackingNumbers?: string[];
}

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

// Memoized shipping rates component to prevent re-renders
const ShippingRatesSection = memo(({ 
  shippingRates, 
  selectedShippingRateIndex, 
  onSelectRate, 
  isCalculating 
}: {
  shippingRates: Array<{
    handle: string;
    title: string;
    price: number;
    currencyCode: string;
  }>;
  selectedShippingRateIndex: number | null;
  onSelectRate: (index: number) => void;
  isCalculating: boolean;
}) => {
  if (isCalculating) {
    return (
      <div className="mt-3 p-3 bg-light rounded">
        <div className="d-flex align-items-center">
          <div className="spinner-border spinner-border-sm text-primary me-2" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <span className="text-muted">Calculating shipping rates...</span>
        </div>
      </div>
    );
  }

  if (shippingRates.length === 0) return null;

  return (
    <div className="mt-3">
      <h6 className="text-primary mb-3">
        <i className="fas fa-shipping-fast me-2"></i>
        Available Shipping Options
      </h6>
      <div className="row g-2">
        {shippingRates.map((rate, index) => (
          <div key={rate.handle || index} className="col-md-6">
            <div 
              className={`card h-100 cursor-pointer ${selectedShippingRateIndex === index ? 'border-primary bg-primary bg-opacity-10' : 'border-light'}`}
              onClick={() => onSelectRate(index)}
              style={{ cursor: 'pointer' }}
            >
              <div className="card-body p-3">
                <div className="d-flex justify-content-between align-items-center">
                  <div>
                    <h6 className="card-title mb-1">{rate.title}</h6>
                    <small className="text-muted">Shipping method</small>
                  </div>
                  <div className="text-end">
                    <div className={`fw-bold ${selectedShippingRateIndex === index ? 'text-primary' : ''}`}>
                      ${rate.price ? rate.price.toFixed(2) : '0.00'}
                    </div>
                    <small className="text-muted">{rate.currencyCode || 'USD'}</small>
                  </div>
                </div>
                {selectedShippingRateIndex === index && (
                  <div className="mt-2">
                    <i className="fas fa-check-circle text-primary me-1"></i>
                    <small className="text-primary fw-medium">Selected</small>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

ShippingRatesSection.displayName = 'ShippingRatesSection';

export const DirectQuoteCreationClient: React.FC = () => {
  const router = useRouter();

  // Customer data states
  const [lineItems, setLineItems] = useState<Array<DraftOrderLineItemInput & { productDisplay?: string; unitPrice?: number; currencyCode?: string }>>([{ numericVariantIdShopify: '', quantity: 1, productDisplay: '' }]);
  const [customer, setCustomer] = useState<DraftOrderCustomerInput & { shopifyCustomerId?: string; source?: string }>({
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
  const [billingAddress, setBillingAddress] = useState<DraftOrderAddressInput>({
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
  const [useSameAddressForBilling, setUseSameAddressForBilling] = useState<boolean>(true);
  const [quoteType, setQuoteType] = useState<'material_only' | 'material_and_delivery'>('material_and_delivery');
  const [materialOnlyDisclaimer, setMaterialOnlyDisclaimer] = useState<string>('This quote includes materials only. Shipping, installation, and setup services are not included. Customer is responsible for arranging transportation and installation.');
  const [deliveryTerms, setDeliveryTerms] = useState<string>('Customer arranges pickup');
  const [note, setNote] = useState<string>('');
  const [sendShopifyInvoice, setSendShopifyInvoice] = useState<boolean>(true);

  // UI states
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [createdDraftOrder, setCreatedDraftOrder] = useState<DraftOrderOutput | null>(null);
  const [createdTicketId, setCreatedTicketId] = useState<number | null>(null);
  const [isCalculatingShipping, setIsCalculatingShipping] = useState(false);
  const [selectedProvinces, setSelectedProvinces] = useState<string[]>(provinces['United States']);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  
  // Search functionality states
  const [lineItemSearchData, setLineItemSearchData] = useState<LineItemSearchData[]>([createNewLineItemSearchData()]);
  const [activeSearchDropdown, setActiveSearchDropdown] = useState<number | null>(null);
  const [focusedResultIndex, setFocusedResultIndex] = useState<number | null>(null);

  // Shipping rates states - removed modal, made inline
  const [shippingRates, setShippingRates] = useState<Array<{
    handle: string;
    title: string;
    price: number;
    currencyCode: string;
  }>>([]);
  const [selectedShippingRateIndex, setSelectedShippingRateIndex] = useState<number | null>(null);

  // Price summary state
  const [priceSummary, setPriceSummary] = useState<{
    subtotal: number | null;
    total: number | null;
    shipping: number | null;
    tax: number | null;
    currencyCode: string;
  }>({
    subtotal: null,
    total: null,
    shipping: null,
    tax: null,
    currencyCode: 'USD'
  });

  // Customer search state
  const [customerSearchTerm, setCustomerSearchTerm] = useState<string>('');
  const [isSearchingCustomer, setIsSearchingCustomer] = useState<boolean>(false);
  const [customerSearchResults, setCustomerSearchResults] = useState<CustomerSearchResult[]>([]);
  const [showCustomerResults, setShowCustomerResults] = useState<boolean>(false);
  const [customerSearchError, setCustomerSearchError] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null);

  // Add ShipStation previous orders state
  const [shipStationOrders, setShipStationOrders] = useState<ShipStationOrderHistory[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState<boolean>(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [showPreviousOrders, setShowPreviousOrders] = useState<boolean>(false);

  const customerSearchRef = useRef<HTMLDivElement>(null);
  const searchContainerRefs = useRef<(HTMLDivElement | null)[]>([]);
  
  const setRef = (index: number) => (el: HTMLDivElement | null) => {
    searchContainerRefs.current[index] = el;
  };

  // Memoized search terms to prevent unnecessary effects
  const searchTermsForEffect = useMemo(() => 
    lineItemSearchData.map(item => item.searchTerm).join('||'),
    [lineItemSearchData]
  );

  // Optimized province selection effect
  useEffect(() => {
    if (shippingAddress.country in provinces) {
      const countryProvinces = provinces[shippingAddress.country as keyof typeof provinces];
      setSelectedProvinces(countryProvinces);
      if (shippingAddress.province && !countryProvinces.includes(shippingAddress.province)) {
        setShippingAddress(prev => ({ ...prev, province: '' }));
      }
    }
  }, [shippingAddress.country, shippingAddress.province]);

  // Optimized search effect with better debouncing
  useEffect(() => {
    const timers: (NodeJS.Timeout | null)[] = lineItemSearchData.map((searchData, index) => {
      const { id: itemId, searchTerm, hasSelection } = searchData;

      if (hasSelection || !searchTerm || searchTerm.trim().length < 1) {
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

      setLineItemSearchData(prev => prev.map(item => 
        item.id === itemId ? { ...item, isSearching: true, searchResults: [], error: null } : item
      ));
      if (activeSearchDropdown !== index) {
        setActiveSearchDropdown(index);
      }

      const timerId = setTimeout(async () => {
        try {
          const response = await axios.get<{ results: SearchResult[] }>(
            `/api/products/search-variant?query=${encodeURIComponent(searchTerm.trim())}`
          );
          
          setLineItemSearchData(prev => {
            const currentItem = prev.find(item => item.id === itemId);
            if (!currentItem || currentItem.searchTerm !== searchTerm || currentItem.hasSelection) {
              return prev;
            }
            
            return prev.map(item => 
              item.id === itemId 
                ? { ...item, isSearching: false, searchResults: response.data.results, error: null }
                : item
            );
          });
        } catch (error) {
          console.error('Search error:', error);
          setLineItemSearchData(prev => prev.map(item => 
            item.id === itemId 
              ? { ...item, isSearching: false, searchResults: [], error: 'Search failed. Please try again.' }
              : item
          ));
        }
      }, 500); // Increased debounce time to reduce API calls

      return timerId;
    });

    return () => {
      timers.forEach(timer => timer && clearTimeout(timer));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTermsForEffect, activeSearchDropdown]);

  // Optimized subtotal calculation
  useEffect(() => {
    const subtotal = lineItems.reduce((total, item) => {
      if (item.numericVariantIdShopify && item.unitPrice && item.quantity) {
        return total + (item.unitPrice * item.quantity);
      }
      return total;
    }, 0);
    
    setPriceSummary(prev => {
      const shipping = prev.shipping || 0;
      const tax = prev.tax || 0;
      return {
        ...prev,
        subtotal,
        total: subtotal + shipping + tax
      };
    });
  }, [lineItems]);

  // Memoized handlers to prevent re-renders
  const handleLineItemChange = useCallback((index: number, field: keyof DraftOrderLineItemInput, value: string | number) => {
    setLineItems(prev => prev.map((item, i) => 
      i === index ? { ...item, [field]: value } : item
    ));
  }, []);

  const handleSearchTermChange = useCallback((index: number, value: string) => {
    setLineItemSearchData(prev => prev.map((item, i) => 
      i === index ? { ...item, searchTerm: value, hasSelection: false } : item
    ));
  }, []);

  const addProductToLineItems = useCallback((searchResult: SearchResult, index: number) => {
    const { parentProduct, variant } = searchResult;
    
    setLineItems(prev => prev.map((item, i) => {
      if (i === index) {
        const updatedItem: DraftOrderLineItemInput & { productDisplay?: string; unitPrice?: number; currencyCode?: string } = {
          ...item,
          numericVariantIdShopify: variant.numericVariantIdShopify || '',
          productDisplay: `${parentProduct.name || 'Product'} - ${variant.variantTitle} (SKU: ${variant.sku})`,
          unitPrice: variant.price,
          currencyCode: variant.currency
        };
        return updatedItem;
      }
      return item;
    }));

    setLineItemSearchData(prev => prev.map((item, i) => 
      i === index ? { ...item, hasSelection: true, searchResults: [] } : item
    ));

    setActiveSearchDropdown(null);
    setFocusedResultIndex(null);
  }, []);

  const addLineItem = useCallback(() => {
    setLineItems(prev => [...prev, { numericVariantIdShopify: '', quantity: 1, productDisplay: '' }]);
    setLineItemSearchData(prev => [...prev, createNewLineItemSearchData()]);
  }, []);

  const removeLineItem = useCallback((index: number) => {
    if (lineItems.length > 1) {
      setLineItems(prev => prev.filter((_, i) => i !== index));
      setLineItemSearchData(prev => prev.filter((_, i) => i !== index));
      
      if (activeSearchDropdown === index) {
        setActiveSearchDropdown(null);
      } else if (activeSearchDropdown !== null && activeSearchDropdown > index) {
        setActiveSearchDropdown(activeSearchDropdown - 1);
      }
    }
  }, [lineItems.length, activeSearchDropdown]);

  // Optimized shipping calculation
  const calculateShipping = useCallback(async () => {
    if (!lineItems.some(item => item.numericVariantIdShopify && item.quantity > 0) ||
        !shippingAddress.address1 || !shippingAddress.city || !shippingAddress.zip || 
        !shippingAddress.province || !shippingAddress.country) {
      toast.error('Please complete all required fields and add at least one product before calculating shipping.');
      return;
    }

    setIsCalculatingShipping(true);
    setShippingRates([]);
    setSelectedShippingRateIndex(null);

    try {
      const response = await axios.post('/api/shipping/calculate', {
        lineItems: lineItems.filter(item => item.numericVariantIdShopify && item.quantity > 0),
        shippingAddress
      });

      const availableRates = response.data.rates || [];
      setShippingRates(availableRates);

      if (availableRates.length > 0) {
        // Auto-select the first (usually cheapest) option
        setSelectedShippingRateIndex(0);
        const currentSubtotal = priceSummary.subtotal || 0;
        setPriceSummary(prev => ({
          ...prev,
          shipping: availableRates[0].price || 0,
          tax: prev.tax || null,
          total: currentSubtotal + (availableRates[0].price || 0) + (prev.tax || 0),
          currencyCode: availableRates[0].currencyCode || 'USD'
        }));
        toast.success(`Found ${availableRates.length} shipping option${availableRates.length > 1 ? 's' : ''}!`);
      } else {
        setPriceSummary(prev => ({ ...prev, shipping: 0 }));
        toast('No shipping rates available for this destination.', { icon: 'ℹ️' });
      }
    } catch (error) {
      console.error('Shipping calculation error:', error);
      setPriceSummary(prev => ({ ...prev, shipping: null, total: prev.subtotal }));
      toast.error('Failed to calculate shipping. Please try again.');
    } finally {
      setIsCalculatingShipping(false);
    }
  }, [lineItems, shippingAddress, priceSummary.subtotal]);

  // Optimized shipping rate selection
  const selectShippingRate = useCallback((index: number) => {
    if (index >= 0 && index < shippingRates.length) {
      setSelectedShippingRateIndex(index);
      const selectedRate = shippingRates[index];
      const currentSubtotal = priceSummary.subtotal || 0;
      
      setPriceSummary(prev => ({
        ...prev,
        shipping: selectedRate.price || 0,
        total: currentSubtotal + (selectedRate.price || 0) + (prev.tax || 0),
        currencyCode: selectedRate.currencyCode || prev.currencyCode
      }));
      
      toast.success(`Selected: ${selectedRate.title}`);
    }
  }, [shippingRates, priceSummary.subtotal]);

  // Input focus handler for search dropdowns
  const handleInputFocus = useCallback((index: number) => {
    const searchData = lineItemSearchData[index];
    if (searchData && searchData.searchResults.length > 0 && !searchData.hasSelection) {
      setActiveSearchDropdown(index);
    }
  }, [lineItemSearchData]);

  // Keyboard navigation for search results
  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (activeSearchDropdown !== index) return;
    
    const searchData = lineItemSearchData[index];
    if (!searchData || searchData.searchResults.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedResultIndex(prev => 
          prev === null ? 0 : Math.min(prev + 1, searchData.searchResults.length - 1)
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedResultIndex(prev => 
          prev === null ? searchData.searchResults.length - 1 : Math.max(prev - 1, 0)
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedResultIndex !== null && searchData.searchResults[focusedResultIndex]) {
          addProductToLineItems(searchData.searchResults[focusedResultIndex], index);
        }
        break;
      case 'Escape':
        setActiveSearchDropdown(null);
        setFocusedResultIndex(null);
        break;
    }
  }, [activeSearchDropdown, lineItemSearchData, focusedResultIndex, addProductToLineItems]);

  // Send invoice email function
  const sendInvoiceEmail = useCallback(async () => {
    if (!createdDraftOrder || !customer.email) {
      toast.error("Cannot send email: Missing order data or customer email");
      return;
    }

    setIsSendingEmail(true);
    try {
      const response = await axios.post('/api/email/send-invoice', {
        draftOrderId: createdDraftOrder.id,
        recipientEmail: customer.email,
        ticketId: createdTicketId
      });
      
      toast.success("Invoice email sent successfully!");
    } catch (error) {
      console.error("Error sending invoice email:", error);
      toast.error("Failed to send invoice email. Please try again.");
    } finally {
      setIsSendingEmail(false);
    }
  }, [createdDraftOrder, customer.email, createdTicketId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);
    setCreatedDraftOrder(null);
    setCreatedTicketId(null);
    setIsLoading(true);

    try {
      if (!customer.email && sendShopifyInvoice) {
        setFormError("Customer email is required if you want to send an invoice via Shopify.");
        toast.error("Customer email is required for sending Shopify invoice.");
        setIsLoading(false);
        document.getElementById('email')?.focus();
        return;
      }
      
      const filteredLineItems = lineItems.filter(item => item.numericVariantIdShopify && item.quantity > 0);
      if (filteredLineItems.length === 0) {
        setFormError("Please add at least one valid product to the quote.");
        toast.error("Add at least one product to the quote.");
        setIsLoading(false);
        return;
      }
      
      const requiredAddressFields: (keyof DraftOrderAddressInput)[] = ['address1', 'city', 'country', 'zip', 'province', 'firstName', 'lastName'];
      const missingAddressFields = requiredAddressFields.filter(field => !shippingAddress[field]);
      if (missingAddressFields.length > 0) {
          setFormError(`Complete shipping address is required. Missing: ${missingAddressFields.join(', ')}.`);
          toast.error(`Complete shipping address is required. Missing: ${missingAddressFields.join(', ')}.`);
          setIsLoading(false);
          document.getElementsByName(`ship${missingAddressFields[0].charAt(0).toUpperCase() + missingAddressFields[0].slice(1)}`)[0]?.focus();
          return;
      }

      // Check if user is authenticated
      let ticketId = null;
      try {
        // Get session info to check authentication
        const sessionResponse = await axios.get('/api/auth/session');
        
        if (sessionResponse.data && sessionResponse.data.user) {
          // User is authenticated, we can create a ticket
          const ticketResponse = await axios.post('/api/tickets', {
            title: `Quote Request - ${customer.company || `${customer.firstName} ${customer.lastName}`.trim() || customer.email}`,
            description: `Quote request created from the direct quote form.\n\nCustomer: ${customer.firstName} ${customer.lastName}\nEmail: ${customer.email}\nPhone: ${customer.phone}\nCompany: ${customer.company}\n\nNote: ${note}`,
            type: 'Quote Request',
            priority: 'medium',
            status: 'new',
            senderEmail: customer.email,
            senderPhone: customer.phone,
            senderName: `${customer.firstName} ${customer.lastName}`.trim(),
            sendercompany: customer.company
          });

          ticketId = ticketResponse.data.ticket.id;
          setCreatedTicketId(ticketId);
          console.log(`Successfully created ticket #${ticketId}`);
        } else {
          console.log('User not authenticated, skipping ticket creation');
        }
      } catch (ticketError) {
        console.error('Error creating ticket:', ticketError);
        // Continue with quote creation even if ticket creation fails
      }

      // Prepare note text
      let noteText = `Quote created from direct quote form.`;
      if (ticketId) {
        noteText += ` Related to Ticket #${ticketId}.`;
      }
      if (note) {
        noteText += ` ${note}`;
      }
      
      // Prepare tags
      const quoteTags = ['TicketSystemQuote'];
      if (ticketId) {
        quoteTags.push(`TicketID-${ticketId}`);
      }
      
      // Add quote type tag
      if (quoteType === 'material_only') {
        quoteTags.push('MaterialOnly');
      } else if (quoteType === 'material_and_delivery') {
        quoteTags.push('MaterialAndDelivery');
      }
      
      // Prepare customer input - include the shopifyCustomerId if available
      const customerInput = { ...customer };
      delete customerInput.shopifyCustomerId;
      
      // Prepare custom attributes for quote metadata
      const customAttributes: Array<{ key: string; value: string }> = [
        { key: 'quoteType', value: quoteType as string },
      ];
      
      if (quoteType === 'material_only') {
        customAttributes.push(
          { key: 'materialOnlyDisclaimer', value: materialOnlyDisclaimer },
          { key: 'deliveryTerms', value: deliveryTerms }
        );
      }
      
      const draftOrderInput: AppDraftOrderInput = {
        lineItems: filteredLineItems.map(({ productDisplay, unitPrice, currencyCode, ...rest }) => rest),
        customer: customerInput,
        shopifyCustomerId: customer.shopifyCustomerId, // Add as a separate property
        shippingAddress,
        billingAddress: useSameAddressForBilling ? shippingAddress : billingAddress,
        note: noteText.trim(),
        email: sendShopifyInvoice ? customer.email : undefined,
        tags: quoteTags,
        quoteType,
        materialOnlyDisclaimer: quoteType === 'material_only' ? materialOnlyDisclaimer : undefined,
        deliveryTerms: quoteType === 'material_only' ? deliveryTerms : undefined,
        customAttributes: customAttributes.length > 0 ? customAttributes : undefined,
      };

      if (selectedShippingRateIndex !== null && shippingRates[selectedShippingRateIndex]) {
        const selectedRate = shippingRates[selectedShippingRateIndex];
        draftOrderInput.shippingLine = {
          title: selectedRate.title,
          price: selectedRate.price.toString(),
        };
      }

      const response = await axios.post<DraftOrderOutput>('/api/draft-orders', draftOrderInput);
      setSuccessMessage(`Quote #${response.data.name} created successfully!`);
      setCreatedDraftOrder(response.data);
      toast.success("Quote created successfully!");
      
      // Optionally reset form or parts of it
      // setLineItems([{ numericVariantIdShopify: '', quantity: 1, productDisplay: '' }]);
      // setLineItemSearchData([createNewLineItemSearchData()]);
      // setCustomer({ email: '', firstName: '', lastName: '', phone: '', company: '' });
      // setShippingAddress({ firstName: '', lastName: '', address1: '', city: '', country: 'United States', zip: '', province: '', company: '', phone: '' });
      // setNote('');
      // setPriceSummary({ subtotal: null, total: null, shipping: null, currencyCode: 'USD' });

    } catch (err) {
      console.error("Error in quote creation process:", err);
      const axiosError = err as AxiosError<{ error?: string }>;
      let errorMessage = axiosError.response?.data?.error || (err instanceof Error ? err.message : 'Failed to create quote');
      
      // Check for GraphQL errors if applicable (common in Shopify integrations)
      if (axiosError.response?.data && (axiosError.response.data as any).errors) {
        errorMessage = (axiosError.response.data as any).errors.map((e: any) => e.message).join(', ');
      }

      setFormError(errorMessage);
      toast.error(errorMessage);
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
    setShippingAddress(prev => ({
      ...prev,
      firstName: customer.firstName || prev.firstName || '',
      lastName: customer.lastName || prev.lastName || '',
      company: customer.company || prev.company || '',
      // phone: customer.phone || prev.phone || '' // Decided against auto-populating phone to avoid overwriting specific shipping phone
    }));
  }, [customer.firstName, customer.lastName, customer.company]);

  useEffect(() => {
    // This effect is for debugging session, can be removed if not needed.
    const checkSession = async () => {
      try {
        // console.log('🔐 Checking session status...');
        const response = await fetch('/api/auth/session');
        const data = await response.json();
        // console.log('🔐 Session check response:', data);
      } catch (error) {
        // console.error('🔐 Session check error:', error);
      } finally {
        // Add a small delay to prevent flash
        setTimeout(() => setIsInitializing(false), 100);
      }
    };
    checkSession();
  }, []);

  // Customer search functionality - wrapped in useCallback
  const searchCustomer = useCallback(async (term: string, searchType: string = 'auto') => {
    if (!term || term.trim().length < 3) {
      setCustomerSearchResults([]);
      setShowCustomerResults(false);
      setCustomerSearchError(null);
      return;
    }

    setIsSearchingCustomer(true);
    setCustomerSearchError(null);
    setShowCustomerResults(true);

    try {
      const response = await axios.get<{
        customers: CustomerSearchResult[];
        searchMethod: string;
        searchType: string;
        query: string;
      }>(
        `/api/customers/search?query=${encodeURIComponent(term.trim())}&type=${searchType}`
      );

      if (response.data.customers.length > 0) {
        setCustomerSearchResults(response.data.customers);
        console.log(`Found customers using ${response.data.searchMethod} (${response.data.searchType})`);
      } else {
        setCustomerSearchResults([]);
        const searchTypeText = getSearchTypeDisplayText(response.data.searchType);
        setCustomerSearchError(`No customers found with that ${searchTypeText}.`);
      }
    } catch (error) {
      console.error('Customer search error:', error);
      setCustomerSearchResults([]);
      setCustomerSearchError('Failed to search for customers. Please try again.');
    } finally {
      setIsSearchingCustomer(false);
    }
  }, []); // Add dependencies if any from outer scope are used (none in this case)

  useEffect(() => { // Debounce for customer search
    const timer = setTimeout(() => {
      if (customerSearchTerm && customerSearchTerm.trim().length >= 3) {
        searchCustomer(customerSearchTerm);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [customerSearchTerm, searchCustomer]); // Added searchCustomer

  const handleCustomerSelect = (customerResult: CustomerSearchResult) => {
    console.log('Selected customer:', customerResult);
    
    // The ID from the search result could be a Shopify GID or a ShipStation identifier
    const shopifyId = customerResult.id.startsWith('gid://shopify/Customer/') 
      ? customerResult.id.split('/').pop() 
      : customerResult.source === 'shipstation'
      ? null // Explicitly set to null if source is shipstation and not a valid GID format
      : customerResult.id; // Fallback for other potential identifiers, though might need review

    setCustomer({
      email: customerResult.email,
      firstName: customerResult.firstName,
      lastName: customerResult.lastName,
      phone: customerResult.phone,
      company: customerResult.company,
      shopifyCustomerId: shopifyId || undefined,
      source: customerResult.source,
    });

    if (customerResult.defaultAddress) {
      setShippingAddress({
        firstName: customerResult.defaultAddress.firstName || customerResult.firstName || '',
        lastName: customerResult.defaultAddress.lastName || customerResult.lastName || '',
        address1: customerResult.defaultAddress.address1 || '',
        address2: customerResult.defaultAddress.address2 || '',
        city: customerResult.defaultAddress.city || '',
        province: customerResult.defaultAddress.province || '',
        country: customerResult.defaultAddress.country || 'United States',
        zip: customerResult.defaultAddress.zip || '',
        company: customerResult.defaultAddress.company || customerResult.company || '',
        phone: customerResult.defaultAddress.phone || customerResult.phone || '',
      });
    }

    setShowCustomerResults(false);
    setSelectedCustomer(customerResult); // Keep track of the selected customer
    
    // Update the search term to reflect the selection, preventing the dropdown from reappearing.
    setCustomerSearchTerm(`${customerResult.firstName} ${customerResult.lastName} <${customerResult.email}>`);
    
    // Automatically fetch ShipStation orders for the selected customer
    if (customerResult.email) {
        // console.log(`Fetching ShipStation orders for ${customerResult.email}`);
        fetchShipStationOrders(customerResult.email);
    }
  };

  // Add ShipStation previous orders functions - moved up before useEffect
  const fetchShipStationOrders = useCallback(async (customerEmail: string) => {
    if (!customerEmail) return;
    
    setIsLoadingOrders(true);
    setOrdersError(null);
    
    try {
      console.log(`Fetching ShipStation orders for: ${customerEmail}`);
      
      // Get customer name from selectedCustomer for better search
      const customerName = selectedCustomer 
        ? `${selectedCustomer.firstName} ${selectedCustomer.lastName}`.trim() 
        : '';
      
      console.log(`Customer name for search: ${customerName}`);
      
      // Build API URL with both email and name
      let apiUrl = `/api/shipstation/customer-orders?email=${encodeURIComponent(customerEmail)}`;
      if (customerName) {
        apiUrl += `&name=${encodeURIComponent(customerName)}`;
      }
      
      const response = await axios.get(apiUrl);
      
      if (response.data.orders) {
        setShipStationOrders(response.data.orders);
        console.log(`Found ${response.data.orders.length} ShipStation orders for ${customerEmail}`);
        
        // Show limitation message if no orders found
        if (response.data.orders.length === 0) {
          if (response.data.limitation) {
            setOrdersError(response.data.limitation);
          } else if (response.data.suggestion) {
            setOrdersError(response.data.suggestion);
          } else {
            setOrdersError('No previous orders found in ShipStation for this customer');
          }
        }
      } else {
        setShipStationOrders([]);
        setOrdersError(response.data.limitation || 'No orders found in ShipStation');
      }
    } catch (error: any) {
      console.error('Error fetching ShipStation orders:', error);
      const errorMessage = error.response?.data?.limitation || 
                          error.response?.data?.suggestion || 
                          error.response?.data?.error || 
                          'Failed to load order history from ShipStation';
      setOrdersError(errorMessage);
      setShipStationOrders([]);
    } finally {
      setIsLoadingOrders(false);
    }
  }, [selectedCustomer]);

  // Automatically fetch ShipStation orders when customer is selected
  useEffect(() => {
    if (selectedCustomer?.email) {
      fetchShipStationOrders(selectedCustomer.email);
      setShowPreviousOrders(true);
    }
  }, [selectedCustomer, fetchShipStationOrders]);

  const clearCustomerSearch = () => {
    setCustomerSearchTerm('');
    setCustomerSearchResults([]);
    setShowCustomerResults(false);
    setSelectedCustomer(null);
    setCustomerSearchError(null);
  };

  const populateShippingFromOrder = (order: ShipStationOrderHistory) => {
    if (!order.shippingAddress) {
      toast.error('No shipping address found for this order');
      return;
    }

    const addr = order.shippingAddress;
    setShippingAddress({
      firstName: addr.firstName || '',
      lastName: addr.lastName || '',
      company: addr.company || '',
      address1: addr.address1 || '',
      address2: addr.address2 || '',
      city: addr.city || '',
      province: addr.province || '',
      country: addr.country || 'United States',
      zip: addr.zip || '',
      phone: addr.phone || '',
    });

    toast.success(`Shipping address populated from order #${order.orderNumber}`);
  };

  // Fetch detailed order information for a specific order
  const fetchOrderDetails = async (orderNumber: string) => {
    try {
      console.log(`🔍 [Frontend] Starting fetchOrderDetails for: ${orderNumber}`);
      toast.loading(`Looking up address details for order #${orderNumber}...`);
      
      const apiUrl = `/api/shipstation/order-details?orderNumber=${encodeURIComponent(orderNumber)}`;
      console.log(`🔍 [Frontend] Making API call to: ${apiUrl}`);
      
      const response = await axios.get(apiUrl);
      console.log(`🔍 [Frontend] API response:`, response.data);
      
      if (response.data.order?.shippingAddress) {
        const addr = response.data.order.shippingAddress;
        console.log(`🔍 [Frontend] Got shipping address:`, addr);
        
        setShippingAddress({
          firstName: addr.firstName || '',
          lastName: addr.lastName || '',
          company: addr.company || '',
          address1: addr.address1 || '',
          address2: addr.address2 || '',
          city: addr.city || '',
          province: addr.province || '',
          country: addr.country || 'United States',
          zip: addr.zip || '',
          phone: addr.phone || '',
        });
        
        toast.success(`Address populated from order #${orderNumber}!`);
        
        // Update the orders list to include the shipping address
        setShipStationOrders(prevOrders => 
          prevOrders.map(order => 
            order.orderNumber === orderNumber 
              ? { ...order, shippingAddress: addr }
              : order
          )
        );
      } else {
        console.log(`🔍 [Frontend] No shipping address in response`);
        toast.error(`Order #${orderNumber} found but no shipping address available`);
      }
    } catch (error: any) {
      console.error('🔍 [Frontend] Error fetching order details:', error);
      const errorMessage = error.response?.data?.error || error.message || `Failed to fetch details for order #${orderNumber}`;
      console.error('🔍 [Frontend] Error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      toast.error(errorMessage);
    }
  };

  // Quick search functions for phone conversations
  const handleQuickSearch = (searchType: string) => {
    if (customerSearchTerm && customerSearchTerm.trim().length >= 3) {
      searchCustomer(customerSearchTerm, searchType);
    }
  };

  // Helper function for search type display text
  const getSearchTypeDisplayText = (searchType: string): string => {
    switch (searchType) {
      case 'email': return 'email address';
      case 'phone': return 'phone number';
      case 'order': return 'order number';
      case 'name': return 'name';
      default: return 'search criteria';
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        customerSearchRef.current && 
        !customerSearchRef.current.contains(event.target as Node) &&
        showCustomerResults
      ) {
        setShowCustomerResults(false);
      }
      
      // Existing code for search results
      const isOutside = searchContainerRefs.current.every((ref) => {
        return !ref || !ref.contains(event.target as Node);
      });
      
      if (isOutside && activeSearchDropdown !== null) {
        setActiveSearchDropdown(null);
        setFocusedResultIndex(null);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeSearchDropdown, showCustomerResults]);

  // Sync billing address with shipping address when checkbox is checked
  useEffect(() => {
    if (useSameAddressForBilling) {
      setBillingAddress({
        firstName: shippingAddress.firstName,
        lastName: shippingAddress.lastName,
        company: shippingAddress.company,
        address1: shippingAddress.address1,
        address2: shippingAddress.address2,
        city: shippingAddress.city,
        province: shippingAddress.province,
        zip: shippingAddress.zip,
        country: shippingAddress.country,
        phone: shippingAddress.phone,
      });
    }
  }, [useSameAddressForBilling, shippingAddress]);

  // Show loading state to prevent flash
  if (isInitializing) {
    return (
      <div className="container-xxl">
        <div className="card shadow-sm create-quote-form">
          <div className="card-body text-center py-5">
            <div className="spinner-border text-primary me-2" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <span className="text-muted">Loading quote form...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid">
      <div className="card shadow create-quote-form">
        <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
          <h3 className="mb-0"><i className="fas fa-file-invoice-dollar me-2"></i>Create Direct Quote</h3>
          {/* Test button for debugging - can be removed for production */}
          <button 
            type="button" 
            className="btn btn-sm btn-outline-light" 
            onClick={async () => {
              console.log('📡 Testing direct API call to /api/products/search-variant?query=test');
              try {
                const response = await axios.get('/api/products/search-variant?query=test');
                console.log('📡 Test API response:', response.data);
                toast('Test API call successful. Check console.');
              } catch (error) {
                console.error('📡 Test API error:', error);
                toast.error('Test API call failed. Check console.');
              }
            }}
          >
            Test API
          </button>
        </div>
        <div className="card-body">
          <div className="row">
            {/* Main form column - wider on larger screens, more focused layout */}
            <div className={`${showPreviousOrders && shipStationOrders.length > 0 ? 'col-xl-8 col-lg-8' : 'col-12'}`}>
              
            {formError && !successMessage && (
              <div className="alert alert-danger alert-dismissible fade show mb-3" role="alert">
                <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(formError) }}></div>
                <button type="button" className="btn-close" onClick={() => setFormError(null)} aria-label="Close"></button>
              </div>
            )}
            {successMessage && (
              <div className="alert alert-success mb-3">
                {successMessage}
                {createdTicketId && (
                  <p className="mb-0 mt-1">
                    <strong>Ticket #{createdTicketId}</strong> created.
                    <a href={`/tickets/${createdTicketId}`} className="alert-link ms-2" target="_blank" rel="noopener noreferrer">
                      View Ticket <i className="fas fa-external-link-alt fa-xs"></i>
                    </a>
                  </p>
                )}
              </div>
            )}
            
            {createdDraftOrder && (
              <div className="alert alert-info mb-3">
                <p className="fw-bold mb-2">Quote Details:</p>
                <div className="row g-2 mb-2">
                  <div className="col-md-6"><strong>Name:</strong> {createdDraftOrder.name}</div>
                  <div className="col-md-6"><strong>Status:</strong> <span className={`badge bg-${createdDraftOrder.status === 'OPEN' ? 'success' : 'secondary'}`}>{createdDraftOrder.status}</span></div>
                  <div className="col-md-6"><strong>Total:</strong> ${createdDraftOrder.totalPrice.toFixed(2)} {createdDraftOrder.currencyCode}</div>
                </div>
                {createdDraftOrder.invoiceUrl && (
                  <p className="mb-2"><strong>Invoice URL:</strong> <a href={createdDraftOrder.invoiceUrl} target="_blank" rel="noopener noreferrer" className="text-break alert-link">{createdDraftOrder.invoiceUrl} <i className="fas fa-external-link-alt fa-xs"></i></a></p>
                )}
                <div className="d-flex flex-wrap gap-2">
                  <a href={`/tickets/${createdTicketId}`} className="btn btn-sm btn-outline-primary">
                    <i className="fas fa-ticket-alt me-1"></i> View Ticket
                  </a>
                  {(createdDraftOrder as any).adminUrl && (
                    <a href={(createdDraftOrder as any).adminUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-primary">
                      <i className="fas fa-store me-1"></i> View in Shopify
                    </a>
                  )}
                  {customer.email && (
                    <button 
                      type="button" 
                      className="btn btn-sm btn-success" 
                      onClick={sendInvoiceEmail}
                      disabled={isSendingEmail}
                    >
                      {isSendingEmail ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                          Sending...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-envelope me-1"></i> Send Invoice Email
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <div className="card mb-3">
                <div className="card-header">
                  <h5 className="mb-0"><i className="fas fa-user me-2 text-primary"></i>Customer Information</h5>
                </div>
                <div className="card-body">
                
                {/* Customer Search Field */}
                <div className="mb-4 position-relative" ref={customerSearchRef}>
                  <label htmlFor="customerSearch" className="form-label fw-medium">Find Existing Customer</label>
                  <div className="input-group">
                    <span className="input-group-text"><i className="fas fa-search"></i></span>
                    <input
                      type="text"
                      id="customerSearch"
                      className="form-control"
                      placeholder="Search by name, email, or phone..."
                      value={customerSearchTerm}
                      onChange={(e) => setCustomerSearchTerm(e.target.value)}
                      onFocus={() => { if (customerSearchTerm.trim()) setShowCustomerResults(true); }}
                    />
                  </div>
                  {showCustomerResults && (
                    <div className="dropdown-menu d-block position-absolute w-100 mt-1 shadow-lg" style={{ zIndex: 1051 }}>
                      {isSearchingCustomer && <div className="dropdown-item">Searching...</div>}
                      {customerSearchError && <div className="dropdown-item text-danger">{customerSearchError}</div>}
                      {!isSearchingCustomer && customerSearchResults.length > 0 && customerSearchResults.map(cust => (
                        <button
                          type="button"
                          key={cust.id}
                          className="dropdown-item"
                          onClick={() => handleCustomerSelect(cust)}
                        >
                          <div><strong>{cust.firstName} {cust.lastName}</strong>{cust.company ? ` (${cust.company})` : ''}</div>
                          <small className="text-muted">{cust.email}</small>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Horizontal rule to separate search from manual entry */}
                <div className="d-flex align-items-center my-4">
                  <hr className="flex-grow-1" />
                  <span className="mx-3 text-muted small fw-medium">OR ENTER MANUALLY</span>
                  <hr className="flex-grow-1" />
                </div>

                <div className="row g-3">
                  <div className="col-lg-6">
                    <label htmlFor="firstName" className="form-label">First Name</label>
                    <input type="text" className="form-control" id="firstName" name="firstName" value={customer.firstName} onChange={handleCustomerChange} />
                  </div>
                  <div className="col-lg-6">
                    <label htmlFor="lastName" className="form-label">Last Name</label>
                    <input type="text" className="form-control" id="lastName" name="lastName" value={customer.lastName} onChange={handleCustomerChange} />
                  </div>
                  <div className="col-12">
                    <label htmlFor="company" className="form-label">Company</label>
                    <input type="text" className="form-control" id="company" name="company" value={customer.company} onChange={handleCustomerChange} />
                  </div>
                  <div className="col-lg-6">
                    <label htmlFor="email" className="form-label">Email {sendShopifyInvoice && <span className="text-danger">*</span>}</label>
                    <input type="email" className="form-control" id="email" name="email" value={customer.email} onChange={handleCustomerChange} required={sendShopifyInvoice} />
                  </div>
                  <div className="col-lg-6">
                    <label htmlFor="phone" className="form-label">Phone</label>
                    <input type="tel" className="form-control" id="phone" name="phone" value={customer.phone} onChange={handleCustomerChange} />
                  </div>
                </div>
                </div>
              </div>

              <div className="card mb-3">
                <div className="card-header">
                  <h5 className="mb-0"><i className="fas fa-shopping-cart me-2 text-primary"></i>Line Items</h5>
                </div>
                <div className="card-body">
                <div className="table-responsive">
                  <table className="table table-bordered">
                    <thead className="table-light">
                      <tr>
                        <th style={{ width: '5%' }}>#</th>
                        <th style={{ width: '45%' }}>Product Search</th>
                        <th style={{ width: '35%' }}>Selected Product</th>
                        <th style={{ width: '10%' }}>Qty</th>
                        <th style={{ width: '5%' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((itemData, index) => {
                        const currentSearchState = lineItemSearchData[index] || createNewLineItemSearchData();
                        return (
                          <tr key={currentSearchState.id || index}>
                            <td className="align-middle text-center">
                              <span className="badge bg-primary">{index + 1}</span>
                            </td>
                            <td className="align-middle">
                              <div className="position-relative" ref={setRef(index)}>
                                <input
                                  type="text"
                                  className="form-control form-control-sm"
                                  id={`product-${index}`}
                                  placeholder="Search by name, SKU, or variant..."
                                  value={currentSearchState.searchTerm}
                                  onChange={(e) => handleSearchTermChange(index, e.target.value)}
                                  onFocus={() => handleInputFocus(index)}
                                  onKeyDown={(e) => handleKeyDown(index, e)}
                                  autoComplete="off"
                                  role="combobox"
                                  aria-autocomplete="list"
                                  aria-expanded={activeSearchDropdown === index}
                                  aria-controls={`search-results-${index}`}
                                />
                                {currentSearchState.isSearching && (
                                  <div className="position-absolute top-50 end-0 translate-middle-y me-2">
                                    <div className="spinner-border spinner-border-sm text-secondary" role="status">
                                      <span className="visually-hidden">Searching...</span>
                                    </div>
                                  </div>
                                )}
                                {activeSearchDropdown === index && (
                                  <div id={`search-results-${index}`} className="dropdown-menu d-block position-absolute start-0 w-100 mt-1 shadow-lg" style={{zIndex: 1050}}>
                                    <div className="px-2 py-1 bg-light text-muted small border-bottom">
                                      {currentSearchState.isSearching ? (
                                        <span><i className="fas fa-spinner fa-spin me-1"></i>Searching...</span>
                                      ) : (
                                        <span>
                                          {currentSearchState.searchResults.length} result(s) for &ldquo;{currentSearchState.searchTerm}&rdquo;
                                        </span>
                                      )}
                                    </div>
                                    
                                    {currentSearchState.error && !currentSearchState.isSearching && (
                                      <div className="p-2 text-danger small">{currentSearchState.error}</div>
                                    )}
                                    
                                    {!currentSearchState.error && currentSearchState.searchResults.length === 0 && !currentSearchState.isSearching && currentSearchState.searchTerm.trim() !== "" && (
                                      <div className="p-2 text-muted small">No products found.</div>
                                    )}
                                    
                                    <div className="list-group list-group-flush" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                                      {currentSearchState.searchResults.map((result, resultIdx) => (
                                        <button
                                          type="button"
                                          key={result.variant.numericVariantIdShopify || `${result.variant.sku}-${resultIdx}`}
                                          className={`list-group-item list-group-item-action py-2 px-3 text-start ${resultIdx === focusedResultIndex ? 'active' : ''}`}
                                          onClick={() => addProductToLineItems(result, index)}
                                          onMouseEnter={() => setFocusedResultIndex(resultIdx)}
                                        >
                                          <div className="d-flex align-items-center">
                                            {result.parentProduct.primaryImageUrl ? (
                                               <Image 
                                                  src={result.parentProduct.primaryImageUrl} 
                                                  alt={result.parentProduct.name} 
                                                  width={30} 
                                                  height={30} 
                                                  className="object-fit-contain me-2 rounded border"
                                              />
                                            ) : (
                                              <div 
                                                className="bg-light d-flex align-items-center justify-content-center rounded border me-2" 
                                                style={{ width: '30px', height: '30px', minWidth: '30px' }}
                                              >
                                                <i className="fas fa-image text-muted"></i>
                                              </div>
                                            )}
                                            <div>
                                              <div className="fw-medium small">{result.parentProduct.name}</div>
                                              <div className={`small ${resultIdx === focusedResultIndex ? 'text-white-75' : 'text-muted'}`}>
                                                {result.variant.variantTitle} (SKU: {result.variant.sku})
                                              </div>
                                              <div className={`small fw-bold ${resultIdx === focusedResultIndex ? '' : 'text-primary'}`}>
                                                ${result.variant.price?.toFixed(2)} {result.variant.currency}
                                              </div>
                                            </div>
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                               {currentSearchState.error && !currentSearchState.isSearching && activeSearchDropdown !== index && (
                                  <div className="text-danger small mt-1">{currentSearchState.error}</div>
                                )}
                            </td>
                            <td className="align-middle">
                              <input 
                                type="text" 
                                className="form-control form-control-sm" 
                                id={`itemTitle-${index}`} 
                                value={itemData.productDisplay || ''} 
                                readOnly 
                                placeholder="Product details appear here"
                                tabIndex={-1}
                              />
                              {itemData.unitPrice !== undefined && itemData.currencyCode && (
                                  <small className="text-success d-block mt-1 fw-medium">
                                      ${itemData.unitPrice.toFixed(2)} {itemData.currencyCode}
                                  </small>
                              )}
                            </td>
                            <td className="align-middle">
                              <input
                                type="number"
                                className="form-control form-control-sm"
                                id={`itemQuantity-${index}`}
                                value={itemData.quantity}
                                onChange={(e) => handleLineItemChange(index, 'quantity', parseInt(e.target.value, 10))}
                                min="1"
                                required
                                disabled={!currentSearchState.hasSelection}
                              />
                            </td>
                            <td className="align-middle text-center">
                              {lineItems.length > 1 && (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-danger"
                                  onClick={() => removeLineItem(index)}
                                  aria-label="Remove item"
                                  title="Remove item"
                                >
                                  <i className="fas fa-trash-alt"></i>
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <button type="button" className="btn btn-outline-primary btn-lg w-100" onClick={addLineItem}>
                  <i className="fas fa-plus me-2"></i>Add Another Product
                </button>
                </div>
              </div>

              <div className="card mb-3">
                <div className="card-header">
                  <h5 className="mb-0">Quote Type & Options</h5>
                </div>
                <div className="card-body">
                
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
                    <option value="material_only">Material Only (Customer arranges pickup)</option>
                  </select>
                  <div className="form-text text-secondary">
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
                      <div className="form-text text-secondary">This disclaimer will appear prominently on the quote and email.</div>
                    </div>
                  </>
                )}
                </div>
              </div>

              {/* Billing Address Section */}
              <div className="card mb-3">
                <div className="card-header">
                  <h5 className="mb-0">Billing Address</h5>
                </div>
                <div className="card-body">
                
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
                    
                    <div className="col-md-4">
                      <label htmlFor="billPhone" className="form-label">Phone</label>
                      <input type="tel" className="form-control" id="billPhone" name="phone" value={billingAddress.phone || ''} onChange={handleBillingAddressChange} />
                    </div>
                  </div>
                )}
                </div>
              </div>

              <div className="card mb-3">
                <div className="card-header">
                  <h5 className="mb-1">
                    {quoteType === 'material_only' ? 'Material Pickup/Delivery Address' : 'Shipping Address'}
                  </h5>
                  <small className="text-body-secondary"> 
                    {quoteType === 'material_only' ? 'For pickup coordination or customer-arranged delivery' : 'Required for quote & shipping calculation'}
                  </small>
                </div>
                <div className="card-body">
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
                  
                  <div className="col-12">
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
                      <option value="">Select {shippingAddress.country === 'Canada' ? 'Province' : 'State'}...</option>
                      {selectedProvinces.map(provinceOpt => (
                        <option key={provinceOpt} value={provinceOpt}>{provinceOpt}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-2">
                    <label htmlFor="shipZip" className="form-label">ZIP/Postal <span className="text-danger">*</span></label>
                    <input type="text" className="form-control" id="shipZip" name="zip" value={shippingAddress.zip || ''} onChange={handleShippingAddressChange} required />
                  </div>
                  <div className="col-md-4">
                    <label htmlFor="shipPhone" className="form-label">Shipping Phone</label>
                    <input type="tel" className="form-control" id="shipPhone" name="phone" value={shippingAddress.phone || ''} onChange={handleShippingAddressChange} placeholder="Phone number for delivery coordination"/>
                    <div className="form-text text-secondary">Optional - for delivery coordination</div>
                  </div>
                  
                  <div className="col-12 mt-2">
                    <div className="d-grid">
                      <button 
                        type="button" 
                        className="btn btn-primary" 
                        onClick={calculateShipping}
                        disabled={
                          isCalculatingShipping || 
                          !lineItems.some(item => item.numericVariantIdShopify && item.quantity > 0) ||
                          !shippingAddress.address1 || 
                          !shippingAddress.city || 
                          !shippingAddress.zip || 
                          !shippingAddress.province || 
                          !shippingAddress.country
                        }
                      >
                        {isCalculatingShipping ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                            Calculating Shipping...
                          </>
                        ) : (
                          <>
                            <i className="fas fa-shipping-fast me-2"></i> Calculate Shipping Costs
                          </>
                        )}
                      </button>
                    </div>
                    
                    {/* Shipping Options - Directly below the button */}
                    {isCalculatingShipping && (
                      <div className="mt-3 p-3 bg-light rounded">
                        <div className="d-flex align-items-center">
                          <div className="spinner-border spinner-border-sm text-primary me-2" role="status">
                            <span className="visually-hidden">Loading...</span>
                          </div>
                          <span className="text-muted">Calculating shipping rates...</span>
                        </div>
                      </div>
                    )}
                    
                    {!isCalculatingShipping && shippingRates.length > 0 && (
                      <div className="mt-3">
                        <h6 className="text-primary mb-3">
                          <i className="fas fa-shipping-fast me-2"></i>
                          Available Shipping Options
                        </h6>
                        <div className="row g-2">
                          {shippingRates.map((rate, index) => (
                            <div key={rate.handle || index} className="col-md-6">
                              <div 
                                className={`card h-100 ${selectedShippingRateIndex === index ? 'border-primary bg-primary bg-opacity-10' : 'border-light'}`}
                                onClick={() => selectShippingRate(index)}
                                style={{ cursor: 'pointer' }}
                              >
                                <div className="card-body p-3">
                                  <div className="d-flex justify-content-between align-items-center">
                                    <div>
                                      <h6 className="card-title mb-1">{rate.title}</h6>
                                      <small className="text-muted">Shipping method</small>
                                    </div>
                                    <div className="text-end">
                                      <div className={`fw-bold ${selectedShippingRateIndex === index ? 'text-primary' : ''}`}>
                                        ${rate.price ? rate.price.toFixed(2) : '0.00'}
                                      </div>
                                      <small className="text-muted">{rate.currencyCode || 'USD'}</small>
                                    </div>
                                  </div>
                                  {selectedShippingRateIndex === index && (
                                    <div className="mt-2">
                                      <i className="fas fa-check-circle text-primary me-1"></i>
                                      <small className="text-primary fw-medium">Selected</small>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    </div>
                  </div>
                </div>
              </div>

              {(priceSummary.subtotal !== null || priceSummary.shipping !== null || priceSummary.total !== null) && (
                <div className="card mb-3 border-primary">
                  <div className="card-header bg-primary text-white">
                    <h5 className="mb-0"><i className="fas fa-calculator me-2"></i>Price Estimate</h5>
                  </div>
                  <div className="card-body">
                    <div className="row">
                      <div className="col-lg-6 offset-lg-6">
                        <table className="table table-borderless mb-0">
                          <tbody>
                            <tr>
                              <td>Subtotal:</td>
                              <td className="text-end fw-medium">
                                {priceSummary.subtotal !== null && priceSummary.subtotal !== undefined ? 
                                  `$${priceSummary.subtotal.toFixed(2)} ${priceSummary.currencyCode}` : 
                                  <span className="text-muted">N/A</span>}
                              </td>
                            </tr>
                            <tr>
                              <td>
                                Shipping:
                                {selectedShippingRateIndex !== null && shippingRates.length > 0 && (
                                  <small className="text-muted d-block">
                                    {shippingRates[selectedShippingRateIndex].title}
                                  </small>
                                )}
                              </td>
                              <td className="text-end fw-medium">
                                {priceSummary.shipping !== null ? (
                                  <>
                                    ${typeof priceSummary.shipping === 'number' ? priceSummary.shipping.toFixed(2) : '0.00'} {priceSummary.currencyCode}
                                  </>
                                ) : (
                                  isCalculatingShipping ? 'Calculating...' : <span className="text-muted">Not calculated</span>
                                )}
                              </td>
                            </tr>
                            {priceSummary.tax !== null && (
                              <tr>
                                <td>Tax:</td>
                                <td className="text-end fw-medium">
                                  ${priceSummary.tax.toFixed(2)} {priceSummary.currencyCode}
                                </td>
                              </tr>
                            )}
                            <tr className="fw-bold border-top border-2 border-primary">
                              <td className="h6 mb-0">Estimated Total:</td>
                              <td className="text-end h6 mb-0 text-primary">
                                {priceSummary.total !== null ? 
                                  `$${priceSummary.total.toFixed(2)} ${priceSummary.currencyCode}` : 
                                  (isCalculatingShipping ? 'Calculating...' : <span className="text-muted">N/A</span>)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="card mb-3">
                <div className="card-header">
                  <h5 className="mb-0">Quote Options</h5>
                </div>
                <div className="card-body">
                <div className="mb-3">
                  <label htmlFor="note" className="form-label">Notes for Quote</label>
                  <textarea 
                    className="form-control" 
                    id="note" 
                    rows={3} 
                    value={note} 
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Internal notes or details for the customer..."
                  ></textarea>
                </div>
                <div className="form-check">
                  <input 
                    className="form-check-input" 
                    type="checkbox" 
                    id="sendShopifyInvoice"
                    checked={sendShopifyInvoice}
                    onChange={(e) => setSendShopifyInvoice(e.target.checked)}
                  />
                  <label className="form-check-label" htmlFor="sendShopifyInvoice">
                    Send Shopify invoice to customer&apos;s email
                  </label>
                </div>
                </div>
              </div>

              <div className="d-flex justify-content-end gap-2 mt-3 pt-3 border-top">
                 <button 
                    type="button" 
                    className="btn btn-outline-secondary" 
                    onClick={() => router.back()}
                    disabled={isLoading}
                  >
                    <i className="fas fa-times me-2"></i>Cancel
                  </button>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  disabled={isLoading || successMessage !== null}
                >
                  {isLoading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      Creating Quote...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-file-invoice-dollar me-2"></i> Create Quote
                    </>
                  )}
                </button>
              </div>
            </form>

            </div>
            
            {/* Previous Orders Sidebar */}
            {showPreviousOrders && shipStationOrders.length > 0 && (
              <div className="col-xl-4 col-lg-4">
                <div className="card sticky-top" style={{ top: '20px' }}>
                  <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                    <h6 className="mb-0">
                      <i className="fas fa-history me-2"></i>
                      Previous Orders
                    </h6>
                    <button
                      className="btn btn-sm btn-outline-light"
                      onClick={() => setShowPreviousOrders(false)}
                      title="Hide previous orders"
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  </div>
                  <div className="card-body p-0" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                    {isLoadingOrders && (
                      <div className="text-center py-3">
                        <div className="spinner-border spinner-border-sm text-primary me-2" role="status">
                          <span className="visually-hidden">Loading...</span>
                        </div>
                        Loading order history...
                      </div>
                    )}
                    
                    {ordersError && (
                      <div className="alert alert-warning m-3 py-2 mb-0">
                        <i className="fas fa-exclamation-triangle me-2"></i>
                        <small>{ordersError}</small>
                      </div>
                    )}
                    
                    {!isLoadingOrders && !ordersError && shipStationOrders.length === 0 && (
                      <div className="text-center py-3 text-muted">
                        <i className="fas fa-inbox fa-2x mb-2 d-block text-muted opacity-50"></i>
                        <small>No previous orders found</small>
                      </div>
                    )}
                    
                    {!isLoadingOrders && shipStationOrders.length > 0 && (
                      <div className="list-group list-group-flush">
                        {shipStationOrders.slice(0, 10).map((order, index) => (
                          <div key={`${order.orderNumber}-${index}`} className="list-group-item p-3 border-0">
                            <div className="d-flex justify-content-between align-items-start mb-2">
                              <div>
                                <h6 className="mb-1 fw-bold text-primary">
                                  #{order.orderNumber}
                                </h6>
                                <small className="text-muted">
                                  {new Date(order.orderDate).toLocaleDateString()} • 
                                  <span className={`badge ms-1 ${
                                    order.orderStatus === 'shipped' ? 'bg-success' :
                                    order.orderStatus === 'awaiting_shipment' ? 'bg-warning' :
                                    order.orderStatus === 'cancelled' ? 'bg-danger' : 'bg-secondary'
                                  }`}>
                                    {order.orderStatus.replace('_', ' ')}
                                  </span>
                                </small>
                              </div>
                            </div>
                            
                            {order.items && order.items.length > 0 && (
                              <div className="small text-muted mb-2">
                                <i className="fas fa-shopping-cart me-1"></i>
                                {order.items.slice(0, 2).map(item => `${item.name} x${item.quantity}`).join(', ')}
                                {order.items.length > 2 && ` +${order.items.length - 2} more`}
                              </div>
                            )}
                            
                            {order.trackingNumbers && order.trackingNumbers.length > 0 && (
                              <div className="small mb-2">
                                <i className="fas fa-truck me-1 text-secondary"></i>
                                <span className="badge bg-light text-dark border font-monospace">
                                  {order.trackingNumbers[0]}
                                </span>
                                {order.trackingNumbers.length > 1 && (
                                  <span className="text-muted ms-1">+{order.trackingNumbers.length - 1} more</span>
                                )}
                              </div>
                            )}
                            
                            {/* Always show address button with different states */}
                            <div className="mt-2">
                              {order.shippingAddress ? (
                                <>
                                  <button
                                    className="btn btn-sm btn-outline-primary w-100"
                                    onClick={() => populateShippingFromOrder(order)}
                                    title="Use this shipping address for the quote"
                                  >
                                    <i className="fas fa-copy me-1"></i>
                                    Use Shipping Address
                                  </button>
                                  <div className="small text-muted mt-1">
                                    {order.shippingAddress.address1}, {order.shippingAddress.city} {order.shippingAddress.zip}
                                  </div>
                                </>
                              ) : (
                                <>
                                  <button
                                    className="btn btn-sm btn-outline-secondary w-100"
                                    onClick={() => fetchOrderDetails(order.orderNumber)}
                                    title="Fetch full address details for this order"
                                  >
                                    <i className="fas fa-search me-1"></i>
                                    Get Address Details
                                  </button>
                                  <div className="small text-warning mt-1">
                                    <i className="fas fa-exclamation-triangle me-1"></i>
                                    Address not loaded - click to fetch
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                        
                        {shipStationOrders.length > 10 && (
                          <div className="list-group-item text-center py-2 border-0 bg-light">
                            <small className="text-muted">
                              Showing 10 of {shipStationOrders.length} orders
                            </small>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            </div>
          </div>
        </div>


    </div>
  );
};

export default DirectQuoteCreationClient;