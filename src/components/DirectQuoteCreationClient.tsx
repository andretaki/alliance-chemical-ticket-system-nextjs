'use client';

import React, { useState, useEffect, ChangeEvent, FormEvent, useRef, useMemo, useCallback } from 'react';
import axios, { AxiosError } from 'axios';
import { useRouter } from 'next/navigation'; // Keep if used, though not explicitly in this snippet
import type { AppDraftOrderInput, DraftOrderLineItemInput, DraftOrderCustomerInput, DraftOrderAddressInput, ProductVariantData, ParentProductData, DraftOrderOutput } from '@/agents/quoteAssistant/quoteInterfaces';
import DOMPurify from 'dompurify';
import Image from 'next/image'; // Keep for future use
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
  source?: string; // Added source field
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

  // Add shipping rates and modal states
  const [shippingRates, setShippingRates] = useState<Array<{
    handle: string;
    title: string;
    price: number;
    currencyCode: string;
  }>>([]);
  const [showShippingRatesModal, setShowShippingRatesModal] = useState(false);
  const [selectedShippingRateIndex, setSelectedShippingRateIndex] = useState<number | null>(null);

  const searchTermsForEffect = useMemo(() => 
    lineItemSearchData.map(item => item.searchTerm).join('||'),
    [lineItemSearchData]
  );

  const searchContainerRefs = useRef<(HTMLDivElement | null)[]>([]);
  
  const setRef = (index: number) => (el: HTMLDivElement | null) => {
    searchContainerRefs.current[index] = el;
  };

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

  useEffect(() => {
    if (shippingAddress.country in provinces) {
      const countryProvinces = provinces[shippingAddress.country as keyof typeof provinces];
      setSelectedProvinces(countryProvinces);
      if (shippingAddress.province && !countryProvinces.includes(shippingAddress.province)) {
        setShippingAddress(prev => ({ ...prev, province: '' }));
      }
    }
  }, [shippingAddress.country, shippingAddress.province]);

  useEffect(() => {
    // console.log('🔎 Search terms effect triggered:', searchTermsForEffect);
    const timers: (NodeJS.Timeout | null)[] = lineItemSearchData.map((searchData, index) => {
      const { id: itemId, searchTerm, hasSelection } = searchData;
      // console.log(`🔎 Processing search item ${index}: "${searchTerm}" (hasSelection: ${hasSelection})`);

      if (hasSelection || !searchTerm || searchTerm.trim().length < 1) {
        // console.log(`🔎 Skipping search for item ${index}: hasSelection=${hasSelection}, term=${searchTerm}`);
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

      // console.log(`🔎 Setting up search for item ${index}: "${searchTerm}"`);
      setLineItemSearchData(prev => prev.map(item => 
        item.id === itemId ? { ...item, isSearching: true, searchResults: [], error: null } : item
      ));
      if (activeSearchDropdown !== index) { // Only set if not already active, or to re-trigger if needed
        setActiveSearchDropdown(index);
      }


      const timerId = setTimeout(async () => {
        // console.log(`🔎 Timer fired for item ${index}: "${searchTerm}"`);
        try {
          // console.log(`🔎 Making API call for item ${index}: "${searchTerm}"`);
          const response = await axios.get<{ results: SearchResult[] }>(
            `/api/products/search-variant?query=${encodeURIComponent(searchTerm.trim())}`
          );
          // console.log(`🔎 Search results for "${searchTerm}":`, response.data.results.length);
          
          setLineItemSearchData(prev => {
            const currentItem = prev.find(item => item.id === itemId);
            if (!currentItem || currentItem.searchTerm !== searchTerm || currentItem.hasSelection) {
              // console.log(`🔎 Stale search or selection made for item ${itemId}, skipping update.`);
              return prev;
            }
            
            if (response.data.results.length > 0 && activeSearchDropdown !== index) {
              // This might be a redundant setActiveSearchDropdown, but ensures visibility if conditions change rapidly.
              // setActiveSearchDropdown(index);
            }
            
            return prev.map(item =>
              item.id === itemId
                ? { 
                    ...item, 
                    searchResults: response.data.results || [], 
                    isSearching: false, 
                    error: response.data.results?.length === 0 ? 'No products found.' : null 
                  }
                : item
            );
          });
        } catch (e: any) {
          // console.error(`🔎 Search API Error for "${searchTerm}":`, e);
          setLineItemSearchData(prev =>
            prev.map(item =>
              item.id === itemId && item.searchTerm === searchTerm
                ? { ...item, searchResults: [], isSearching: false, error: 'Search failed. Please try again.' }
                : item
            )
          );
        }
      }, 300);
      return timerId;
    });

    return () => {
      // console.log('🔎 Cleanup: Clearing timers');
      timers.forEach(timerId => {
        if (timerId) clearTimeout(timerId);
      });
    }; // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTermsForEffect, activeSearchDropdown]); // Added activeSearchDropdown

  const handleLineItemChange = (index: number, field: keyof DraftOrderLineItemInput, value: string | number) => {
    const updatedLineItems = [...lineItems];
    if (field === 'quantity') {
        const newQuantity = Math.max(1, Number(value));
        updatedLineItems[index] = { ...updatedLineItems[index], [field]: newQuantity };
        console.log(`Updated quantity for item ${index} to ${newQuantity}, price: ${updatedLineItems[index].unitPrice}`);
    } else {
        updatedLineItems[index] = { ...updatedLineItems[index], [field]: String(value) };
    }
    setLineItems(updatedLineItems);
  };

  const handleSearchTermChange = (index: number, value: string) => {
    // console.log(`⭐ Search term change triggered - Index: ${index}, Value: "${value}"`);
    const currentItemSearchId = lineItemSearchData[index]?.id;
    setLineItemSearchData(prevData =>
      prevData.map((item) =>
        item.id === currentItemSearchId
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
    // Ensure dropdown opens on typing if it was closed
    if (value.trim().length > 0) {
       setActiveSearchDropdown(index);
    } else {
       setActiveSearchDropdown(null);
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

    console.log('Adding product to line items:', variant);
    console.log('Product price:', variant.price);
    console.log('Product currency:', variant.currency);

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

    // Log the updated line items to verify changes
    console.log('Updated line items:', updatedLineItems);
    
    // Calculate and log the new subtotal
    const newSubtotal = updatedLineItems.reduce((total, item) => {
      if (item.numericVariantIdShopify && item.unitPrice && item.quantity) {
        return total + (item.unitPrice * item.quantity);
      }
      return total;
    }, 0);
    console.log('New calculated subtotal:', newSubtotal);

    setLineItemSearchData(prevData =>
      prevData.map(item =>
        item.id === currentItemSearchId
          ? {
              ...item,
              searchTerm: displayValue, // Keep selected item name in search bar
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
    toast.success(`Added "${variant.variantTitle}" to quote`);
  };
  
  const addLineItem = () => {
    setLineItems([...lineItems, { numericVariantIdShopify: '', quantity: 1, productDisplay: '' }]);
    setLineItemSearchData([...lineItemSearchData, createNewLineItemSearchData()]);
    searchContainerRefs.current.push(null); // Accommodate new ref
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length <= 1) return; 

    const updatedLineItems = [...lineItems];
    updatedLineItems.splice(index, 1);
    setLineItems(updatedLineItems);

    const updatedSearchData = [...lineItemSearchData];
    updatedSearchData.splice(index, 1);
    setLineItemSearchData(updatedSearchData);
    
    searchContainerRefs.current.splice(index, 1); // Remove ref

    toast.success("Line item removed");
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
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
  }, [activeSearchDropdown]);

  const handleInputFocus = (index: number) => {
    const currentSearchData = lineItemSearchData[index];
    if (currentSearchData?.searchTerm && 
        !currentSearchData.hasSelection &&
        (currentSearchData.searchResults.length > 0 || currentSearchData.isSearching || currentSearchData.error)) {
      setActiveSearchDropdown(index);
    } else if (currentSearchData?.searchTerm && !currentSearchData.hasSelection) {
      // If there's a term but no results yet (e.g. typing first char), still show (empty/loading) dropdown
      setActiveSearchDropdown(index);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    const currentData = lineItemSearchData[index];
    if (!currentData || !currentData.searchResults) return;


    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!currentData.searchResults.length && !currentData.isSearching) return;

      setActiveSearchDropdown(index); // Ensure dropdown is active
      
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
      if (currentData.searchResults[focusedResultIndex]) {
        addProductToLineItems(currentData.searchResults[focusedResultIndex], index);
      }
    } else if (e.key === 'Escape') {
      setActiveSearchDropdown(null);
      setFocusedResultIndex(null);
    }
  };

  const calculateShipping = async () => {
    // Validation for shipping calculation
    const requiredAddressFields: (keyof DraftOrderAddressInput)[] = ['address1', 'city', 'zip', 'province', 'country'];
    const missingFields = requiredAddressFields.filter(field => !shippingAddress[field]);

    if (missingFields.length > 0) {
      toast.error(`Complete shipping address required: ${missingFields.join(', ')}`);
      // Optionally, focus the first missing field
      const firstMissingFieldElement = document.getElementsByName(missingFields[0])[0];
      if (firstMissingFieldElement) (firstMissingFieldElement as HTMLElement).focus();
      return;
    }
    
    if (!lineItems.some(item => item.numericVariantIdShopify && item.quantity > 0)) {
      toast.error("Add at least one product to calculate shipping");
      return;
    }
    
    setIsCalculatingShipping(true);
    try {
      const response = await axios.post('/api/shipping-rates/calculate', {
        lineItems: lineItems.filter(item => item.numericVariantIdShopify && item.quantity > 0)
                            .map(({ numericVariantIdShopify, quantity }) => ({ numericVariantIdShopify, quantity })),
        shippingAddress
      });
      
      console.log('Shipping rates response:', response.data);
      
      if (response.data?.length > 0) {
        // The API now returns an array of rates directly
        const availableRates = response.data.map((rate: any) => ({
          handle: rate.handle,
          title: rate.title,
          price: parseFloat(rate.price.amount), // Extract price from the nested object
          currencyCode: rate.price.currencyCode,
        }));

        setShippingRates(availableRates);
        
        // If there are multiple rates, show the selection modal
        if (availableRates.length > 1) {
          setSelectedShippingRateIndex(0); // Default to first option
          setShowShippingRatesModal(true);
          toast.success(`${availableRates.length} shipping options available`);
        } else {
          // If only one rate, select it automatically
          setSelectedShippingRateIndex(0);
          toast.success(`Shipping calculated: ${availableRates[0].title}`);
        }
        
        // Get current subtotal from line items
        const currentSubtotal = lineItems.reduce((total, item) => {
          if (item.numericVariantIdShopify && item.unitPrice && item.quantity) {
            return total + (item.unitPrice * item.quantity);
          }
          return total;
        }, 0);

        console.log('Current subtotal for shipping calc:', currentSubtotal);
        console.log('API subtotal response:', response.data.subtotal);
        console.log('First shipping rate:', availableRates[0]);
        
        // Update price summary with the first rate initially
        setPriceSummary({
          subtotal: currentSubtotal,
          shipping: availableRates[0].price || null,
          tax: priceSummary.tax || null, // Preserve existing tax if any
          total: currentSubtotal + (availableRates[0].price || 0) + (priceSummary.tax || 0),
          currencyCode: availableRates[0].currencyCode || 'USD'
        });
      } else {
        setPriceSummary(prev => ({ ...prev, shipping: 0 })); // No rates, shipping is 0
        toast.error("No shipping rates available for this address.");
      }
    } catch (error: any) {
      console.error("Shipping calculation error:", error);
      const errorMsg = error.response?.data?.error || "Could not calculate shipping at this time.";
      toast.error(errorMsg);
      setPriceSummary(prev => ({ ...prev, shipping: null, total: prev.subtotal })); // Reset shipping
    } finally {
      setIsCalculatingShipping(false);
    }
  };

  // Handle shipping rate selection
  const selectShippingRate = (index: number) => {
    if (index >= 0 && index < shippingRates.length) {
      setSelectedShippingRateIndex(index);
      const selectedRate = shippingRates[index];
      
      console.log('Selected shipping rate:', selectedRate);
      
      // Update price summary with the selected shipping rate
      setPriceSummary(prev => {
        const subtotal = prev.subtotal || 0;
        const tax = prev.tax || 0;
        const shipping = selectedRate.price;
        
        return {
          ...prev,
          shipping,
          total: subtotal + shipping + tax,
          currencyCode: selectedRate.currencyCode || prev.currencyCode
        };
      });
      
      toast.success(`Selected shipping: ${selectedRate.title}`);
      setShowShippingRatesModal(false);
    }
  };

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
      }
    };
    checkSession();
  }, []);

  // Removed shippingRates and showShippingRatesModal as they weren't fully implemented in the original snippet
  // If needed, they can be re-added along with a modal component.

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

  // Add new useEffect to calculate subtotal whenever line items change
  useEffect(() => {
    // Calculate subtotal based on line items with valid prices
    const subtotal = lineItems.reduce((total, item) => {
      if (item.numericVariantIdShopify && item.unitPrice && item.quantity) {
        return total + (item.unitPrice * item.quantity);
      }
      return total;
    }, 0);
    
    // Always update the subtotal, even if it's 0
    console.log('Calculated subtotal from line items:', subtotal);
    setPriceSummary(prev => {
      const shipping = prev.shipping || 0;
      const tax = prev.tax || 0;
      return {
        ...prev,
        subtotal,
        // If shipping exists, update total, otherwise just show subtotal as total
        total: subtotal + shipping + tax
      };
    });
  }, [lineItems]);

  // Send invoice email with PDF attachment
  const sendInvoiceEmail = async () => {
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
  };

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

  return (
    <div className="container-xxl">
      <div className="card shadow-sm create-quote-form">
        <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
          <h3 className="mb-0">Create Direct Quote</h3>
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
            <div className={`${showPreviousOrders && shipStationOrders.length > 0 ? 'col-xl-9 col-lg-8' : 'col-12'} mb-4`}>
              
            {formError && !successMessage && (
              <div className="alert alert-danger alert-dismissible fade show" role="alert">
                <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(formError) }}></div>
                <button type="button" className="btn-close" onClick={() => setFormError(null)} aria-label="Close"></button>
              </div>
            )}
            {successMessage && (
              <div className="alert alert-success">
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
              <div className="alert alert-info mt-3">
                <p className="fw-bold mb-1">Quote Details:</p>
                <p className="mb-1"><strong>Name:</strong> {createdDraftOrder.name}</p>
                <p className="mb-1"><strong>Status:</strong> <span className={`badge bg-${createdDraftOrder.status === 'OPEN' ? 'success' : 'secondary'}`}>{createdDraftOrder.status}</span></p>
                <p className="mb-1"><strong>Total:</strong> ${createdDraftOrder.totalPrice.toFixed(2)} {createdDraftOrder.currencyCode}</p>
                {createdDraftOrder.invoiceUrl && (
                  <p className="mb-1"><strong>Invoice URL:</strong> <a href={createdDraftOrder.invoiceUrl} target="_blank" rel="noopener noreferrer" className="text-break alert-link">{createdDraftOrder.invoiceUrl} <i className="fas fa-external-link-alt fa-xs"></i></a></p>
                )}
                <div className="mt-3">
                  <a href={`/tickets/${createdTicketId}`} className="btn btn-sm btn-outline-primary me-2">
                    <i className="fas fa-ticket-alt me-1"></i> View Ticket
                  </a>
                  {(createdDraftOrder as any).adminUrl && (
                    <a href={(createdDraftOrder as any).adminUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-primary me-2">
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
              <fieldset className="border p-4 rounded mb-4 bg-light">
                <legend className="h5 fw-normal mb-3 float-none w-auto px-2 bg-white">
                  <i className="fas fa-user me-2 text-primary"></i>Customer Information
                </legend>
                
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
                          <div><strong>{cust.firstName} {cust.lastName}</strong> ({cust.company})</div>
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
              </fieldset>

              <fieldset className="border p-4 rounded mb-4">
                <legend className="h5 fw-normal mb-3 float-none w-auto px-2">
                  <i className="fas fa-shopping-cart me-2 text-primary"></i>Line Items
                </legend>
                {lineItems.map((itemData, index) => {
                  const currentSearchState = lineItemSearchData[index] || createNewLineItemSearchData();
                  return (
                    <div key={currentSearchState.id || index} className={`mb-4 p-4 border rounded bg-white ${index > 0 ? 'mt-4' : ''}`}>
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <h6 className="mb-0 text-primary fw-medium">Product #{index + 1}</h6>
                        {lineItems.length > 1 && (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => removeLineItem(index)}
                            aria-label="Remove item"
                          >
                            <i className="fas fa-trash-alt me-1"></i>Remove
                          </button>
                        )}
                      </div>
                      
                      <div className="row g-3 align-items-start">
                        <div className="col-12">
                          <label htmlFor={`product-${index}`} className="form-label fw-medium">Product Search</label>
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
                              role="combobox"
                              aria-autocomplete="list"
                              aria-expanded={activeSearchDropdown === index}
                              aria-controls={`search-results-${index}`}
                            />
                            {currentSearchState.isSearching && (
                              <div className="position-absolute top-50 end-0 translate-middle-y me-3">
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
                                              width={40} 
                                              height={40} 
                                              className="object-fit-contain me-2 rounded border"
                                          />
                                        ) : (
                                          <div 
                                            className="bg-light d-flex align-items-center justify-content-center rounded border me-2" 
                                            style={{ width: '40px', height: '40px', minWidth: '40px' }}
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
                        </div>
                        
                        <div className="col-lg-8">
                          <label htmlFor={`itemTitle-${index}`} className="form-label fw-medium">Selected Product</label>
                          <input 
                            type="text" 
                            className="form-control" 
                            id={`itemTitle-${index}`} 
                            value={itemData.productDisplay || ''} 
                            readOnly 
                            placeholder="Product details appear here"
                            tabIndex={-1}
                          />
                          {itemData.unitPrice !== undefined && itemData.currencyCode && (
                              <small className="text-success d-block mt-1 fw-medium">
                                  Unit Price: ${itemData.unitPrice.toFixed(2)} {itemData.currencyCode}
                              </small>
                          )}
                        </div>

                        <div className="col-lg-4">
                          <label htmlFor={`itemQuantity-${index}`} className="form-label fw-medium">Quantity</label>
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
                      </div>
                    </div>
                  );
                })}
                <button type="button" className="btn btn-outline-primary btn-lg w-100" onClick={addLineItem}>
                  <i className="fas fa-plus me-2"></i>Add Another Product
                </button>
              </fieldset>

              <fieldset className="border p-3 rounded mb-4">
                <legend className="h5 fw-normal mb-3 float-none w-auto px-2">Quote Type & Options</legend>
                
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

              {/* Billing Address Section */}
              <fieldset className="border p-3 rounded mb-4">
                <legend className="h5 fw-normal mb-3 float-none w-auto px-2">Billing Address</legend>
                
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
              </fieldset>

              <fieldset className="border p-3 rounded mb-4">
                <legend className="h5 fw-normal mb-3 float-none w-auto px-2">
                  {quoteType === 'material_only' ? 'Material Pickup/Delivery Address' : 'Shipping Address'}
                  <small className="text-muted fw-light"> 
                    ({quoteType === 'material_only' ? 'For pickup coordination or customer-arranged delivery' : 'Required for quote & shipping calculation'})
                  </small>
                </legend>
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
                    <input type="tel" className="form-control" id="shipPhone" name="phone" value={shippingAddress.phone || ''} onChange={handleShippingAddressChange} placeholder="For delivery purposes"/>
                  </div>
                  
                  <div className="col-12 mt-3">
                    <button 
                      type="button" 
                      className="btn btn-outline-info" 
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
                </div>
              </fieldset>

              {(priceSummary.subtotal !== null || priceSummary.shipping !== null || priceSummary.total !== null) && (
                <div className="card my-4 border">
                  <div className="card-body p-3">
                    <h5 className="card-title h6 text-muted mb-2">Price Estimate</h5>
                    <div className="row">
                      <div className="col-lg-6 offset-lg-6 col-md-8 offset-md-4">
                        <table className="table table-sm mb-0">
                          <tbody>
                            <tr>
                              <td>Subtotal:</td>
                              <td className="text-end">
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
                              <td className="text-end">
                                {priceSummary.shipping !== null ? (
                                  <>
                                    ${typeof priceSummary.shipping === 'number' ? priceSummary.shipping.toFixed(2) : '0.00'} {priceSummary.currencyCode}
                                    {shippingRates.length > 1 && (
                                      <button
                                        className="btn btn-sm btn-link p-0 ms-2"
                                        onClick={() => setShowShippingRatesModal(true)}
                                        type="button"
                                      >
                                        <i className="fas fa-edit"></i>
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  isCalculatingShipping ? 'Calculating...' : <span className="text-muted">Not calculated</span>
                                )}
                              </td>
                            </tr>
                            {priceSummary.tax !== null && (
                              <tr>
                                <td>Tax:</td>
                                <td className="text-end">
                                  ${priceSummary.tax.toFixed(2)} {priceSummary.currencyCode}
                                </td>
                              </tr>
                            )}
                            <tr className="fw-bold border-top">
                              <td>Estimated Total:</td>
                              <td className="text-end">
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
              
              <fieldset className="border p-3 rounded mb-4">
                <legend className="h5 fw-normal mb-3 float-none w-auto px-2">Quote Options</legend>
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
              </fieldset>

              <div className="d-grid gap-2 d-md-flex justify-content-md-end mt-4 pt-3 border-top">
                 <button 
                    type="button" 
                    className="btn btn-outline-secondary me-md-2" 
                    onClick={() => router.back()} // Or router.push('/admin/quotes') etc.
                    disabled={isLoading}
                  >
                    Cancel
                  </button>
                <button 
                  type="submit" 
                  className="btn btn-primary btn-lg" 
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
              <div className="col-lg-4">
                <div className="card h-100 border-start-0 border-top-0 border-bottom-0 border-end border-primary">
                  <div className="card-header bg-light d-flex justify-content-between align-items-center">
                    <h6 className="mb-0">
                      <i className="fas fa-history me-2 text-primary"></i>
                      Previous Orders
                    </h6>
                    <button
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => setShowPreviousOrders(false)}
                      title="Hide previous orders"
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  </div>
                  <div className="card-body p-0" style={{ maxHeight: '600px', overflowY: 'auto' }}>
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

        {/* Shipping Rates Modal */}
        {showShippingRatesModal && shippingRates.length > 0 && (
          <div className="modal fade show" 
               style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }} 
               tabIndex={-1} 
               role="dialog"
               onClick={() => setShowShippingRatesModal(false)}>
            <div className="modal-dialog modal-dialog-centered" 
                 role="document"
                 onClick={e => e.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Select Shipping Option</h5>
                  <button type="button" 
                          className="btn-close" 
                          onClick={() => setShowShippingRatesModal(false)}
                          aria-label="Close"></button>
                </div>
                <div className="modal-body">
                  <div className="list-group">
                    {shippingRates.map((rate, index) => (
                      <button key={rate.handle || index} 
                              type="button"
                            className={`list-group-item list-group-item-action ${selectedShippingRateIndex === index ? 'active' : ''}`}
                            onClick={() => selectShippingRate(index)}>
                      <div className="d-flex justify-content-between align-items-center">
                        <div>
                          <div className="fw-bold">{rate.title}</div>
                          <small className="text-muted">Shipping method</small>
                        </div>
                        <span className={`badge ${selectedShippingRateIndex === index ? 'bg-light text-dark' : 'bg-primary'}`}>
                          ${rate.price ? rate.price.toFixed(2) : '0.00'} {rate.currencyCode || 'USD'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" 
                        className="btn btn-secondary" 
                        onClick={() => setShowShippingRatesModal(false)}>
                  Cancel
                </button>
                <button type="button" 
                        className="btn btn-primary"
                        onClick={() => {
                          if (selectedShippingRateIndex !== null) {
                            selectShippingRate(selectedShippingRateIndex);
                          }
                        }}>
                  Confirm Selection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DirectQuoteCreationClient;