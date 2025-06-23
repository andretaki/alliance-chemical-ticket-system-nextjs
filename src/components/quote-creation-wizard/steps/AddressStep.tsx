'use client';

import React, { useState, useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import { QuoteFormData } from '../types';

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

const AddressStep = () => {
  const { register, watch, setValue, formState: { errors } } = useFormContext<QuoteFormData>();
  
  const [shippingProvinces, setShippingProvinces] = useState<string[]>(provinces['United States']);
  const [billingProvinces, setBillingProvinces] = useState<string[]>(provinces['United States']);
  
  const useSameAddress = watch('useSameAddressForBilling');
  const shippingCountry = watch('shippingAddress.country');
  const billingCountry = watch('billingAddress.country');
  const shippingAddress = watch('shippingAddress');

  // Update provinces when country changes
  useEffect(() => {
    if (shippingCountry && provinces[shippingCountry]) {
      setShippingProvinces(provinces[shippingCountry]);
    }
  }, [shippingCountry]);

  useEffect(() => {
    if (billingCountry && provinces[billingCountry]) {
      setBillingProvinces(provinces[billingCountry]);
    }
  }, [billingCountry]);

  // Sync billing address with shipping when checkbox is checked
  useEffect(() => {
    if (useSameAddress && shippingAddress) {
      setValue('billingAddress.firstName', shippingAddress.firstName || '');
      setValue('billingAddress.lastName', shippingAddress.lastName || '');
      setValue('billingAddress.company', shippingAddress.company || '');
      setValue('billingAddress.address1', shippingAddress.address1 || '');
      setValue('billingAddress.address2', shippingAddress.address2 || '');
      setValue('billingAddress.city', shippingAddress.city || '');
      setValue('billingAddress.province', shippingAddress.province || '');
      setValue('billingAddress.country', shippingAddress.country || 'United States');
      setValue('billingAddress.zip', shippingAddress.zip || '');
      setValue('billingAddress.phone', shippingAddress.phone || '');
    }
  }, [useSameAddress, shippingAddress, setValue]);

  return (
    <div>
      <h5 className="mb-3">Shipping & Billing Addresses</h5>
      
      {/* Quote Type Selection */}
      <div className="card mb-4">
        <div className="card-header">
          <h6 className="mb-0">Quote Type</h6>
        </div>
        <div className="card-body">
          <div className="mb-3">
            <label htmlFor="quoteType" className="form-label">Quote Type <span className="text-danger">*</span></label>
            <select 
              {...register('quoteType')}
              className="form-select"
              id="quoteType"
            >
              <option value="material_and_delivery">Material and Delivery</option>
              <option value="material_only">Material Only (Customer arranges pickup)</option>
            </select>
          </div>
          
          <div className="mb-3">
            <label htmlFor="deliveryTerms" className="form-label">Delivery Terms</label>
            <input 
              {...register('deliveryTerms')}
              type="text" 
              className="form-control" 
              id="deliveryTerms"
              placeholder="e.g., Customer arranges pickup, FOB Origin, etc."
            />
          </div>
          
          <div className="mb-3">
            <label htmlFor="materialOnlyDisclaimer" className="form-label">Material-Only Disclaimer</label>
            <textarea 
              {...register('materialOnlyDisclaimer')}
              className="form-control" 
              id="materialOnlyDisclaimer" 
              rows={3}
              placeholder="Disclaimer text that will appear on the quote..."
            />
          </div>
        </div>
      </div>

      {/* Shipping Address */}
      <div className="card mb-4">
        <div className="card-header">
          <h6 className="mb-0">Shipping Address</h6>
        </div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-6">
              <label htmlFor="shippingCompany" className="form-label">Company</label>
              <input 
                {...register('shippingAddress.company')}
                type="text" 
                className="form-control" 
                id="shippingCompany"
              />
            </div>
            <div className="col-md-3">
              <label htmlFor="shippingFirstName" className="form-label">First Name <span className="text-danger">*</span></label>
              <input 
                {...register('shippingAddress.firstName')}
                type="text" 
                className={`form-control ${errors.shippingAddress?.firstName ? 'is-invalid' : ''}`}
                id="shippingFirstName"
              />
              {errors.shippingAddress?.firstName && (
                <div className="invalid-feedback">{errors.shippingAddress.firstName.message}</div>
              )}
            </div>
            <div className="col-md-3">
              <label htmlFor="shippingLastName" className="form-label">Last Name <span className="text-danger">*</span></label>
              <input 
                {...register('shippingAddress.lastName')}
                type="text" 
                className={`form-control ${errors.shippingAddress?.lastName ? 'is-invalid' : ''}`}
                id="shippingLastName"
              />
              {errors.shippingAddress?.lastName && (
                <div className="invalid-feedback">{errors.shippingAddress.lastName.message}</div>
              )}
            </div>
            
            <div className="col-12">
              <label htmlFor="shippingAddress1" className="form-label">Address <span className="text-danger">*</span></label>
              <input 
                {...register('shippingAddress.address1')}
                type="text" 
                className={`form-control ${errors.shippingAddress?.address1 ? 'is-invalid' : ''}`}
                id="shippingAddress1"
              />
              {errors.shippingAddress?.address1 && (
                <div className="invalid-feedback">{errors.shippingAddress.address1.message}</div>
              )}
            </div>
            
            <div className="col-12">
              <label htmlFor="shippingAddress2" className="form-label">Address Line 2</label>
              <input 
                {...register('shippingAddress.address2')}
                type="text" 
                className="form-control" 
                id="shippingAddress2"
              />
            </div>
            
            <div className="col-md-4">
              <label htmlFor="shippingCity" className="form-label">City <span className="text-danger">*</span></label>
              <input 
                {...register('shippingAddress.city')}
                type="text" 
                className={`form-control ${errors.shippingAddress?.city ? 'is-invalid' : ''}`}
                id="shippingCity"
              />
              {errors.shippingAddress?.city && (
                <div className="invalid-feedback">{errors.shippingAddress.city.message}</div>
              )}
            </div>
            
            <div className="col-md-3">
              <label htmlFor="shippingCountry" className="form-label">Country <span className="text-danger">*</span></label>
              <select 
                {...register('shippingAddress.country')}
                className="form-select" 
                id="shippingCountry"
              >
                <option value="United States">United States</option>
                <option value="Canada">Canada</option>
              </select>
            </div>
            
            <div className="col-md-3">
              <label htmlFor="shippingProvince" className="form-label">State/Province <span className="text-danger">*</span></label>
              <select 
                {...register('shippingAddress.province')}
                className={`form-select ${errors.shippingAddress?.province ? 'is-invalid' : ''}`}
                id="shippingProvince"
              >
                <option value="">Select {shippingCountry === 'Canada' ? 'Province' : 'State'}...</option>
                {shippingProvinces.map(province => (
                  <option key={province} value={province}>{province}</option>
                ))}
              </select>
              {errors.shippingAddress?.province && (
                <div className="invalid-feedback">{errors.shippingAddress.province.message}</div>
              )}
            </div>
            
            <div className="col-md-2">
              <label htmlFor="shippingZip" className="form-label">ZIP/Postal <span className="text-danger">*</span></label>
              <input 
                {...register('shippingAddress.zip')}
                type="text" 
                className={`form-control ${errors.shippingAddress?.zip ? 'is-invalid' : ''}`}
                id="shippingZip"
              />
              {errors.shippingAddress?.zip && (
                <div className="invalid-feedback">{errors.shippingAddress.zip.message}</div>
              )}
            </div>
            
            <div className="col-md-4">
              <label htmlFor="shippingPhone" className="form-label">Phone</label>
              <input 
                {...register('shippingAddress.phone')}
                type="tel" 
                className="form-control" 
                id="shippingPhone"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Billing Address */}
      <div className="card mb-4">
        <div className="card-header">
          <h6 className="mb-0">Billing Address</h6>
        </div>
        <div className="card-body">
          <div className="form-check mb-3">
            <input 
              {...register('useSameAddressForBilling')}
              className="form-check-input" 
              type="checkbox" 
              id="useSameAddressForBilling"
            />
            <label className="form-check-label" htmlFor="useSameAddressForBilling">
              Same as shipping address
            </label>
          </div>

          {!useSameAddress && (
            <div className="row g-3">
              <div className="col-md-6">
                <label htmlFor="billingCompany" className="form-label">Company</label>
                <input 
                  {...register('billingAddress.company')}
                  type="text" 
                  className="form-control" 
                  id="billingCompany"
                />
              </div>
              <div className="col-md-3">
                <label htmlFor="billingFirstName" className="form-label">First Name <span className="text-danger">*</span></label>
                <input 
                  {...register('billingAddress.firstName')}
                  type="text" 
                  className={`form-control ${errors.billingAddress?.firstName ? 'is-invalid' : ''}`}
                  id="billingFirstName"
                />
                {errors.billingAddress?.firstName && (
                  <div className="invalid-feedback">{errors.billingAddress.firstName.message}</div>
                )}
              </div>
              <div className="col-md-3">
                <label htmlFor="billingLastName" className="form-label">Last Name <span className="text-danger">*</span></label>
                <input 
                  {...register('billingAddress.lastName')}
                  type="text" 
                  className={`form-control ${errors.billingAddress?.lastName ? 'is-invalid' : ''}`}
                  id="billingLastName"
                />
                {errors.billingAddress?.lastName && (
                  <div className="invalid-feedback">{errors.billingAddress.lastName.message}</div>
                )}
              </div>
              
              <div className="col-12">
                <label htmlFor="billingAddress1" className="form-label">Address <span className="text-danger">*</span></label>
                <input 
                  {...register('billingAddress.address1')}
                  type="text" 
                  className={`form-control ${errors.billingAddress?.address1 ? 'is-invalid' : ''}`}
                  id="billingAddress1"
                />
                {errors.billingAddress?.address1 && (
                  <div className="invalid-feedback">{errors.billingAddress.address1.message}</div>
                )}
              </div>
              
              <div className="col-12">
                <label htmlFor="billingAddress2" className="form-label">Address Line 2</label>
                <input 
                  {...register('billingAddress.address2')}
                  type="text" 
                  className="form-control" 
                  id="billingAddress2"
                />
              </div>
              
              <div className="col-md-4">
                <label htmlFor="billingCity" className="form-label">City <span className="text-danger">*</span></label>
                <input 
                  {...register('billingAddress.city')}
                  type="text" 
                  className={`form-control ${errors.billingAddress?.city ? 'is-invalid' : ''}`}
                  id="billingCity"
                />
                {errors.billingAddress?.city && (
                  <div className="invalid-feedback">{errors.billingAddress.city.message}</div>
                )}
              </div>
              
              <div className="col-md-3">
                <label htmlFor="billingCountry" className="form-label">Country <span className="text-danger">*</span></label>
                <select 
                  {...register('billingAddress.country')}
                  className="form-select" 
                  id="billingCountry"
                >
                  <option value="United States">United States</option>
                  <option value="Canada">Canada</option>
                </select>
              </div>
              
              <div className="col-md-3">
                <label htmlFor="billingProvince" className="form-label">State/Province <span className="text-danger">*</span></label>
                <select 
                  {...register('billingAddress.province')}
                  className={`form-select ${errors.billingAddress?.province ? 'is-invalid' : ''}`}
                  id="billingProvince"
                >
                  <option value="">Select {billingCountry === 'Canada' ? 'Province' : 'State'}...</option>
                  {billingProvinces.map(province => (
                    <option key={province} value={province}>{province}</option>
                  ))}
                </select>
                {errors.billingAddress?.province && (
                  <div className="invalid-feedback">{errors.billingAddress.province.message}</div>
                )}
              </div>
              
              <div className="col-md-2">
                <label htmlFor="billingZip" className="form-label">ZIP/Postal <span className="text-danger">*</span></label>
                <input 
                  {...register('billingAddress.zip')}
                  type="text" 
                  className={`form-control ${errors.billingAddress?.zip ? 'is-invalid' : ''}`}
                  id="billingZip"
                />
                {errors.billingAddress?.zip && (
                  <div className="invalid-feedback">{errors.billingAddress.zip.message}</div>
                )}
              </div>
              
              <div className="col-md-4">
                <label htmlFor="billingPhone" className="form-label">Phone</label>
                <input 
                  {...register('billingAddress.phone')}
                  type="tel" 
                  className="form-control" 
                  id="billingPhone"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Additional Options */}
      <div className="card">
        <div className="card-header">
          <h6 className="mb-0">Additional Options</h6>
        </div>
        <div className="card-body">
          <div className="mb-3">
            <label htmlFor="note" className="form-label">Notes for Quote</label>
            <textarea 
              {...register('note')}
              className="form-control" 
              id="note" 
              rows={3}
              placeholder="Internal notes or details for the customer..."
            />
          </div>
          
          <div className="form-check">
            <input 
              {...register('sendShopifyInvoice')}
              className="form-check-input" 
              type="checkbox" 
              id="sendShopifyInvoice"
            />
            <label className="form-check-label" htmlFor="sendShopifyInvoice">
              Send Shopify invoice to customer&apos;s email
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddressStep;
