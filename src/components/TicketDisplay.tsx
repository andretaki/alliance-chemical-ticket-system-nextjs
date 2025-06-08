'use client';

// src/components/TicketDisplay.tsx
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { format, formatDistanceToNowStrict } from 'date-fns';
import DOMPurify from 'dompurify';

interface TicketDisplayProps {
  ticket: {
    id: number;
    title: string;
    status: string;
    priority: string;
    type?: string | null;
    createdAt: Date;
    updatedAt: Date;
    assigneeName: string | null;
    assigneeId: string | null;
    sentiment?: 'positive' | 'neutral' | 'negative' | null;
    description?: string | null;
    isFromEmail?: boolean;
    orderNumber?: string | null;
    trackingNumber?: string | null;
    lastCommenterIsCustomer?: boolean;
    hasUnreadUpdates?: boolean;
    isMentioningCurrentUser?: boolean;
    slaNearingBreached?: 'warning' | 'breached' | null; // Changed type to string literal union
  };
  deleteTicket: (id: number) => Promise<void>;
  refreshTickets: () => Promise<void>;
}

// Function to check if content is HTML
const isHtmlContent = (content: string): boolean => {
  return /<\/?[a-z][\s\S]*>/i.test(content);
};

// Function to extract text from HTML
const extractTextFromHtml = (html: string): string => {
  // Create a DOM parser
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return doc.body.textContent || '';
};

