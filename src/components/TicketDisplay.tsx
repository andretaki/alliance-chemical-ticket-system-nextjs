import React, { useState } from 'react';
import Link from 'next/link';

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
    assigneeEmail?: string | null;
    reporterName: string | null;
    reporterId?: string | null;
    reporterEmail?: string | null;
    description?: string | null;
    isFromEmail?: boolean;
    orderNumber?: string | null;
    trackingNumber?: string | null;
  };
  deleteTicket: (id: number) => Promise<void>;
  refreshTickets: () => void;
}

const TicketDisplay: React.FC<TicketDisplayProps> = ({ 
  ticket, 
  deleteTicket, 
  refreshTickets 
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);

  const handleDelete = async () => {
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      return;
    }

    setIsDeleting(true);
    try {
      await deleteTicket(ticket.id);
      refreshTickets();
    } catch (error) {
      console.error('Failed to delete ticket:', error);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
  };

  // Helper functions for styling
  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case 'low': return 'success';
      case 'medium': return 'warning';
      case 'high': return 'danger';
      case 'urgent': return 'critical';
      default: return 'secondary';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'new': return 'primary';
      case 'in_progress': return 'info';
      case 'resolved': return 'success';
      case 'closed': return 'secondary';
      default: return 'secondary';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case 'low': return 'fa-chevron-down';
      case 'medium': return 'fa-minus';
      case 'high': return 'fa-chevron-up';
      case 'urgent': return 'fa-exclamation-triangle';
      default: return 'fa-circle';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'new': return 'fa-plus-circle';
      case 'in_progress': return 'fa-clock';
      case 'resolved': return 'fa-check-circle';
      case 'closed': return 'fa-times-circle';
      default: return 'fa-circle';
    }
  };

  const getTypeIcon = (type: string | null) => {
    if (!type) return 'fa-tag';
    switch (type.toLowerCase()) {
      case 'bug': return 'fa-bug';
      case 'feature': return 'fa-star';
      case 'support': return 'fa-life-ring';
      case 'billing': return 'fa-credit-card';
      default: return 'fa-tag';
    }
  };

  const formatRelativeTime = (date: Date) => {
    try {
      const now = new Date();
      const diffInMs = now.getTime() - date.getTime();
      const diffInSeconds = Math.floor(diffInMs / 1000);
      const diffInMinutes = Math.floor(diffInSeconds / 60);
      const diffInHours = Math.floor(diffInMinutes / 60);
      const diffInDays = Math.floor(diffInHours / 24);

      if (diffInSeconds < 60) {
        return 'just now';
      } else if (diffInMinutes < 60) {
        return `${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'} ago`;
      } else if (diffInHours < 24) {
        return `${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`;
      } else if (diffInDays < 30) {
        return `${diffInDays} day${diffInDays === 1 ? '' : 's'} ago`;
      } else {
        return date.toLocaleDateString();
      }
    } catch {
      return date.toLocaleDateString();
    }
  };

  const truncateDescription = (text: string | null, maxLength: number = 100) => {
    if (!text) return 'No description provided';
    if (text.length <= maxLength) return text;
    return showFullDescription ? text : `${text.substring(0, maxLength)}...`;
  };

  return (
    <>
      <tr className={`ticket-row ${showDeleteConfirm ? 'deleting' : ''}`}>
        {/* ID Column */}
        <td className="ticket-id-cell">
          <div className="id-wrapper">
            <div className="id-badge">
              <span className="id-hash">#</span>
              <span className="id-number">{ticket.id}</span>
            </div>
            {ticket.isFromEmail && (
              <div className="email-indicator" title="Created from email">
                <i className="fas fa-envelope" />
              </div>
            )}
          </div>
        </td>

        {/* Title Column */}
        <td className="ticket-title-cell">
          <div className="title-wrapper">
            <Link href={`/tickets/${ticket.id}`} className="ticket-title-link">
              <div className="title-content">
                <span className="title-text">{ticket.title}</span>
                <div className="title-underline" />
              </div>
            </Link>
            <div className="title-meta">
              <span className="created-time">
                <i className="fas fa-clock" />
                Created {formatRelativeTime(ticket.createdAt)}
              </span>
              {ticket.orderNumber && (
                <span className="order-number">
                  <i className="fas fa-shopping-cart" />
                  Order: {ticket.orderNumber}
                </span>
              )}
              {ticket.trackingNumber && (
                <span className="tracking-number">
                  <i className="fas fa-shipping-fast" />
                  Tracking: {ticket.trackingNumber}
                </span>
              )}
            </div>
          </div>
        </td>

        {/* Description Column */}
        <td className="ticket-description-cell">
          <div className="description-wrapper">
            <div className="description-text">
              {truncateDescription(ticket.description ?? null)}
            </div>
            {ticket.description && ticket.description.length > 100 && (
              <button
                className="description-toggle"
                onClick={() => setShowFullDescription(!showFullDescription)}
              >
                {showFullDescription ? (
                  <>
                    <i className="fas fa-chevron-up" />
                    Show less
                  </>
                ) : (
                  <>
                    <i className="fas fa-chevron-down" />
                    Show more
                  </>
                )}
              </button>
            )}
          </div>
        </td>

        {/* Assignee Column */}
        <td className="ticket-assignee-cell">
          <div className="assignee-wrapper">
            {ticket.assigneeName ? (
              <div className="assignee-info">
                <div className="assignee-avatar">
                  <span>{ticket.assigneeName.charAt(0).toUpperCase()}</span>
                </div>
                <div className="assignee-details">
                  <div className="assignee-name">{ticket.assigneeName}</div>
                  {ticket.assigneeEmail && (
                    <div className="assignee-email">{ticket.assigneeEmail}</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="unassigned-badge">
                <i className="fas fa-user-slash" />
                <span>Unassigned</span>
              </div>
            )}
          </div>
        </td>

        {/* Priority Column */}
        <td className="ticket-priority-cell">
          <div className="priority-wrapper">
            <div className={`priority-badge priority-${getPriorityColor(ticket.priority)}`}>
              <i className={`fas ${getPriorityIcon(ticket.priority)} priority-icon`} />
              <span className="priority-text">
                {ticket.priority?.charAt(0).toUpperCase() + ticket.priority?.slice(1)}
              </span>
              <div className="priority-glow" />
            </div>
          </div>
        </td>

        {/* Status Column */}
        <td className="ticket-status-cell">
          <div className="status-wrapper">
            <div className={`status-badge status-${getStatusColor(ticket.status)}`}>
              <i className={`fas ${getStatusIcon(ticket.status)} status-icon`} />
              <span className="status-text">
                {ticket.status?.replace('_', ' ').charAt(0).toUpperCase() + 
                 ticket.status?.replace('_', ' ').slice(1)}
              </span>
              <div className="status-pulse" />
            </div>
          </div>
        </td>

        {/* Type Column */}
        <td className="ticket-type-cell">
          <div className="type-wrapper">
            {ticket.type ? (
              <div className="type-badge">
                <i className={`fas ${getTypeIcon(ticket.type)} type-icon`} />
                <span className="type-text">{ticket.type}</span>
              </div>
            ) : (
              <div className="no-type">
                <span>—</span>
              </div>
            )}
          </div>
        </td>

        {/* Actions Column */}
        <td className="ticket-actions-cell">
          <div className="actions-wrapper">
            <div className="action-buttons">
              <Link 
                href={`/tickets/${ticket.id}`} 
                className="action-btn view-btn"
                title="View Ticket"
              >
                <i className="fas fa-eye" />
                <span className="btn-text">View</span>
                <div className="btn-glow" />
              </Link>
              
              <Link 
                href={`/tickets/${ticket.id}/edit`} 
                className="action-btn edit-btn"
                title="Edit Ticket"
              >
                <i className="fas fa-edit" />
                <span className="btn-text">Edit</span>
                <div className="btn-glow" />
              </Link>

              {!showDeleteConfirm ? (
                <button
                  className="action-btn delete-btn"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  title="Delete Ticket"
                >
                  <i className="fas fa-trash" />
                  <span className="btn-text">Delete</span>
                  <div className="btn-glow" />
                </button>
              ) : (
                <div className="delete-confirm">
                  <button
                    className="action-btn confirm-delete-btn"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    title="Confirm Delete"
                  >
                    {isDeleting ? (
                      <i className="fas fa-spinner fa-spin" />
                    ) : (
                      <i className="fas fa-check" />
                    )}
                    <span className="btn-text">
                      {isDeleting ? 'Deleting...' : 'Confirm'}
                    </span>
                  </button>
                  <button
                    className="action-btn cancel-delete-btn"
                    onClick={cancelDelete}
                    disabled={isDeleting}
                    title="Cancel Delete"
                  >
                    <i className="fas fa-times" />
                    <span className="btn-text">Cancel</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </td>
      </tr>

      <style jsx>{`
        .ticket-row {
          transition: all 0.3s ease;
          background: rgba(255, 255, 255, 0.02);
          backdrop-filter: blur(10px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          position: relative;
        }

        .ticket-row:hover {
          background: rgba(255, 255, 255, 0.05);
          transform: translateY(-1px);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        }

        .ticket-row.deleting {
          background: rgba(239, 68, 68, 0.1);
          border-color: rgba(239, 68, 68, 0.2);
        }

        .ticket-row.deleting:hover {
          background: rgba(239, 68, 68, 0.15);
        }

        /* Table Cells */
        .ticket-row td {
          padding: 1.25rem 1rem;
          vertical-align: middle;
          color: rgba(255, 255, 255, 0.9);
          font-size: 0.875rem;
          border: none;
        }

        /* ID Cell */
        .id-wrapper {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .id-badge {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          background: rgba(102, 126, 234, 0.1);
          border: 1px solid rgba(102, 126, 234, 0.2);
          border-radius: 8px;
          padding: 0.25rem 0.5rem;
          font-weight: 600;
          color: #667eea;
          font-size: 0.75rem;
          transition: all 0.3s ease;
        }

        .id-badge:hover {
          background: rgba(102, 126, 234, 0.2);
          border-color: rgba(102, 126, 234, 0.3);
        }

        .id-hash {
          opacity: 0.7;
        }

        .id-number {
          font-weight: 700;
        }

        .email-indicator {
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.2);
          border-radius: 6px;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #10b981;
          font-size: 0.6rem;
          animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        /* Title Cell */
        .title-wrapper {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          min-width: 200px;
        }

        .ticket-title-link {
          text-decoration: none;
          color: inherit;
          display: block;
        }

        .title-content {
          position: relative;
          display: inline-block;
        }

        .title-text {
          font-weight: 600;
          color: white;
          font-size: 0.9rem;
          line-height: 1.4;
          transition: all 0.3s ease;
        }

        .ticket-title-link:hover .title-text {
          color: #667eea;
        }

        .title-underline {
          position: absolute;
          bottom: -2px;
          left: 0;
          width: 0;
          height: 2px;
          background: linear-gradient(90deg, #667eea, #764ba2);
          transition: width 0.3s ease;
        }

        .ticket-title-link:hover .title-underline {
          width: 100%;
        }

        .title-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.6);
        }

        .title-meta > span {
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }

        .title-meta i {
          opacity: 0.7;
        }

        .order-number,
        .tracking-number {
          background: rgba(255, 255, 255, 0.05);
          padding: 0.1rem 0.4rem;
          border-radius: 4px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        /* Description Cell */
        .description-wrapper {
          max-width: 300px;
        }

        .description-text {
          color: rgba(255, 255, 255, 0.8);
          line-height: 1.4;
          margin-bottom: 0.5rem;
        }

        .description-toggle {
          background: none;
          border: none;
          color: #667eea;
          font-size: 0.75rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.25rem 0;
          transition: all 0.2s ease;
        }

        .description-toggle:hover {
          color: #764ba2;
        }

        /* Assignee Cell */
        .assignee-wrapper {
          min-width: 140px;
        }

        .assignee-info {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .assignee-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: linear-gradient(135deg, #667eea, #764ba2);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 600;
          font-size: 0.8rem;
          box-shadow: 0 2px 10px rgba(102, 126, 234, 0.3);
        }

        .assignee-details {
          flex: 1;
          min-width: 0;
        }

        .assignee-name {
          font-weight: 500;
          color: white;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .assignee-email {
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.6);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .unassigned-badge {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(107, 114, 128, 0.1);
          border: 1px solid rgba(107, 114, 128, 0.2);
          border-radius: 8px;
          padding: 0.5rem 0.75rem;
          color: rgba(255, 255, 255, 0.6);
          font-size: 0.75rem;
        }

        /* Priority Cell */
        .priority-wrapper {
          min-width: 100px;
        }

        .priority-badge {
          position: relative;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.4rem 0.8rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.025em;
          transition: all 0.3s ease;
          overflow: hidden;
        }

        .priority-success {
          background: rgba(16, 185, 129, 0.1);
          color: #10b981;
          border: 1px solid rgba(16, 185, 129, 0.2);
        }

        .priority-warning {
          background: rgba(245, 158, 11, 0.1);
          color: #f59e0b;
          border: 1px solid rgba(245, 158, 11, 0.2);
        }

        .priority-danger {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.2);
        }

        .priority-critical {
          background: rgba(220, 38, 127, 0.1);
          color: #dc2626;
          border: 1px solid rgba(220, 38, 127, 0.2);
          animation: priorityPulse 2s ease-in-out infinite;
        }

        .priority-secondary {
          background: rgba(107, 114, 128, 0.1);
          color: #9ca3af;
          border: 1px solid rgba(107, 114, 128, 0.2);
        }

        @keyframes priorityPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 127, 0.4); }
          50% { box-shadow: 0 0 0 4px rgba(220, 38, 127, 0.0); }
        }

        .priority-icon {
          font-size: 0.7rem;
        }

        .priority-glow {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.1), transparent);
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .priority-badge:hover .priority-glow {
          opacity: 1;
        }

        /* Status Cell */
        .status-wrapper {
          min-width: 120px;
        }

        .status-badge {
          position: relative;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.4rem 0.8rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.025em;
          transition: all 0.3s ease;
          overflow: hidden;
        }

        .status-primary {
          background: rgba(102, 126, 234, 0.1);
          color: #667eea;
          border: 1px solid rgba(102, 126, 234, 0.2);
        }

        .status-info {
          background: rgba(59, 130, 246, 0.1);
          color: #3b82f6;
          border: 1px solid rgba(59, 130, 246, 0.2);
        }

        .status-success {
          background: rgba(16, 185, 129, 0.1);
          color: #10b981;
          border: 1px solid rgba(16, 185, 129, 0.2);
        }

        .status-secondary {
          background: rgba(107, 114, 128, 0.1);
          color: #9ca3af;
          border: 1px solid rgba(107, 114, 128, 0.2);
        }

        .status-icon {
          font-size: 0.7rem;
        }

        .status-pulse {
          position: absolute;
          top: 2px;
          right: 2px;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
          animation: statusPulse 2s ease-in-out infinite;
        }

        @keyframes statusPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }

        /* Type Cell */
        .type-wrapper {
          min-width: 100px;
        }

        .type-badge {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 0.3rem 0.6rem;
          color: rgba(255, 255, 255, 0.8);
          font-size: 0.75rem;
          transition: all 0.3s ease;
        }

        .type-badge:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.2);
        }

        .type-icon {
          font-size: 0.7rem;
          opacity: 0.8;
        }

        .no-type {
          color: rgba(255, 255, 255, 0.4);
          text-align: center;
          font-size: 1.2rem;
        }

        /* Actions Cell */
        .actions-wrapper {
          min-width: 160px;
        }

        .action-buttons {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .action-btn {
          position: relative;
          display: flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.4rem 0.8rem;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          font-size: 0.75rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
          text-decoration: none;
          backdrop-filter: blur(10px);
          overflow: hidden;
        }

        .view-btn {
          background: rgba(102, 126, 234, 0.1);
          color: #667eea;
          border-color: rgba(102, 126, 234, 0.2);
        }

        .view-btn:hover {
          background: rgba(102, 126, 234, 0.2);
          border-color: rgba(102, 126, 234, 0.3);
          color: #667eea;
          transform: translateY(-1px);
        }

        .edit-btn {
          background: rgba(245, 158, 11, 0.1);
          color: #f59e0b;
          border-color: rgba(245, 158, 11, 0.2);
        }

        .edit-btn:hover {
          background: rgba(245, 158, 11, 0.2);
          border-color: rgba(245, 158, 11, 0.3);
          color: #f59e0b;
          transform: translateY(-1px);
        }

        .delete-btn {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
          border-color: rgba(239, 68, 68, 0.2);
        }

        .delete-btn:hover:not(:disabled) {
          background: rgba(239, 68, 68, 0.2);
          border-color: rgba(239, 68, 68, 0.3);
          transform: translateY(-1px);
        }

        .delete-confirm {
          display: flex;
          gap: 0.5rem;
          animation: slideIn 0.3s ease-out;
        }

        .confirm-delete-btn {
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444;
          border-color: rgba(239, 68, 68, 0.3);
        }

        .confirm-delete-btn:hover:not(:disabled) {
          background: rgba(239, 68, 68, 0.3);
          transform: translateY(-1px);
        }

        .cancel-delete-btn {
          background: rgba(107, 114, 128, 0.1);
          color: #9ca3af;
          border-color: rgba(107, 114, 128, 0.2);
        }

        .cancel-delete-btn:hover:not(:disabled) {
          background: rgba(107, 114, 128, 0.2);
          transform: translateY(-1px);
        }

        .action-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none !important;
        }

        .btn-text {
          display: none;
        }

        .btn-glow {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.1), transparent);
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .action-btn:hover:not(:disabled) .btn-glow {
          opacity: 1;
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        /* Responsive Design */
        @media (min-width: 1200px) {
          .btn-text {
            display: inline;
          }

          .action-btn {
            padding: 0.5rem 1rem;
          }
        }

        @media (max-width: 768px) {
          .ticket-row td {
            padding: 1rem 0.5rem;
          }

          .title-wrapper {
            min-width: unset;
          }

          .description-wrapper {
            max-width: 200px;
          }

          .assignee-wrapper,
          .priority-wrapper,
          .status-wrapper,
          .type-wrapper {
            min-width: unset;
          }

          .action-buttons {
            flex-direction: column;
            gap: 0.25rem;
          }

          .action-btn {
            padding: 0.3rem 0.6rem;
            font-size: 0.7rem;
          }
        }
      `}</style>
    </>
  );
};

export default TicketDisplay;