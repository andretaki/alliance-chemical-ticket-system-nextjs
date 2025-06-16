'use client';

import React from 'react';

interface ShippingInfoSidebarProps {
  extractedStatus: string | null;
  extractedCarrier: string | null;
  extractedTracking: string | null;
  extractedShipDate: string | null;
  extractedOrderDate: string | null;
}

export default function ShippingInfoSidebar({
  extractedStatus,
  extractedCarrier,
  extractedTracking,
  extractedShipDate,
  extractedOrderDate
}: ShippingInfoSidebarProps) {
  if (!extractedStatus) {
    return null;
  }

  return (
    <div className="shipping-info-sidebar card shadow-sm mb-4">
      <div className="card-header bg-light d-flex align-items-center">
        <i className="fas fa-truck me-2 text-primary"></i>
        <h3 className="h6 mb-0">Shipping Information</h3>
      </div>
      <div className="card-body p-0">
        <ul className="list-group list-group-flush">
          {/* Status */}
          <li className="list-group-item d-flex justify-content-between align-items-center py-2">
            <span className="text-muted">Status</span>
            <span className="text-capitalize">
              {extractedStatus.replace('_', ' ')}
            </span>
          </li>
          
          {/* Order Date */}
          {extractedOrderDate && (
            <li className="list-group-item d-flex justify-content-between align-items-center py-2">
              <span className="text-muted">Order Date</span>
              <span>{extractedOrderDate}</span>
            </li>
          )}
          
          {/* Ship Date */}
          {extractedShipDate && (
            <li className="list-group-item d-flex justify-content-between align-items-center py-2">
              <span className="text-muted">Ship Date</span>
              <span>{extractedShipDate}</span>
            </li>
          )}
          
          {/* Carrier */}
          {extractedCarrier && (
            <li className="list-group-item d-flex justify-content-between align-items-center py-2">
              <span className="text-muted">Carrier</span>
              <span>{extractedCarrier}</span>
            </li>
          )}
          
          {/* Tracking */}
          {extractedTracking && (
            <li className="list-group-item d-flex justify-content-between align-items-center py-2">
              <span className="text-muted">Tracking</span>
              <span className="text-break text-end">{extractedTracking}</span>
            </li>
          )}
        </ul>
      </div>
      
      {/* Add tracking links based on carrier */}
      {extractedCarrier && extractedTracking && (
        <div className="card-footer bg-light py-2 px-3">
          <a 
            href={getTrackingUrl(extractedCarrier, extractedTracking)} 
            target="_blank" 
            rel="noopener noreferrer"
            className="btn btn-sm btn-outline-primary d-flex align-items-center justify-content-center"
          >
            <i className="fas fa-external-link-alt me-1"></i> Track Package
          </a>
        </div>
      )}
    </div>
  );
}

// Helper function to generate tracking URLs based on carrier
function getTrackingUrl(carrier: string, trackingNumber: string): string {
  const carrierLower = carrier.toLowerCase();
  
  if (carrierLower.includes('usps')) {
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`;
  } else if (carrierLower.includes('ups')) {
    return `https://www.ups.com/track?tracknum=${trackingNumber}`;
  } else if (carrierLower.includes('fedex')) {
    return `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`;
  } else if (carrierLower.includes('dhl')) {
    return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${trackingNumber}`;
  } else {
    // Default to a search
    return `https://www.google.com/search?q=${encodeURIComponent(`${carrier} tracking ${trackingNumber}`)}`;
  }
} 