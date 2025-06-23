'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useFormContext } from 'react-hook-form';
import axios from 'axios';
import { QuoteFormData } from '../types';

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

const CustomerStep = () => {
  const { register, formState: { errors }, setValue } = useFormContext<QuoteFormData>();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<CustomerSearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const handleSelectCustomer = (customer: CustomerSearchResult) => {
    setValue('customer.firstName', customer.firstName, { shouldValidate: true });
    setValue('customer.lastName', customer.lastName, { shouldValidate: true });
    setValue('customer.email', customer.email, { shouldValidate: true });
    setValue('customer.phone', customer.phone || '');
    setValue('customer.company', customer.company || '');
    
    // Also populate shipping address if available
    if (customer.defaultAddress) {
        setValue('shippingAddress.firstName', customer.defaultAddress.firstName || customer.firstName || '');
        setValue('shippingAddress.lastName', customer.defaultAddress.lastName || customer.lastName || '');
        setValue('shippingAddress.address1', customer.defaultAddress.address1 || '');
        setValue('shippingAddress.city', customer.defaultAddress.city || '');
        setValue('shippingAddress.province', customer.defaultAddress.province || '');
        setValue('shippingAddress.country', customer.defaultAddress.country || 'United States');
        setValue('shippingAddress.zip', customer.defaultAddress.zip || '');
        setValue('shippingAddress.company', customer.defaultAddress.company || customer.company || '');
        setValue('shippingAddress.phone', customer.defaultAddress.phone || customer.phone || '');
    }
    
    setSearchTerm(`${customer.firstName} ${customer.lastName}`);
    setShowResults(false);
  };

  const searchCustomer = useCallback(async (term: string) => {
    if (term.trim().length < 3) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const response = await axios.get<{ customers: CustomerSearchResult[] }>(
        `/api/customers/search?query=${encodeURIComponent(term.trim())}`
      );
      setSearchResults(response.data.customers || []);
    } catch (error) {
      console.error('Customer search failed:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm) {
        searchCustomer(searchTerm);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, searchCustomer]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div>
      <h5 className="mb-3">Customer Details</h5>
      <div className="row g-3">
        {/* Customer Search Field */}
        <div className="col-12" ref={searchRef}>
            <label htmlFor="customerSearch" className="form-label">Find Existing Customer</label>
            <div className="input-group">
                <span className="input-group-text"><i className="fas fa-search"></i></span>
                <input
                    type="text"
                    id="customerSearch"
                    className="form-control"
                    placeholder="Search by name, email, or phone..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onFocus={() => setShowResults(true)}
                />
            </div>
            {showResults && (
            <div className="dropdown-menu d-block position-absolute w-100 mt-1 shadow-lg" style={{ zIndex: 1051, maxWidth: 'calc(100% - 2.5rem)'}}>
              {isSearching && <div className="dropdown-item">Searching...</div>}
              {!isSearching && searchResults.length === 0 && searchTerm.length > 2 && <div className="dropdown-item text-muted">No customers found.</div>}
              {!isSearching && searchResults.length > 0 && searchResults.map(cust => (
                <button
                  type="button"
                  key={cust.id}
                  className="dropdown-item"
                  onClick={() => handleSelectCustomer(cust)}
                >
                  <div><strong>{cust.firstName} {cust.lastName}</strong>{cust.company ? ` (${cust.company})` : ''}</div>
                  <small className="text-muted">{cust.email}</small>
                </button>
              ))}
            </div>
            )}
        </div>
        
        {/* Horizontal rule to separate search from manual entry */}
        <div className="col-12 d-flex align-items-center my-3">
            <hr className="flex-grow-1" />
            <span className="mx-3 text-muted small fw-medium">OR ENTER MANUALLY</span>
            <hr className="flex-grow-1" />
        </div>

        <div className="col-md-6">
          <label htmlFor="customer.firstName" className="form-label">First Name</label>
          <input
            id="customer.firstName"
            {...register('customer.firstName')}
            className={`form-control ${errors.customer?.firstName ? 'is-invalid' : ''}`}
          />
          {errors.customer?.firstName && (
            <div className="invalid-feedback">{errors.customer.firstName.message}</div>
          )}
        </div>
        <div className="col-md-6">
          <label htmlFor="customer.lastName" className="form-label">Last Name</label>
          <input
            id="customer.lastName"
            {...register('customer.lastName')}
            className={`form-control ${errors.customer?.lastName ? 'is-invalid' : ''}`}
          />
          {errors.customer?.lastName && (
            <div className="invalid-feedback">{errors.customer.lastName.message}</div>
          )}
        </div>
        <div className="col-md-6">
          <label htmlFor="customer.email" className="form-label">Email</label>
          <input
            id="customer.email"
            type="email"
            {...register('customer.email')}
            className={`form-control ${errors.customer?.email ? 'is-invalid' : ''}`}
          />
          {errors.customer?.email && (
            <div className="invalid-feedback">{errors.customer.email.message}</div>
          )}
        </div>
        <div className="col-md-6">
          <label htmlFor="customer.phone" className="form-label">Phone</label>
          <input
            id="customer.phone"
            {...register('customer.phone')}
            className="form-control"
          />
        </div>
        <div className="col-12">
          <label htmlFor="customer.company" className="form-label">Company</label>
          <input
            id="customer.company"
            {...register('customer.company')}
            className="form-control"
          />
        </div>
      </div>
    </div>
  );
};

export default CustomerStep;
