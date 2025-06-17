'use client';

import React from 'react';
import Link from 'next/link';
import { ticketStatusEnum } from '@/db/schema';
import toast from 'react-hot-toast';

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
  const s = status?.toLowerCase() || 'unknown';
  switch (s) {
    case 'new': return { class: 'bg-info-light text-info border-info-border', icon: 'fas fa-star', label: 'New' };
    case 'open': return { class: 'bg-success-light text-success border-success-border', icon: 'fas fa-folder-open', label: 'Open' };
    case 'in_progress': return { class: 'bg-primary-light text-primary border-primary-border', icon: 'fas fa-cog fa-spin', label: 'In Progress' };
    case 'pending_customer': return { class: 'bg-warning-light text-warning border-warning-border', icon: 'fas fa-clock', label: 'Pending Customer' };
    case 'closed': return { class: 'bg-secondary-light text-secondary border-secondary-border', icon: 'fas fa-check-circle', label: 'Closed' };
    default: return { class: 'bg-light text-dark border', icon: 'fas fa-question-circle', label: s };
  }
};

// Get action indicator with enhanced styling
const getActionIndicator = (status: string, lastCommenterIsCustomer?: boolean) => {
  if (status === 'pending_customer') {
    return <span className="action-badge badge" style={{ background: 'var(--color-warning-light)', color: 'var(--color-warning)', border: '1px solid var(--color-warning-border)' }}><i className="fas fa-user-clock me-1"></i>Awaiting Customer</span>;
  }
  if ((status === 'open' || status === 'in_progress') && lastCommenterIsCustomer) {
    return <span className="action-badge badge" style={{ background: 'var(--color-info-light)', color: 'var(--color-info)', border: '1px solid var(--color-info-border)' }}><i className="fas fa-user-tie me-1"></i>Needs Reply</span>;
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
    const url = `${window.location.origin}/tickets/${ticket.id}`;
    navigator.clipboard.writeText(url)
      .then(() => toast.success('Ticket link copied to clipboard!'))
      .catch(err => toast.error('Failed to copy link.'));
  };

  return (
    <div className="ticket-header-wrapper">
      <div className="ticket-header-bar">
        <div className="container-fluid px-4 py-2">
          <div className="d-flex align-items-center justify-content-between gap-3 flex-wrap">
            
            {/* Left Side - Title + Status */}
            <div className="d-flex align-items-center gap-3 flex-grow-1 min-w-0">
              <h1 className="mb-0 text-white text-truncate" style={{ fontSize: '1.25rem', fontWeight: '600' }}>
                <span className="text-muted">#{ticket.id}</span>
                <span className="mx-2 text-muted">•</span>
                <span className="title-text text-truncate">{ticket.title}</span>
              </h1>
              <div className="d-flex align-items-center gap-2">
                <span className={`badge ${statusConfig.class}`}><i className={`${statusConfig.icon} me-1`}></i>{statusConfig.label}</span>
                {showAiSuggestionIndicator && <span className="badge" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)', border: '1px solid var(--color-primary-border)' }}><i className="fas fa-robot me-1"></i>AI</span>}
                {getActionIndicator(ticket.status, ticket.lastCommenterIsCustomer)}
              </div>
            </div>

            {/* Center - Quick Controls */}
            <div className="d-flex align-items-center gap-2">
              <select 
                value={ticket.status} 
                onChange={handleStatusSelectChange} 
                disabled={isUpdatingStatus} 
                className="form-select form-select-sm" 
                style={{ 
                  width: '130px', 
                  background: 'var(--glass-bg)', 
                  color: 'white', 
                  border: '1px solid var(--glass-border)',
                  fontSize: '0.8rem'
                }}
              >
                {ticketStatusEnum.enumValues.map(s => (
                  <option key={s} value={s} style={{ background: '#1a1a2e' }}>
                    {s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </option>
                ))}
              </select>
              {isUpdatingStatus && <span className="spinner-border spinner-border-sm text-primary"></span>}

              <select 
                value={ticket.assignee?.id || ''} 
                onChange={handleAssigneeChange} 
                disabled={isUpdatingAssignee} 
                className="form-select form-select-sm" 
                style={{ 
                  width: '130px', 
                  background: 'var(--glass-bg)', 
                  color: 'white', 
                  border: '1px solid var(--glass-border)',
                  fontSize: '0.8rem'
                }}
              >
                <option value="" style={{ background: '#1a1a2e' }}>Unassigned</option>
                {users.map(user => (
                  <option key={user.id} value={user.id} style={{ background: '#1a1a2e' }}>
                    {user.name || user.email}
                  </option>
                ))}
              </select>
              {isUpdatingAssignee && <span className="spinner-border spinner-border-sm text-primary"></span>}
            </div>

            {/* Right Side - Action Buttons */}
            <div className="d-flex align-items-center gap-1">
              {orderNumberForStatus && (
                <button 
                  type="button" 
                  className="btn btn-sm btn-outline-info" 
                  onClick={onGetOrderStatusDraft} 
                  disabled={isLoadingOrderStatusDraft} 
                  title="Get Order Status"
                >
                  {isLoadingOrderStatusDraft ? 
                    <span className="spinner-border spinner-border-sm"></span> : 
                    <i className="fas fa-truck"></i>
                  }
                </button>
              )}
              {hasInvoiceInfo && onResendInvoice && (
                <button 
                  type="button" 
                  className="btn btn-sm btn-outline-warning" 
                  onClick={onResendInvoice} 
                  disabled={isResendingInvoice} 
                  title="Resend Invoice"
                >
                  {isResendingInvoice ? 
                    <span className="spinner-border spinner-border-sm"></span> : 
                    <i className="fas fa-envelope"></i>
                  }
                </button>
              )}
              {ticket.status === 'closed' && (
                <button 
                  onClick={onReopenTicket} 
                  className="btn btn-sm btn-outline-warning" 
                  title="Reopen Ticket"
                >
                  <i className="fas fa-folder-open"></i>
                </button>
              )}
              <Link 
                href={`/tickets/${ticket.id}/create-quote`} 
                className="btn btn-sm btn-outline-success" 
                title="Create Quote"
              >
                <i className="fas fa-file-invoice-dollar"></i>
              </Link>
              <button 
                className="btn btn-sm btn-outline-secondary" 
                onClick={onMergeClick} 
                title="Merge Tickets"
              >
                <i className="fas fa-code-branch"></i>
              </button>
              <button 
                className="btn btn-sm btn-outline-secondary" 
                onClick={handleCopyLink} 
                title="Copy Link"
              >
                <i className="fas fa-link"></i>
              </button>
              <Link 
                href={`/tickets/${ticket.id}/edit`} 
                className="btn btn-sm btn-outline-secondary" 
                title="Edit Ticket"
              >
                <i className="fas fa-edit"></i>
              </Link>
              <Link 
                href="/tickets" 
                className="btn btn-sm btn-outline-secondary" 
                title="Back to List"
              >
                <i className="fas fa-arrow-left"></i>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}