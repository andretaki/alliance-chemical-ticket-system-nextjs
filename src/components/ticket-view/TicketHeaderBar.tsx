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
    <div className="ticket-header-wrapper" style={{ borderBottom: '1px solid var(--card-border)' }}>
      {/* Single Compact Header Bar */}
      <div className="ticket-header-bar" style={{ background: 'var(--card-bg)', backdropFilter: 'blur(20px)' }}>
        <div className="container-fluid" style={{ padding: '0.75rem 1.5rem' }}>
          <div className="d-flex align-items-center justify-content-between gap-3 flex-wrap">
            
            {/* Left Side - Title + Status */}
            <div className="d-flex align-items-center gap-3 flex-grow-1 min-w-0">
              {/* Compact Title */}
              <div className="ticket-title-compact">
                <h1 className="mb-0" style={{ 
                  fontSize: '1.1rem', 
                  fontWeight: '600',
                  color: 'var(--color-foreground)',
                  lineHeight: '1.3'
                }}>
                  <span style={{ color: 'var(--color-foreground-muted)', fontSize: '0.9rem' }}>#{ticket.id}</span>
                  <span className="mx-2" style={{ color: 'var(--color-foreground-muted)' }}>•</span>
                        <span className="title-text">{ticket.title}</span>
                      </h1>
                    </div>
                    
              {/* Inline Status Badges */}
              <div className="d-flex align-items-center gap-2">
                <span className={`badge ${statusConfig.class}`} style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem' }}>
                        <i className={`${statusConfig.icon} me-1`}></i>
                        {statusConfig.label}
                      </span>
                      
                      {showAiSuggestionIndicator && (
                  <span className="badge" style={{ 
                    background: 'var(--color-primary-light)', 
                    color: 'var(--color-primary)',
                    border: '1px solid var(--color-primary-border)',
                    fontSize: '0.7rem',
                    padding: '0.25rem 0.5rem'
                  }}>
                          <i className="fas fa-robot me-1"></i>
                    AI
                        </span>
                      )}
                      
                      {getActionIndicator(ticket.status, ticket.lastCommenterIsCustomer)}
              </div>
            </div>

            {/* Center - Quick Controls */}
            <div className="d-flex align-items-center gap-2">
              {/* Compact Status Select */}
              <div className="d-flex align-items-center">
                    <select 
                  className="form-select"
                      value={ticket.status} 
                      onChange={handleStatusSelectChange} 
                      disabled={isUpdatingStatus}
                  style={{ 
                    fontSize: '0.75rem',
                    padding: '0.375rem 0.75rem',
                    border: '1px solid var(--glass-border)',
                    background: 'var(--glass-bg)',
                    color: 'var(--color-foreground)',
                    minWidth: '110px'
                  }}
                    >
                      {ticketStatusEnum.enumValues.map(s => (
                    <option key={s} value={s} style={{ background: '#1a1a2e', color: 'var(--color-foreground)' }}>
                          {s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </option>
                      ))}
                    </select>
                    {isUpdatingStatus && (
                  <div className="spinner-border spinner-border-sm ms-2" style={{ 
                    color: 'var(--color-primary)', 
                    width: '1rem', 
                    height: '1rem' 
                  }}></div>
                    )}
                </div>
                
              {/* Compact Assignee Select */}
              <div className="d-flex align-items-center">
                    <select 
                  className="form-select"
                      value={ticket.assignee?.id || ''} 
                      onChange={handleAssigneeChange} 
                      disabled={isUpdatingAssignee}
                  style={{ 
                    fontSize: '0.75rem',
                    padding: '0.375rem 0.75rem',
                    border: '1px solid var(--glass-border)',
                    background: 'var(--glass-bg)',
                    color: 'var(--color-foreground)',
                    minWidth: '120px'
                  }}
                    >
                  <option value="" style={{ background: '#1a1a2e', color: 'var(--color-foreground)' }}>Unassigned</option>
                      {users.map(user => (
                    <option key={user.id} value={user.id} style={{ background: '#1a1a2e', color: 'var(--color-foreground)' }}>
                      {user.name?.split(' ')[0] || user.email?.split('@')[0] || 'User'}
                        </option>
                      ))}
                    </select>
                    {isUpdatingAssignee && (
                  <div className="spinner-border spinner-border-sm ms-2" style={{ 
                    color: 'var(--color-primary)', 
                    width: '1rem', 
                    height: '1rem' 
                  }}></div>
                    )}
        </div>
      </div>

            {/* Right Side - Action Buttons */}
            <div className="d-flex align-items-center gap-1">
              {/* Special Action Buttons */}
              {orderNumberForStatus && (
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ 
                    background: 'var(--color-info-light)', 
                    border: '1px solid var(--color-info-border)', 
                    color: 'var(--color-info)',
                    fontSize: '0.75rem',
                    padding: '0.375rem 0.75rem'
                  }}
                  onClick={onGetOrderStatusDraft}
                  disabled={isLoadingOrderStatusDraft}
                  title="Get Order Status"
                >
                  {isLoadingOrderStatusDraft ? (
                    <span className="spinner-border spinner-border-sm"></span>
                  ) : (
                    <i className="fas fa-truck"></i>
                  )}
                </button>
              )}

              {hasInvoiceInfo && onResendInvoice && (
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ 
                    background: 'var(--color-warning-light)', 
                    border: '1px solid var(--color-warning-border)', 
                    color: 'var(--color-warning)',
                    fontSize: '0.75rem',
                    padding: '0.375rem 0.75rem'
                  }}
                  onClick={onResendInvoice}
                  disabled={isResendingInvoice}
                  title="Resend Invoice"
                >
                  {isResendingInvoice ? (
                    <span className="spinner-border spinner-border-sm"></span>
                  ) : (
                    <i className="fas fa-envelope"></i>
                  )}
                </button>
              )}

              {ticket.status === 'closed' && (
                <button 
                  onClick={onReopenTicket} 
                  className="btn btn-sm"
                  style={{ 
                    background: 'var(--color-warning-light)', 
                    border: '1px solid var(--color-warning-border)', 
                    color: 'var(--color-warning)',
                    fontSize: '0.75rem',
                    padding: '0.375rem 0.75rem'
                  }}
                  title="Reopen Ticket"
                >
                  <i className="fas fa-folder-open"></i>
                </button>
              )}

              {/* Core Action Buttons */}
              <Link 
                href={`/tickets/${ticket.id}/create-quote`} 
                className="btn btn-sm"
                style={{ 
                  background: 'var(--color-success-light)', 
                  border: '1px solid var(--color-success-border)', 
                  color: 'var(--color-success)',
                  textDecoration: 'none',
                  fontSize: '0.75rem',
                  padding: '0.375rem 0.75rem'
                }}
                title="Create Quote"
              >
                <i className="fas fa-file-invoice-dollar"></i>
              </Link>

              <button
                className="btn btn-sm"
                style={{ 
                  background: 'var(--glass-bg)', 
                  border: '1px solid var(--glass-border)', 
                  color: 'var(--color-foreground-secondary)',
                  fontSize: '0.75rem',
                  padding: '0.375rem 0.75rem'
                }}
                onClick={onMergeClick}
                title="Merge Tickets"
              >
                <i className="fas fa-code-branch"></i>
              </button>

              <button 
                className="btn btn-sm"
                style={{ 
                  background: 'var(--glass-bg)', 
                  border: '1px solid var(--glass-border)', 
                  color: 'var(--color-foreground-secondary)',
                  fontSize: '0.75rem',
                  padding: '0.375rem 0.75rem'
                }}
                onClick={handleCopyLink}
                title="Copy Link"
              >
                <i className="fas fa-link"></i>
              </button>

              <Link 
                href={`/tickets/${ticket.id}/edit`} 
                className="btn btn-sm"
                style={{ 
                  background: 'var(--glass-bg)', 
                  border: '1px solid var(--glass-border)', 
                  color: 'var(--color-foreground-secondary)',
                  textDecoration: 'none',
                  fontSize: '0.75rem',
                  padding: '0.375rem 0.75rem'
                }}
                title="Edit Ticket"
              >
                <i className="fas fa-edit"></i>
              </Link>
              
              <Link 
                href="/tickets" 
                className="btn btn-sm"
                style={{ 
                  background: 'var(--glass-bg)', 
                  border: '1px solid var(--glass-border)', 
                  color: 'var(--color-foreground-secondary)',
                  textDecoration: 'none',
                  fontSize: '0.75rem',
                  padding: '0.375rem 0.75rem'
                }}
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