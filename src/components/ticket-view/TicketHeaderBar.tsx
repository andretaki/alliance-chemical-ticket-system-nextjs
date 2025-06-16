'use client';

import React from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ticketStatusEnum } from '@/db/schema';

// Type definitions
type BaseUser = {
  id: string;
  name: string | null;
  email: string | null;
};

interface TicketData {
  id: number;
  title: string;
  status: string;
  assignee: BaseUser | null;
  createdAt: string;
  lastCommenterIsCustomer?: boolean;
}

interface TicketHeaderBarProps {
  ticket: TicketData;
  users: BaseUser[];
  isUpdatingAssignee: boolean;
  isUpdatingStatus: boolean;
  handleAssigneeChange: (e: React.ChangeEvent<HTMLSelectElement>) => Promise<void>;
  handleStatusSelectChange: (e: React.ChangeEvent<HTMLSelectElement>) => Promise<void>;
  showAiSuggestionIndicator?: boolean;
  onReopenTicket: () => Promise<void>;
  copyTicketLink?: () => void;
  orderNumberForStatus?: string | null;
  onGetOrderStatusDraft: () => void;
  isLoadingOrderStatusDraft: boolean;
  onResendInvoice?: () => void;
  isResendingInvoice?: boolean;
  hasInvoiceInfo?: boolean;
  onMergeClick: () => void;
}

const getStatusConfig = (status: string | null) => {
  switch (status?.toLowerCase()) {
    case 'new':
      return { 
        class: 'bg-info bg-opacity-10 text-info border border-info border-opacity-25', 
        icon: 'fas fa-star',
        label: 'New'
      };
    case 'open':
      return { 
        class: 'bg-success bg-opacity-10 text-success border border-success border-opacity-25', 
        icon: 'fas fa-folder-open',
        label: 'Open'
      };
    case 'in_progress':
      return { 
        class: 'bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25', 
        icon: 'fas fa-cog fa-spin',
        label: 'In Progress'
      };
    case 'pending_customer':
      return { 
        class: 'bg-warning bg-opacity-10 text-warning border border-warning border-opacity-25', 
        icon: 'fas fa-clock',
        label: 'Pending Customer'
      };
    case 'closed':
      return { 
        class: 'bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-25', 
        icon: 'fas fa-check-circle',
        label: 'Closed'
      };
    default:
      return { 
        class: 'bg-light text-dark border', 
        icon: 'fas fa-question-circle',
        label: status || 'Unknown'
      };
  }
};

// Get action indicator with enhanced styling
const getActionIndicator = (status: string, lastCommenterIsCustomer?: boolean) => {
  if (status === 'pending_customer') {
    return (
      <span className="action-badge badge bg-warning bg-opacity-10 text-warning border border-warning border-opacity-25">
        <i className="fas fa-user-clock me-1"></i>
        Awaiting Customer
      </span>
    );
  }
  
  if ((status === 'open' || status === 'in_progress') && lastCommenterIsCustomer) {
    return (
      <span className="action-badge badge bg-info bg-opacity-10 text-info border border-info border-opacity-25">
        <i className="fas fa-user-tie me-1"></i>
        Needs Reply
      </span>
    );
  }
  
  return null;
};

