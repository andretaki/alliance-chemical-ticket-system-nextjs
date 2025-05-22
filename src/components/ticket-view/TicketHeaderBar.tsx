'use client';

import React from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ticketStatusEnum } from '@/db/schema';

// Type definitions
type BaseUser = {
  id: string; // UUID
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
  copyTicketLink?: () => void;
}

const getStatusClass = (status: string | null): string => {
  switch (status?.toLowerCase()) {
    case 'new': return 'badge bg-info text-dark';
    case 'open': return 'badge bg-success';
    case 'in_progress': return 'badge bg-primary';
    case 'pending_customer': return 'badge bg-warning text-dark';
    case 'closed': return 'badge bg-secondary';
    default: return 'badge bg-light text-dark border';
  }
};

// Determine who needs to take action
const getActionIndicator = (status: string, lastCommenterIsCustomer?: boolean) => {
  if (status === 'pending_customer') {
    return (
      <span className="badge bg-warning text-dark ms-2" title="Waiting for customer response">
        <i className="fas fa-user-clock me-1"></i> Awaiting Customer
      </span>
    );
  }
  
  if ((status === 'open' || status === 'in_progress') && lastCommenterIsCustomer) {
    return (
      <span className="badge bg-info ms-2" title="Customer has replied, awaiting agent response">
        <i className="fas fa-user-tie me-1"></i> Needs Agent Reply
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
  copyTicketLink
}: TicketHeaderBarProps) {
  // Function to copy ticket link to clipboard
  const handleCopyLink = () => {
    if (copyTicketLink) {
      copyTicketLink();
    } else {
      const url = `${window.location.origin}/tickets/${ticket.id}`;
      navigator.clipboard.writeText(url)
        .then(() => {
          // You could add a toast notification here
          alert('Ticket link copied to clipboard');
        })
        .catch(err => {
          console.error('Failed to copy: ', err);
        });
    }
  };

  return (
    <div className="ticket-header-bar bg-light border-bottom p-2 sticky-top">
      <div className="container-fluid">
        <div className="row g-2 align-items-center">
          <div className="col-md-6">
            <div className="d-flex align-items-center">
              <h1 className="h5 mb-0 me-2 text-truncate">
                <span className="text-muted me-2">#{ticket.id}</span>
                {ticket.title}
                {showAiSuggestionIndicator && (
                  <span className="badge bg-info-subtle text-info-emphasis border border-info-subtle rounded-pill ms-2" title="AI suggestion available in reply form">
                    <i className="fas fa-robot me-1"></i> AI Help
                  </span>
                )}
                {getActionIndicator(ticket.status, ticket.lastCommenterIsCustomer)}
              </h1>
            </div>
          </div>
          
          <div className="col-md-6">
            <div className="d-flex align-items-center justify-content-md-end gap-2 flex-wrap">
              {/* Status Dropdown - Compact Form */}
              <div className="d-flex align-items-center me-2">
                <label htmlFor="statusSelect" className="form-label mb-0 me-2 small">Status:</label>
                <div className="d-flex align-items-center">
                  <select 
                    id="statusSelect" 
                    className="form-select form-select-sm" 
                    value={ticket.status} 
                    onChange={handleStatusSelectChange} 
                    disabled={isUpdatingStatus}
                    style={{ width: '140px' }}
                  >
                    {ticketStatusEnum.enumValues.map(s => (
                      <option key={s} value={s}>
                        {s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </option>
                    ))}
                  </select>
                  {isUpdatingStatus && <div className="spinner-border spinner-border-sm text-muted ms-2" role="status"><span className="visually-hidden">...</span></div>}
                </div>
              </div>
              
              {/* Assignee Dropdown - Compact Form */}
              <div className="d-flex align-items-center me-2">
                <label htmlFor="assigneeSelect" className="form-label mb-0 me-2 small">Assign:</label>
                <div className="d-flex align-items-center">
                  <select 
                    id="assigneeSelect" 
                    className="form-select form-select-sm" 
                    value={ticket.assignee?.id || ''} 
                    onChange={handleAssigneeChange} 
                    disabled={isUpdatingAssignee}
                    style={{ width: '140px' }}
                  >
                    <option value="">-- Unassigned --</option>
                    {users.map(user => (
                      <option key={user.id} value={user.id}>
                        {user.name || user.email}
                      </option>
                    ))}
                  </select>
                  {isUpdatingAssignee && <div className="spinner-border spinner-border-sm text-muted ms-2" role="status"><span className="visually-hidden">...</span></div>}
                </div>
              </div>
              
              {/* Action Buttons */}
              <Link href={`/tickets/${ticket.id}/create-quote`} className="btn btn-success btn-sm">
                <i className="fas fa-file-invoice-dollar me-1"></i>Create Quote
              </Link>

              <button 
                className="btn btn-outline-secondary btn-sm" 
                onClick={handleCopyLink}
                title="Copy ticket link to clipboard"
              >
                <i className="fas fa-link me-1"></i> Copy Link
              </button>

              <Link href={`/tickets/${ticket.id}/edit`} className="btn btn-outline-secondary btn-sm">
                <i className="fas fa-edit me-1"></i> Edit
              </Link>
              
              <Link href="/tickets" className="btn btn-outline-secondary btn-sm">
                <i className="fas fa-list me-1"></i> Back
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 