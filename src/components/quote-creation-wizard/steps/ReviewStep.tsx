'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useFormContext } from 'react-hook-form';
import axios from 'axios';
import { User, ShoppingCart, Settings, MapPin, Truck, Calculator } from 'lucide-react';
import { QuoteFormData } from '../types';

const ReviewStep = () => {
  const { watch } = useFormContext<QuoteFormData>();
  const formData = watch();
  
  const [priceSummary, setPriceSummary] = useState<{
    subtotal: number;
    shipping: number | null;
    total: number;
    currencyCode: string;
  }>({
    subtotal: 0,
    shipping: null,
    total: 0,
    currencyCode: 'USD'
  });

  const [isCalculatingShipping, setIsCalculatingShipping] = useState(false);
  const [shippingRates, setShippingRates] = useState<Array<{
    handle: string;
    title: string;
    price: number;
    currencyCode: string;
  }>>([]);
  const [selectedShippingRate, setSelectedShippingRate] = useState<number | null>(null);

  // Calculate subtotal whenever line items change
  useEffect(() => {
    const subtotal = formData.lineItems?.reduce((total, item) => {
      if (item.numericVariantIdShopify && item.unitPrice && item.quantity) {
        return total + (item.unitPrice * item.quantity);
      }
      return total;
    }, 0) || 0;

    setPriceSummary(prev => ({
      ...prev,
      subtotal,
      total: subtotal + (prev.shipping || 0)
    }));
  }, [formData.lineItems]);

  const calculateShipping = useCallback(async () => {
    if (isCalculatingShipping) return;
    
    setIsCalculatingShipping(true);
    try {
      const response = await axios.post('/api/shipping-rates/calculate', {
        lineItems: formData.lineItems?.filter(item => item.numericVariantIdShopify && item.quantity > 0),
        shippingAddress: formData.shippingAddress
      });

      const rates = response.data.rates || [];
      setShippingRates(rates);
      
      if (rates.length > 0) {
        setSelectedShippingRate(0); // Auto-select first rate
        setPriceSummary(prev => ({
          ...prev,
          shipping: rates[0].price,
          total: prev.subtotal + rates[0].price
        }));
      }
    } catch (error) {
      console.error('Shipping calculation failed:', error);
    } finally {
      setIsCalculatingShipping(false);
    }
  }, [formData.lineItems, formData.shippingAddress, isCalculatingShipping]);

  // Auto-calculate shipping when we have all required data
  useEffect(() => {
    const hasProducts = formData.lineItems?.some(item => item.numericVariantIdShopify && item.quantity > 0);
    const hasAddress = formData.shippingAddress?.address1 && 
                      formData.shippingAddress?.city && 
                      formData.shippingAddress?.zip && 
                      formData.shippingAddress?.province;

    if (hasProducts && hasAddress && formData.quoteType === 'material_and_delivery') {
      calculateShipping();
    }
  }, [formData.lineItems, formData.shippingAddress, formData.quoteType, calculateShipping]);

  const selectShippingRate = (index: number) => {
    setSelectedShippingRate(index);
    const rate = shippingRates[index];
    setPriceSummary(prev => ({
      ...prev,
      shipping: rate.price,
      total: prev.subtotal + rate.price
    }));
  };

  const validLineItems = formData.lineItems?.filter(item => item.numericVariantIdShopify) || [];

  return (
    <div>
      <h5 className="mb-4">Review Your Quote</h5>
      
      {/* Customer Information */}
      <div className="card mb-4">
        <div className="card-header bg-primary text-white">
          <h6 className="mb-0 d-flex align-items-center"><User className="w-4 h-4 me-2" />Customer Information</h6>
        </div>
        <div className="card-body">
          <div className="row">
            <div className="col-md-6">
              <p className="mb-1"><strong>Name:</strong> {formData.customer?.firstName} {formData.customer?.lastName}</p>
              <p className="mb-1"><strong>Email:</strong> {formData.customer?.email}</p>
              {formData.customer?.phone && <p className="mb-1"><strong>Phone:</strong> {formData.customer.phone}</p>}
              {formData.customer?.company && <p className="mb-0"><strong>Company:</strong> {formData.customer.company}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Products */}
      <div className="card mb-4">
        <div className="card-header bg-success text-white">
          <h6 className="mb-0 d-flex align-items-center"><ShoppingCart className="w-4 h-4 me-2" />Products ({validLineItems.length} item{validLineItems.length !== 1 ? 's' : ''})</h6>
        </div>
        <div className="card-body">
          {validLineItems.length > 0 ? (
            <div className="table-responsive">
              <table className="table table-sm" aria-label="Quote products">
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col" className="text-center">Qty</th>
                    <th scope="col" className="text-end">Unit Price</th>
                    <th scope="col" className="text-end">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {validLineItems.map((item, index) => (
                    <tr key={index}>
                      <td>
                        <div className="fw-medium">{item.productDisplay || 'Product'}</div>
                      </td>
                      <td className="text-center">{item.quantity}</td>
                      <td className="text-end">
                        {item.unitPrice ? `$${item.unitPrice.toFixed(2)}` : 'N/A'}
                      </td>
                      <td className="text-end fw-medium">
                        {item.unitPrice ? `$${(item.unitPrice * item.quantity).toFixed(2)}` : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted mb-0">No products selected</p>
          )}
        </div>
      </div>

      {/* Quote Type & Options */}
      <div className="card mb-4">
        <div className="card-header bg-info text-white">
          <h6 className="mb-0 d-flex align-items-center"><Settings className="w-4 h-4 me-2" />Quote Options</h6>
        </div>
        <div className="card-body">
          <div className="row">
            <div className="col-md-6">
              <p className="mb-1"><strong>Quote Type:</strong> 
                <span className={`badge ms-2 ${formData.quoteType === 'material_only' ? 'bg-warning' : 'bg-success'}`}>
                  {formData.quoteType === 'material_only' ? 'Material Only' : 'Material + Delivery'}
                </span>
              </p>
              {formData.deliveryTerms && <p className="mb-1"><strong>Delivery Terms:</strong> {formData.deliveryTerms}</p>}
              {formData.sendShopifyInvoice && <p className="mb-1"><span className="badge bg-primary">Will send Shopify invoice</span></p>}
            </div>
            <div className="col-md-6">
              {formData.note && (
                <div>
                  <strong>Notes:</strong>
                  <div className="bg-light p-2 rounded mt-1">
                    <small>{formData.note}</small>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Addresses */}
      <div className="card mb-4">
        <div className="card-header bg-secondary text-white">
          <h6 className="mb-0 d-flex align-items-center"><MapPin className="w-4 h-4 me-2" />Addresses</h6>
        </div>
        <div className="card-body">
          <div className="row">
            <div className="col-md-6">
              <h6 className="text-primary">Shipping Address</h6>
              {formData.shippingAddress ? (
                <address className="small">
                  {formData.shippingAddress.firstName} {formData.shippingAddress.lastName}<br/>
                  {formData.shippingAddress.company && <>{formData.shippingAddress.company}<br/></>}
                  {formData.shippingAddress.address1}<br/>
                  {formData.shippingAddress.address2 && <>{formData.shippingAddress.address2}<br/></>}
                  {formData.shippingAddress.city}, {formData.shippingAddress.province} {formData.shippingAddress.zip}<br/>
                  {formData.shippingAddress.country}
                  {formData.shippingAddress.phone && <><br/>📞 {formData.shippingAddress.phone}</>}
                </address>
              ) : (
                <p className="text-muted small">No shipping address provided</p>
              )}
            </div>
            <div className="col-md-6">
              <h6 className="text-primary">Billing Address</h6>
              {formData.useSameAddressForBilling ? (
                <p className="text-muted small"><em>Same as shipping address</em></p>
              ) : formData.billingAddress ? (
                <address className="small">
                  {formData.billingAddress.firstName} {formData.billingAddress.lastName}<br/>
                  {formData.billingAddress.company && <>{formData.billingAddress.company}<br/></>}
                  {formData.billingAddress.address1}<br/>
                  {formData.billingAddress.address2 && <>{formData.billingAddress.address2}<br/></>}
                  {formData.billingAddress.city}, {formData.billingAddress.province} {formData.billingAddress.zip}<br/>
                  {formData.billingAddress.country}
                  {formData.billingAddress.phone && <><br/>📞 {formData.billingAddress.phone}</>}
                </address>
              ) : (
                <p className="text-muted small">No billing address provided</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Shipping Options (for material_and_delivery) */}
      {formData.quoteType === 'material_and_delivery' && (
        <div className="card mb-4">
          <div className="card-header bg-warning text-dark">
            <h6 className="mb-0 d-flex align-items-center"><Truck className="w-4 h-4 me-2" />Shipping Options</h6>
          </div>
          <div className="card-body">
            {isCalculatingShipping ? (
              <div className="text-center py-3">
                <div className="spinner-border spinner-border-sm text-primary me-2"></div>
                Calculating shipping rates...
              </div>
            ) : shippingRates.length > 0 ? (
              <div className="row g-2">
                {shippingRates.map((rate, index) => (
                  <div key={index} className="col-md-6">
                    <div 
                      className={`card cursor-pointer ${selectedShippingRate === index ? 'border-primary bg-primary bg-opacity-10' : ''}`}
                      onClick={() => selectShippingRate(index)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="card-body p-3">
                        <div className="d-flex justify-content-between align-items-center">
                          <div>
                            <h6 className="mb-0">{rate.title}</h6>
                            <small className="text-muted">Shipping method</small>
                          </div>
                          <div className="text-end">
                            <div className="fw-bold">${rate.price.toFixed(2)}</div>
                            {selectedShippingRate === index && (
                              <small className="text-primary">✓ Selected</small>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-3">
                <button 
                  type="button" 
                  className="btn btn-outline-primary"
                  onClick={calculateShipping}
                  disabled={!formData.shippingAddress?.address1}
                >
                  <Calculator className="w-4 h-4 me-2" />Calculate Shipping
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Price Summary */}
      <div className="card border-success">
        <div className="card-header bg-success text-white">
          <h6 className="mb-0 d-flex align-items-center"><Calculator className="w-4 h-4 me-2" />Price Summary</h6>
        </div>
        <div className="card-body">
          <div className="row">
            <div className="col-md-6 offset-md-6">
              <table className="table table-borderless mb-0" aria-label="Price summary">
                <tbody>
                  <tr>
                    <th scope="row" className="fw-normal">Subtotal:</th>
                    <td className="text-end fw-medium">${priceSummary.subtotal.toFixed(2)}</td>
                  </tr>
                  {formData.quoteType === 'material_and_delivery' && (
                    <tr>
                      <th scope="row" className="fw-normal">
                        Shipping:
                        {selectedShippingRate !== null && shippingRates[selectedShippingRate] && (
                          <small className="text-muted d-block">{shippingRates[selectedShippingRate].title}</small>
                        )}
                      </th>
                      <td className="text-end fw-medium">
                        {priceSummary.shipping !== null ? (
                          `$${priceSummary.shipping.toFixed(2)}`
                        ) : (
                          <span className="text-muted">Calculate above</span>
                        )}
                      </td>
                    </tr>
                  )}
                  <tr className="border-top border-2 border-success">
                    <th scope="row" className="fw-bold h6 mb-0">Total:</th>
                    <td className="text-end fw-bold h6 mb-0 text-success">
                      ${priceSummary.total.toFixed(2)} {priceSummary.currencyCode}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReviewStep;
