'use client';

import React, { ChangeEvent } from 'react';
import Link from 'next/link';
import { ticketStatusEnum } from '@/db/schema';
import toast from 'react-hot-toast';
import { Button, Dropdown, Form, Nav, Navbar, Spinner } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExternalLinkAlt, faInfoCircle, faPaperPlane, faRedo, faSync, faTicketAlt } from '@fortawesome/free-solid-svg-icons';
import { Ticket as TicketData, TicketUser as BaseUser } from '@/types/ticket';

interface TicketHeaderBarProps {
  ticket: TicketData;
  users: BaseUser[];
  isUpdatingAssignee: boolean;
  isUpdatingStatus: boolean;
  handleAssigneeChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  handleStatusSelectChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  showAiSuggestionIndicator: boolean;
  onReopenTicket: () => void;
  copyTicketLink?: () => void;
  orderNumberForStatus?: string | null;
  onGetOrderStatusDraft: () => void;
  isLoadingOrderStatusDraft: boolean;
  onResendInvoice: () => void;
  isResendingInvoice: boolean;
  hasInvoiceInfo: boolean;
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
  const isClosed = ticket.status === 'closed';
  
  const handleCopyLink = () => {
    const url = `${window.location.origin}/tickets/${ticket.id}`;
    navigator.clipboard.writeText(url)
      .then(() => toast.success('Ticket link copied to clipboard!'))
      .catch(err => toast.error('Failed to copy link.'));
  };

  return (
    <Navbar bg="dark" variant="dark" expand="lg" className="ticket-header-bar p-2">
      <div className="d-flex align-items-center text-white me-3">
        <FontAwesomeIcon icon={faTicketAlt} className="me-2" />
        <Navbar.Brand>Ticket #{ticket.id}: {ticket.title}</Navbar.Brand>
      </div>
      <Navbar.Toggle aria-controls="basic-navbar-nav" />
      <Navbar.Collapse id="basic-navbar-nav">
        <Nav className="ms-auto align-items-center gap-2">
          {orderNumberForStatus && (
            <Button
              variant="outline-info"
              size="sm"
              onClick={onGetOrderStatusDraft}
              disabled={isLoadingOrderStatusDraft || isClosed}
            >
              {isLoadingOrderStatusDraft ? (
                <>
                  <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" />
                  <span className="visually-hidden">Loading...</span>
                </>
              ) : (
                <><FontAwesomeIcon icon={faInfoCircle} className="me-1" /> Get Order Status</>
              )}
            </Button>
          )}

          {hasInvoiceInfo && (
            <Button
              variant="outline-light"
              size="sm"
              onClick={onResendInvoice}
              disabled={isResendingInvoice || isClosed}
            >
              {isResendingInvoice ? (
                <>
                  <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" />
                  <span className="visually-hidden">Loading...</span>
                </>
              ) : (
                <><FontAwesomeIcon icon={faPaperPlane} className="me-1" /> Resend Invoice</>
              )}
            </Button>
          )}

          <Button variant="outline-secondary" size="sm" onClick={onMergeClick} disabled={isClosed}>
            Merge
          </Button>

          {isClosed ? (
            <Button variant="success" size="sm" onClick={onReopenTicket}>
              <FontAwesomeIcon icon={faRedo} className="me-1" /> Reopen Ticket
            </Button>
          ) : (
            <Dropdown>
              <Dropdown.Toggle variant="primary" id="dropdown-basic" size="sm" disabled={isUpdatingStatus}>
                {isUpdatingStatus ? 'Updating...' : 'Change Status'}
              </Dropdown.Toggle>
              <Dropdown.Menu>
                {ticketStatusEnum.enumValues.map(status => (
                  <Dropdown.Item key={status} onClick={() => handleStatusSelectChange({ target: { value: status } } as any)}>
                    {status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>
          )}

          <div className="d-flex align-items-center text-white">
            <span className="me-2">Assignee:</span>
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
              <option value="">Unassigned</option>
              {users.map(user => (
                <option key={user.id} value={user.id} style={{ background: '#1a1a2e' }}>
                  {user.name || user.email}
                </option>
              ))}
            </select>
          </div>

          {showAiSuggestionIndicator && (
            <div className="ai-indicator" title="AI suggestion available in conversation">
              <FontAwesomeIcon icon={faSync} spin />
              <span className="ms-1">AI</span>
            </div>
          )}
        </Nav>
      </Navbar.Collapse>
    </Navbar>
  );
}