export default function TicketDisplay({ ticket, deleteTicket, refreshTickets }: TicketDisplayProps) {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Calculate time since update
  const timeSinceUpdate = useMemo(() => {
    if (!ticket.updatedAt) return '';
    return formatDistanceToNowStrict(new Date(ticket.updatedAt), { addSuffix: true });
  }, [ticket.updatedAt]);

  // Truncate description to first 75 characters, handling HTML content
  const truncatedDescription = useMemo(() => {
    if (!ticket.description) return 'No description';
    
    let text = ticket.description;
    
    // If it's HTML content, extract the text first
    if (isHtmlContent(text)) {
      // For client-side only
      if (typeof window !== 'undefined') {
        text = extractTextFromHtml(text);
      } else {
        // Simple fallback for server-side
        text = text.replace(/<[^>]*>/g, '');
      }
    }
    
    // Now truncate the plain text
    return text.length > 75 ? `${text.substring(0, 75)}...` : text;
  }, [ticket.description]);

  const handleDeleteClick = async () => {
    if (!isConfirmingDelete) {
      setIsConfirmingDelete(true);
      // Auto-hide confirm after 5 seconds
      setTimeout(() => setIsConfirmingDelete(false), 5000);
      return;
    }

    setIsDeleting(true);
    try {
      await deleteTicket(ticket.id);
    } finally {
      setIsDeleting(false);
      setIsConfirmingDelete(false);
    }
  };

  const getPriorityBadgeClass = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-danger';
      case 'medium': return 'bg-warning text-dark';
      case 'low': return 'bg-info text-dark';
      default: return 'bg-secondary';
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'open': return 'bg-success';
      case 'in_progress': return 'bg-primary';
      case 'resolved': return 'bg-secondary';
      case 'closed': return 'bg-dark';
      case 'waiting_on_customer': 
      case 'pending_customer': return 'bg-warning text-dark';
      default: return 'bg-secondary';
    }
  };

  const formatStatus = (status: string) => {
    return status.replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // For ticket preview on hover
  const handleMouseEnter = () => setShowPreview(true);
  const handleMouseLeave = () => setShowPreview(false);

  // Quick assign to me function (to be implemented)
  const handleQuickAssign = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // This functionality would need to be implemented in the backend
    // and passed as a prop to this component
    alert('Quick assign functionality to be implemented');
  };

  const getSentimentIcon = (sentiment: string | null | undefined) => {
    switch (sentiment) {
      case 'positive':
        return <i className="fa-solid fa-face-smile text-success me-2" title="Positive Sentiment"></i>;
      case 'negative':
        return <i className="fa-solid fa-face-frown text-danger me-2" title="Negative Sentiment"></i>;
      case 'neutral':
        return <i className="fa-solid fa-face-meh text-muted me-2" title="Neutral Sentiment"></i>;
      default:
        return null;
    }
  };

  return (
    <tr className={`align-middle ${ticket.hasUnreadUpdates ? 'bg-primary-subtle' : ''}`} 
        onMouseEnter={handleMouseEnter} 
        onMouseLeave={handleMouseLeave}>
      <td>
        <span className="badge bg-light text-dark border fw-bold position-relative">
          #{ticket.id}
          {ticket.hasUnreadUpdates && (
            <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" 
                  style={{ fontSize: '0.6rem' }}>
              <i className="fa-solid fa-circle"></i>
              <span className="visually-hidden">unread updates</span>
            </span>
          )}
        </span>
      </td>
      <td className="position-relative">
        <Link href={`/tickets/${ticket.id}`} className="text-decoration-none fw-medium text-primary">
          {getSentimentIcon(ticket.sentiment)}
          {ticket.title}
          {ticket.isMentioningCurrentUser && (
            <span className="badge bg-danger ms-2 rounded-pill" title="You were mentioned">
              <i className="fa-solid fa-at me-1"></i> Mentioned
            </span>
          )}
        </Link>
        {ticket.isFromEmail && (
          <span className="badge bg-primary bg-opacity-10 text-primary ms-2 rounded-pill">
            <i className="fa-solid fa-envelope-open-text me-1"></i> Email
          </span>
        )}
        {ticket.lastCommenterIsCustomer && (
          <span className="badge bg-info bg-opacity-10 text-info ms-2 rounded-pill" title="Customer Replied">
            <i className="fa-solid fa-user-clock me-1"></i> Customer Replied
          </span>
        )}
        {ticket.orderNumber && (
          <span className="badge bg-success bg-opacity-10 text-success ms-2 rounded-pill">
            <i className="fa-solid fa-shopping-cart me-1"></i> Order #{ticket.orderNumber}
          </span>
        )}
        {ticket.slaNearingBreached && (
          <span className={`badge ${ticket.slaNearingBreached === 'breached' ? 'bg-danger' : 'bg-warning text-dark'} ms-2 rounded-pill`}>
            <i className="fa-solid fa-clock me-1"></i> {ticket.slaNearingBreached === 'breached' ? 'SLA Breached' : 'SLA Warning'}
          </span>
        )}
        
        {/* Preview popover */}
        {showPreview && (
          <div className="position-absolute start-0 top-100 shadow bg-white rounded p-2 border mt-1 z-3" 
               style={{ width: '300px', zIndex: 1000 }}>
            {ticket.description && isHtmlContent(ticket.description) ? (
              <div 
                className="small mb-2"
                dangerouslySetInnerHTML={{ 
                  __html: DOMPurify.sanitize(ticket.description.substring(0, 150) + (ticket.description.length > 150 ? '...' : ''))
                }}
              />
            ) : (
              <p className="small mb-2">{truncatedDescription}</p>
            )}
            {!ticket.assigneeName && (
              <button 
                className="btn btn-sm btn-outline-primary" 
                onClick={handleQuickAssign} 
                title="Assign this ticket to yourself">
                <i className="fa-solid fa-user-check me-1"></i> Assign to me
              </button>
            )}
          </div>
        )}
      </td>
      <td>
        <p className="text-muted mb-0 small">{truncatedDescription}</p>
      </td>
      <td>
        {ticket.assigneeName ? (
          <div className="d-flex align-items-center">
            <div className="avatar avatar-sm bg-primary bg-opacity-10 rounded-circle text-primary me-2 d-flex align-items-center justify-content-center" style={{ width: '32px', height: '32px' }}>
              <span className="fw-bold">{ticket.assigneeName.charAt(0).toUpperCase()}</span>
            </div>
            <span>{ticket.assigneeName}</span>
          </div>
        ) : (
          <span className="text-muted fst-italic">Unassigned</span>
        )}
      </td>
      <td>
        <span className={`badge ${getPriorityBadgeClass(ticket.priority)} rounded-pill px-3 py-2`}>
          {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
        </span>
      </td>
      <td>
        <span className={`badge ${getStatusBadgeClass(ticket.status)} rounded-pill px-3 py-2`}>
          {formatStatus(ticket.status)}
        </span>
      </td>
      <td>
        {ticket.type ? (
          <span className="badge bg-light text-secondary border">{ticket.type}</span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td>
        <div className="d-flex flex-column gap-2">
          <div className="btn-group" role="group" aria-label="Ticket actions">
            <Link 
              href={`/tickets/${ticket.id}`} 
              className="btn btn-sm btn-outline-primary" 
              title="View Ticket Details"
            >
              <i className="fa-solid fa-eye me-1"></i> View
            </Link>
            <Link 
              href={`/tickets/${ticket.id}/edit`} 
              className="btn btn-sm btn-outline-success" 
              title="Edit Ticket"
            >
              <i className="fa-solid fa-pen-to-square me-1"></i> Edit
            </Link>
            <button
              onClick={handleDeleteClick}
              className={`btn btn-sm ${isConfirmingDelete ? 'btn-danger' : 'btn-outline-danger'}`}
              title={isConfirmingDelete ? 'Confirm Delete' : 'Delete Ticket'}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
              ) : isConfirmingDelete ? (
                <><i className="fa-solid fa-check me-1"></i> Confirm</>
              ) : (
                <><i className="fa-solid fa-trash me-1"></i> Delete</>
              )}
            </button>
          </div>
          <div className="small text-muted">
            <span title={format(ticket.createdAt, 'PPpp')}>
              <i className="fa-regular fa-clock me-1"></i>
              Updated {timeSinceUpdate}
            </span>
          </div>
        </div>
      </td>
    </tr>
  );
}