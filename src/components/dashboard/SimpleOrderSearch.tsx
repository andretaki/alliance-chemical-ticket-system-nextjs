'use client';

import React, { useState, FormEvent, ChangeEvent } from 'react';
import axios from 'axios';
import Link from 'next/link';
import { OrderSearchResult } from '@/types/orderSearch';

export default function SimpleOrderSearch() {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<OrderSearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSearch = async (e?: FormEvent<HTMLFormElement>) => {
        if (e) e.preventDefault();
        if (!searchQuery.trim() || searchQuery.trim().length < 3) {
            setError("Please enter at least 3 characters to search.");
            setSearchResults([]);
            return;
        }
        setIsLoading(true);
        setError(null);
        setSearchResults([]);

        try {
            const response = await axios.get('/api/orders/search', {
                params: { query: searchQuery.trim() }
            });
            setSearchResults(response.data.orders || []);
            if (response.data.orders.length === 0) {
                console.log(`[OrderSearch] No orders found. Search method: ${response.data.searchMethod}, Search type: ${response.data.searchType}`);
                setError(`No orders found for "${searchQuery}". Search method: ${response.data.searchMethod}. Try checking if the order number exists in Shopify, or try searching by customer email/name instead.`);
            } else {
                console.log(`[OrderSearch] Found ${response.data.orders.length} orders using ${response.data.searchMethod}`);
                // Debug tracking data for each order
                response.data.orders.forEach((order: OrderSearchResult, index: number) => {
                    console.log(`[OrderSearch] Order ${index + 1} (${order.shopifyOrderName}):`, {
                        shipStationStatus: order.shipStationStatus,
                        trackingNumbers: order.trackingNumbers,
                        shipStationUrl: order.shipStationUrl
                    });
                });
            }
        } catch (err: any) {
            console.error("Order search error:", err);
            setError(err.response?.data?.error || "Failed to search orders.");
            setSearchResults([]);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value);
        // Optional: Clear results or error on new input
        if (searchResults.length > 0) setSearchResults([]);
        if (error) setError(null);
    };

    const getFinancialStatusBadgeClass = (status?: string) => {
        if (!status) return 'bg-secondary';
        switch (status.toLowerCase()) {
            case 'paid': return 'bg-success';
            case 'pending': return 'bg-warning';
            case 'refunded': return 'bg-info';
            case 'voided': return 'bg-danger';
            default: return 'bg-secondary';
        }
    };

    const getFulfillmentStatusBadgeClass = (status?: string) => {
        if (!status) return 'bg-secondary';
        switch (status.toLowerCase()) {
            case 'fulfilled': return 'bg-primary';
            case 'unfulfilled': return 'bg-warning';
            case 'partial': return 'bg-info';
            case 'restocked': return 'bg-secondary';
            default: return 'bg-secondary';
        }
    };

    const getShipStationStatusBadgeClass = (status?: string) => {
        if (!status) return 'bg-secondary';
        switch (status.toLowerCase()) {
            case 'awaiting_payment': return 'bg-warning';
            case 'awaiting_shipment': return 'bg-info';
            case 'shipped': return 'bg-success';
            case 'on_hold': return 'bg-warning';
            case 'cancelled': return 'bg-danger';
            default: return 'bg-secondary';
        }
    };

    const formatCurrency = (amount?: string, currencyCode?: string) => {
        if (!amount) return 'N/A';
        const numAmount = parseFloat(amount);
        const currency = currencyCode || 'USD';
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency
        }).format(numAmount);
    };

    return (
        <div className="card shadow-sm mb-4">
            <div className="card-header bg-light">
                <h5 className="mb-0"><i className="fas fa-search me-2 text-primary"></i>Quick Order Search</h5>
            </div>
            <div className="card-body">
                <form onSubmit={handleSearch}>
                    <div className="input-group mb-3">
                        <input
                            type="text"
                            className="form-control form-control-lg"
                            placeholder="Enter Order #, Customer Email, or Name..."
                            value={searchQuery}
                            onChange={handleInputChange}
                            aria-label="Order search query"
                        />
                        <button className="btn btn-primary px-4" type="submit" disabled={isLoading}>
                            {isLoading ? (
                                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                            ) : (
                                <i className="fas fa-search"></i>
                            )}
                        </button>
                    </div>
                </form>

                {error && <div className="alert alert-warning py-2 small">{error}</div>}

                {searchResults.length > 0 && (
                    <div className="list-group mt-3">
                        {searchResults.map(order => (
                            <div key={order.shopifyOrderGID} className="list-group-item list-group-item-action flex-column align-items-start mb-2 p-3 border rounded shadow-sm">
                                <div className="d-flex w-100 justify-content-between">
                                    <h6 className="mb-1">
                                        <a href={order.shopifyAdminUrl} target="_blank" rel="noopener noreferrer" className="text-primary fw-bold text-decoration-none">
                                            Order {order.shopifyOrderName} <i className="fas fa-external-link-alt fa-xs ms-1"></i>
                                        </a>
                                    </h6>
                                    <small className="text-muted">{new Date(order.createdAt).toLocaleDateString()}</small>
                                </div>
                                <p className="mb-1 small">
                                    <strong>Customer:</strong> {order.customerFullName || 'N/A'} 
                                    {order.customerEmail && (
                                        <span className="text-muted"> ({order.customerEmail})</span>
                                    )}
                                </p>
                                <div className="mb-1">
                                    <span className="small me-2"><strong>Status:</strong></span>
                                    <span className={`badge ${getFinancialStatusBadgeClass(order.financialStatus)} me-1`}>
                                        {order.financialStatus || 'Unknown'}
                                    </span>
                                    <span className={`badge ${getFulfillmentStatusBadgeClass(order.fulfillmentStatus)}`}>
                                        {order.fulfillmentStatus || 'Unknown'}
                                    </span>
                                </div>
                                <p className="mb-1 small">
                                    <strong>Total:</strong> {formatCurrency(order.totalPrice, order.currencyCode)}
                                </p>
                                {order.itemSummary && (
                                    <p className="mb-1 small text-muted">
                                        <strong>Items:</strong> {order.itemSummary}
                                    </p>
                                )}
                                
                                {/* Shipping/Tracking Information */}
                                {(order.shipStationStatus || order.trackingNumbers?.length) && (
                                    <div className="mb-2 p-2 bg-light rounded border-start border-primary border-3">
                                        {order.shipStationStatus && (
                                            <p className="mb-1 small">
                                                <strong>ShipStation Status:</strong> 
                                                <span className={`ms-1 badge ${getShipStationStatusBadgeClass(order.shipStationStatus)}`}>
                                                    {order.shipStationStatus.replace('_', ' ').toUpperCase()}
                                                </span>
                                            </p>
                                        )}
                                        {order.trackingNumbers && order.trackingNumbers.length > 0 ? (
                                            <p className="mb-0 small">
                                                <strong>Tracking:</strong> 
                                                <span className="text-primary fw-bold ms-1">
                                                    {order.trackingNumbers.join(', ')}
                                                </span>
                                            </p>
                                        ) : order.shipStationStatus === 'shipped' ? (
                                            <p className="mb-0 small text-warning">
                                                <strong>Tracking:</strong> 
                                                <span className="ms-1">
                                                    <i className="fas fa-exclamation-triangle me-1"></i>
                                                    Order marked as shipped but no tracking found. Check ShipStation manually.
                                                </span>
                                            </p>
                                        ) : null}
                                    </div>
                                )}
                                
                                <div className="mt-2 d-flex gap-2 flex-wrap">
                                    {order.relatedTicketId && order.relatedTicketUrl && (
                                        <Link href={order.relatedTicketUrl} className="btn btn-sm btn-outline-secondary">
                                            <i className="fas fa-ticket-alt me-1"></i> View Ticket #{order.relatedTicketId}
                                        </Link>
                                    )}
                                    
                                    {order.shipStationUrl && (
                                        <a 
                                            href={order.shipStationUrl} 
                                            target="_blank" 
                                            rel="noopener noreferrer" 
                                            className="btn btn-sm btn-outline-primary"
                                        >
                                            <i className="fas fa-shipping-fast me-1"></i> View in ShipStation <i className="fas fa-external-link-alt fa-xs ms-1"></i>
                                        </a>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
} 