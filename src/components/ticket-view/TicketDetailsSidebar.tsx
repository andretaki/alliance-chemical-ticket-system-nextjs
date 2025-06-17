'use client';

import React from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { RagSearchInterface } from '@/components/RagSearchInterface';
import CustomerOrderHistory from './CustomerOrderHistory';
import type { ShopifyDraftOrderGQLResponse } from '@/agents/quoteAssistant/quoteInterfaces';
import type { Ticket, TicketUser } from '@/types/ticket';

interface TicketDetailsSidebarProps {
  ticket: Ticket;
  relatedQuote?: ShopifyDraftOrderGQLResponse | null;
  quoteAdminUrl?: string | null;
}

// Helper function to get priority class
const getPriorityClass = (priority: string): string => {
  switch (priority?.toLowerCase()) {
    case 'high':
    case 'urgent':
      return 'badge bg-danger';
    case 'medium': return 'badge bg-warning text-dark';
    case 'low': return 'badge bg-info text-dark';
    default: return 'badge bg-secondary';
  }
};

// Helper function to parse dates
const parseDate = (dateString: string | null): Date | null => {
  if (!dateString) return null;
  try {
    return new Date(dateString);
  } catch {
    return null;
  }
};

export default function TicketDetailsSidebar({ ticket, relatedQuote, quoteAdminUrl }: TicketDetailsSidebarProps) {
  const createdAtDate = parseDate(ticket.createdAt);
  const updatedAtDate = parseDate(ticket.updatedAt);

  return (
    <div className="ticket-details-sidebar">
      {/* Ticket Details Card */}
      <div className="card shadow-sm mb-4">
        <div className="card-header bg-light">
          <h6 className="mb-0">Ticket Details</h6>
        </div>
        <ul className="list-group list-group-flush">
          <li className="list-group-item d-flex justify-content-between align-items-center">
            <span className="text-muted">Priority</span>
            <span className={getPriorityClass(ticket.priority)}>{ticket.priority?.toUpperCase() || 'NONE'}</span>
          </li>
          {ticket.type && (
            <li className="list-group-item d-flex justify-content-between align-items-center">
              <span className="text-muted">Type</span>
              <span>{ticket.type}</span>
            </li>
          )}
          <li className="list-group-item d-flex justify-content-between align-items-center">
            <span className="text-muted">Created</span>
            <span className="text-end small" title={createdAtDate ? format(createdAtDate, 'PPpp') : 'Unknown'}>
              {createdAtDate ? formatDistanceToNow(createdAtDate, { addSuffix: true }) : 'N/A'}
            </span>
          </li>
          <li className="list-group-item d-flex justify-content-between align-items-center">
            <span className="text-muted">Updated</span>
            <span className="text-end small" title={updatedAtDate ? format(updatedAtDate, 'PPpp') : 'Unknown'}>
              {updatedAtDate ? formatDistanceToNow(updatedAtDate, { addSuffix: true }) : 'N/A'}
            </span>
          </li>
        </ul>
      </div>
      
      {/* Customer Information Card */}
      <div className="card shadow-sm mb-4">
        <div className="card-header bg-light">
          <h6 className="mb-0">Customer Information</h6>
        </div>
        <div className="card-body">
          <p className="mb-1">
            <i className="fas fa-user-circle fa-fw me-2 text-muted"></i>
            {ticket.senderName || ticket.reporter?.name || 'N/A'}
          </p>
          {(ticket.senderEmail || ticket.reporter?.email) && (
            <p className="mb-1 small">
              <i className="fas fa-envelope fa-fw me-2 text-muted"></i>
              <a href={`mailto:${ticket.senderEmail || ticket.reporter?.email}`} className="text-primary">
                {ticket.senderEmail || ticket.reporter?.email}
              </a>
            </p>
          )}
          {ticket.senderPhone && (
            <p className="mb-1 small">
              <i className="fas fa-phone fa-fw me-2 text-muted"></i>
              {ticket.senderPhone}
            </p>
          )}
          {(ticket.orderNumber || ticket.trackingNumber) && <hr className="my-2" />}
          {ticket.orderNumber && (
            <p className="mb-1">
              <i className="fas fa-shopping-cart fa-fw me-2 text-muted"></i>
              <strong>Order:</strong> {ticket.orderNumber}
            </p>
          )}
          {ticket.trackingNumber && (
            <p className="mb-0">
              <i className="fas fa-truck fa-fw me-2 text-muted"></i>
              <strong>Tracking:</strong> {ticket.trackingNumber}
            </p>
          )}
        </div>
      </div>

      {/* Related Quote Card */}
      {relatedQuote && (
        <div className="card shadow-sm mb-4">
          <div className="card-header bg-light">
            <h6 className="mb-0">
              <i className="fas fa-file-invoice-dollar me-2 text-success"></i>
              Related Quote
            </h6>
          </div>
          <div className="card-body">
            <p className="mb-1">
              <strong>Quote:</strong> {relatedQuote.name || 'Draft Order'}
            </p>
            <p className="mb-1 small">
              <strong>Total:</strong> ${relatedQuote.subtotalPriceSet?.shopMoney?.amount || '0.00'}
            </p>
            <p className="mb-1 small">
              <strong>Items:</strong> {relatedQuote.lineItems?.edges?.length || 0}
            </p>
            {quoteAdminUrl && (
              <a href={quoteAdminUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-success">
                <i className="fas fa-external-link-alt me-1"></i>
                View in Shopify
              </a>
            )}
          </div>
        </div>
      )}

      {/* Customer Order History */}
      <CustomerOrderHistory
        customerEmail={ticket.senderEmail || ticket.reporter?.email || undefined}
        className="mb-4"
      />
      
      {/* AI Knowledge Search */}
      <div className="card shadow-sm">
        <div className="card-header bg-light">
          <h6 className="mb-0">
            <i className="fas fa-brain me-2 text-info"></i>
            AI Knowledge Search
          </h6>
        </div>
        <div className="card-body p-2">
          <RagSearchInterface
            customerEmail={ticket.senderEmail || ticket.reporter?.email || undefined}
            orderNumber={ticket.orderNumber}
          />
        </div>
      </div>
    </div>
  );
} 