export default function TicketHeaderBar({
  ticket,
  users,
  isUpdatingAssignee,
  isUpdatingStatus,
  handleAssigneeChange,
  handleStatusSelectChange,
  showAiSuggestionIndicator,
  onReopenTicket,
  copyTicketLink,
  orderNumberForStatus,
  onGetOrderStatusDraft,
  isLoadingOrderStatusDraft,
  onResendInvoice,
  isResendingInvoice,
  hasInvoiceInfo,
  onMergeClick,
}: TicketHeaderBarProps) {
  const statusConfig = getStatusConfig(ticket.status);
  
  const handleCopyLink = () => {
    if (copyTicketLink) {
      copyTicketLink();
    } else {
      const url = `${window.location.origin}/tickets/${ticket.id}`;
      navigator.clipboard.writeText(url)
        .then(() => {
          // Could add toast notification here
          console.log('Link copied');
        })
        .catch(err => {
          console.error('Failed to copy: ', err);
        });
    }
  };

  return (
    <div className="ticket-header-wrapper sticky-top shadow-sm">
      <div className="ticket-header-bar bg-white border-bottom">
        <div className="container-fluid py-3">
          {/* Main Header Content */}
          <div className="row align-items-center g-3">
            {/* Title Section */}
            <div className="col-lg-7">
              <div className="ticket-title-section">
                <div className="d-flex align-items-start gap-3">
                  {/* Ticket Icon */}
                  <div className="ticket-icon-wrapper">
                    <div className="ticket-icon bg-primary bg-opacity-10 rounded-circle d-flex align-items-center justify-content-center">
                      <i className="fas fa-ticket-alt text-primary"></i>
                    </div>
                  </div>
                  
                  {/* Title and Status */}
                  <div className="ticket-title-content flex-grow-1 min-w-0">
                    <div className="d-flex align-items-center flex-wrap gap-2 mb-1">
                      <h1 className="ticket-title h5 mb-0 text-dark fw-bold">
                        <span className="ticket-id text-muted me-2">#{ticket.id}</span>
                        <span className="title-text">{ticket.title}</span>
                      </h1>
                    </div>
                    
                    {/* Status and Action Indicators */}
                    <div className="ticket-indicators d-flex align-items-center flex-wrap gap-2">
                      <span className={`status-badge badge ${statusConfig.class}`}>
                        <i className={`${statusConfig.icon} me-1`}></i>
                        {statusConfig.label}
                      </span>
                      
                      {showAiSuggestionIndicator && (
                        <span className="ai-indicator badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25">
                          <i className="fas fa-robot me-1"></i>
                          AI Suggestion Available
                        </span>
                      )}
                      
                      {getActionIndicator(ticket.status, ticket.lastCommenterIsCustomer)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Controls Section */}
            <div className="col-lg-5">
              <div className="ticket-controls d-flex align-items-center justify-content-lg-end gap-2 flex-wrap">
                {/* Status Control */}
                <div className="control-group d-flex align-items-center">
                  <label htmlFor="statusSelect" className="control-label text-muted small fw-medium me-2">
                    Status:
                  </label>
                  <div className="select-wrapper position-relative">
                    <select 
                      id="statusSelect" 
                      className="form-select form-select-sm border-0 bg-light" 
                      value={ticket.status} 
                      onChange={handleStatusSelectChange} 
                      disabled={isUpdatingStatus}
                      style={{ minWidth: '130px' }}
                    >
                      {ticketStatusEnum.enumValues.map(s => (
                        <option key={s} value={s}>
                          {s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </option>
                      ))}
                    </select>
                    {isUpdatingStatus && (
                      <div className="position-absolute top-50 end-0 translate-middle-y me-2">
                        <div className="spinner-border spinner-border-sm text-primary"></div>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Assignee Control */}
                <div className="control-group d-flex align-items-center">
                  <label htmlFor="assigneeSelect" className="control-label text-muted small fw-medium me-2">
                    Assignee:
                  </label>
                  <div className="select-wrapper position-relative">
                    <select 
                      id="assigneeSelect" 
                      className="form-select form-select-sm border-0 bg-light" 
                      value={ticket.assignee?.id || ''} 
                      onChange={handleAssigneeChange} 
                      disabled={isUpdatingAssignee}
                      style={{ minWidth: '130px' }}
                    >
                      <option value="">Unassigned</option>
                      {users.map(user => (
                        <option key={user.id} value={user.id}>
                          {user.name || user.email}
                        </option>
                      ))}
                    </select>
                    {isUpdatingAssignee && (
                      <div className="position-absolute top-50 end-0 translate-middle-y me-2">
                        <div className="spinner-border spinner-border-sm text-primary"></div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="action-bar bg-light border-bottom">
        <div className="container-fluid py-2">
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
            {/* Left Actions */}
            <div className="action-group d-flex align-items-center gap-2 flex-wrap">
              {/* Order Status Button */}
              {orderNumberForStatus && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-info border-0 bg-info bg-opacity-10 text-info"
                  onClick={onGetOrderStatusDraft}
                  disabled={isLoadingOrderStatusDraft}
                >
                  {isLoadingOrderStatusDraft ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-1"></span>
                      Fetching Status...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-truck me-1"></i>
                      Get Order Status
                    </>
                  )}
                </button>
              )}

              {/* Resend Invoice Button */}
              {hasInvoiceInfo && onResendInvoice && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-warning border-0 bg-warning bg-opacity-10 text-warning"
                  onClick={onResendInvoice}
                  disabled={isResendingInvoice}
                >
                  {isResendingInvoice ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-1"></span>
                      Sending...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-envelope me-1"></i>
                      Resend Invoice
                    </>
                  )}
                </button>
              )}

              {/* Reopen Button */}
              {ticket.status === 'closed' && (
                <button 
                  onClick={onReopenTicket} 
                  className="btn btn-sm btn-warning border-0 bg-warning bg-opacity-10 text-warning"
                >
                  <i className="fas fa-folder-open me-1"></i>
                  Reopen Ticket
                </button>
              )}
            </div>

            {/* Right Actions */}
            <div className="action-group d-flex align-items-center gap-2 flex-wrap">
              <button
                className="btn btn-sm btn-outline-secondary border-0 bg-secondary bg-opacity-10 text-secondary"
                onClick={onMergeClick}
                title="Merge other tickets into this one"
              >
                <i className="fas fa-code-branch me-1"></i>
                Merge
              </button>
              <Link 
                href={`/tickets/${ticket.id}/create-quote`} 
                className="btn btn-sm btn-success border-0 bg-success bg-opacity-10 text-success"
              >
                <i className="fas fa-file-invoice-dollar me-1"></i>
                Create Quote
              </Link>

              <button 
                className="btn btn-sm btn-outline-secondary border-0 bg-secondary bg-opacity-10 text-secondary" 
                onClick={handleCopyLink}
                title="Copy ticket link"
              >
                <i className="fas fa-link me-1"></i>
                Copy Link
              </button>

              <Link 
                href={`/tickets/${ticket.id}/edit`} 
                className="btn btn-sm btn-outline-secondary border-0 bg-secondary bg-opacity-10 text-secondary"
              >
                <i className="fas fa-edit me-1"></i>
                Edit
              </Link>
              
              <Link 
                href="/tickets" 
                className="btn btn-sm btn-outline-secondary border-0 bg-secondary bg-opacity-10 text-secondary"
              >
                <i className="fas fa-arrow-left me-1"></i>
                Back to List
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}