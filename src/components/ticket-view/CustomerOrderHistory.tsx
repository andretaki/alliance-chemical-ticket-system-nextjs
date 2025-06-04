import React, { useState, useEffect, useCallback } from 'react';
import { format, formatDistanceToNow } from 'date-fns';

interface OrderHistoryItem {
  shopifyOrderGID: string;
  shopifyOrderName: string;
  legacyResourceId: string;
  customerFullName?: string;
  customerEmail?: string;
  createdAt: string;
  financialStatus?: string;
  fulfillmentStatus?: string;
  totalPrice?: string;
  currencyCode?: string;
  shopifyAdminUrl: string;
  itemSummary?: string;
  shipStationOrderId?: number;
  shipStationUrl?: string;
  shipStationStatus?: string;
  trackingNumbers?: string[];
}

interface CustomerOrderHistoryProps {
  customerEmail?: string;
  className?: string;
}

export default function CustomerOrderHistory({ customerEmail, className = '' }: CustomerOrderHistoryProps) {
  const [orders, setOrders] = useState<OrderHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const fetchOrderHistory = useCallback(async () => {
    if (!customerEmail) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/orders/search?query=${encodeURIComponent(customerEmail)}&searchType=email`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch order history');
      }
      
      setOrders(data.orders || []);
    } catch (err) {
      console.error('Error fetching customer order history:', err);
      setError(err instanceof Error ? err.message : 'Failed to load order history');
    } finally {
      setIsLoading(false);
    }
  }, [customerEmail]);

  useEffect(() => {
    if (customerEmail && isExpanded) {
      fetchOrderHistory();
    }
  }, [customerEmail, isExpanded, fetchOrderHistory]);

  const getStatusBadgeClass = (status?: string) => {
    if (!status) return 'bg-secondary';
    
    switch (status.toLowerCase()) {
      case 'shipped':
        return 'bg-success';
      case 'awaiting_shipment':
        return 'bg-warning';
      case 'cancelled':
        return 'bg-danger';
      case 'on_hold':
        return 'bg-secondary';
      default:
        return 'bg-info';
    }
  };

  const getFinancialStatusBadgeClass = (status?: string) => {
    if (!status) return 'bg-secondary';
    
    switch (status.toLowerCase()) {
      case 'paid':
        return 'bg-success';
      case 'pending':
        return 'bg-warning';
      case 'refunded':
        return 'bg-danger';
      default:
        return 'bg-secondary';
    }
  };

  if (!customerEmail) {
    return null;
  }

  return (
    <div className={`card shadow-sm mb-4 ${className}`}>
      <div className="card-header bg-light d-flex justify-content-between align-items-center">
        <h6 className="mb-0 d-flex align-items-center">
          <i className="fas fa-history me-2 text-secondary"></i>
          Order History
        </h6>
        <button
          className="btn btn-sm btn-outline-secondary"
          onClick={() => setIsExpanded(!isExpanded)}
          disabled={isLoading}
        >
          {isLoading ? (
            <i className="fas fa-spinner fa-spin"></i>
          ) : (
            <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'}`}></i>
          )}
        </button>
      </div>
      
      {isExpanded && (
        <div className="card-body p-0">
          {isLoading && (
            <div className="text-center py-3">
              <div className="spinner-border spinner-border-sm text-primary me-2" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              Loading order history...
            </div>
          )}
          
          {error && (
            <div className="alert alert-warning m-3 py-2 mb-0">
              <i className="fas fa-exclamation-triangle me-2"></i>
              <small>{error}</small>
            </div>
          )}
          
          {!isLoading && !error && orders.length === 0 && (
            <div className="text-center py-3 text-muted">
              <i className="fas fa-inbox fa-2x mb-2 d-block text-muted opacity-50"></i>
              <small>No order history found for this customer</small>
            </div>
          )}
          
          {!isLoading && orders.length > 0 && (
            <div className="list-group list-group-flush">
              {orders.slice(0, 5).map((order) => (
                <div key={order.shopifyOrderGID} className="list-group-item p-3">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <div>
                      <h6 className="mb-1">
                        {order.shipStationUrl ? (
                          <a 
                            href={order.shipStationUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-primary text-decoration-none fw-bold"
                            title="View in ShipStation"
                          >
                            <i className="fas fa-ship me-1"></i>
                            {order.shopifyOrderName}
                            <i className="fas fa-external-link-alt fa-xs ms-1"></i>
                          </a>
                        ) : (
                          <span className="fw-bold text-muted">
                            <i className="fas fa-ship me-1"></i>
                            {order.shopifyOrderName}
                          </span>
                        )}
                        {order.shopifyAdminUrl && (
                          <a 
                            href={order.shopifyAdminUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="btn btn-sm btn-outline-secondary ms-2"
                            title="View in Shopify Admin"
                          >
                            <i className="fab fa-shopify fa-xs"></i>
                          </a>
                        )}
                      </h6>
                      <small className="text-muted">
                        {format(new Date(order.createdAt), 'MMM d, yyyy')} • 
                        {formatDistanceToNow(new Date(order.createdAt), { addSuffix: true })}
                      </small>
                    </div>
                    <div className="text-end">
                      {order.totalPrice && (
                        <div className="fw-bold">
                          ${parseFloat(order.totalPrice).toFixed(2)} {order.currencyCode}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="d-flex flex-wrap gap-1 mb-2">
                    {order.financialStatus && (
                      <span className={`badge ${getFinancialStatusBadgeClass(order.financialStatus)} text-uppercase`}>
                        {order.financialStatus}
                      </span>
                    )}
                    {order.shipStationStatus && (
                      <span className={`badge ${getStatusBadgeClass(order.shipStationStatus)} text-uppercase`}>
                        {order.shipStationStatus.replace('_', ' ')}
                      </span>
                    )}
                    {order.fulfillmentStatus && (
                      <span className={`badge ${order.fulfillmentStatus.toLowerCase() === 'fulfilled' ? 'bg-success' : 'bg-warning'} text-uppercase`}>
                        {order.fulfillmentStatus}
                      </span>
                    )}
                  </div>
                  
                  {order.itemSummary && (
                    <div className="small text-muted mb-2">
                      <i className="fas fa-shopping-cart me-1"></i>
                      {order.itemSummary}
                    </div>
                  )}
                  
                  {order.trackingNumbers && order.trackingNumbers.length > 0 && (
                    <div className="small">
                      <i className="fas fa-truck me-1 text-secondary"></i>
                      <strong>Tracking:</strong>
                      <div className="mt-1">
                        {order.trackingNumbers.map((trackingNumber, index) => (
                          <span key={index} className="badge bg-light text-dark border me-1 font-monospace">
                            {trackingNumber}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              
              {orders.length > 5 && (
                <div className="list-group-item text-center py-2">
                  <small className="text-muted">
                    Showing 5 of {orders.length} orders
                  </small>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
} 