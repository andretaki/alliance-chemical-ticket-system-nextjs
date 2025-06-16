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

  const handleDelete = async () => {
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      return;
    }

    setIsDeleting(true);
    try {
      await deleteTicket(ticket.id);
      // No need to call refreshTickets if the list auto-updates on deletion
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

  const priorityClasses: { [key: string]: string } = {
    low: 'bg-success-light text-success border-success-border',
    medium: 'bg-warning-light text-warning border-warning-border',
    high: 'bg-danger-light text-danger border-danger-border',
    urgent: 'bg-danger-light text-danger border-danger-border animate-pulse',
    default: 'bg-secondary-light text-secondary border-secondary-border',
  };

  const statusClasses: { [key: string]: string } = {
    new: 'bg-primary-light text-primary border-primary-border',
    open: 'bg-info-light text-info border-info-border',
    in_progress: 'bg-info-light text-info border-info-border',
    pending_customer: 'bg-warning-light text-warning border-warning-border',
    resolved: 'bg-success-light text-success border-success-border',
    closed: 'bg-secondary-light text-secondary-border',
    default: 'bg-secondary-light text-secondary-border',
  };

  const getPriorityClass = (priority: string) => priorityClasses[priority] || priorityClasses.default;
  const getStatusClass = (status: string) => statusClasses[status] || statusClasses.default;

  const getPriorityIcon = (priority: string) => {
    const icons: { [key: string]: string } = {
      low: 'fa-chevron-down',
      medium: 'fa-minus',
      high: 'fa-chevron-up',
      urgent: 'fa-exclamation-triangle',
    };
    return icons[priority] || 'fa-circle';
  };

  const getStatusIcon = (status: string) => {
    const icons: { [key: string]: string } = {
      new: 'fa-plus-circle',
      open: 'fa-clock',
      in_progress: 'fa-clock',
      pending_customer: 'fa-hourglass-half',
      resolved: 'fa-check-circle',
      closed: 'fa-times-circle',
    };
    return icons[status] || 'fa-circle';
  };

  const getTypeIcon = (type: string | null) => {
    if (!type) return 'fa-tag';
    const icons: { [key: string]: string } = {
      bug: 'fa-bug',
      feature: 'fa-star',
      support: 'fa-life-ring',
      billing: 'fa-credit-card',
      'quote request': 'fa-file-invoice-dollar',
      'order issue': 'fa-box-open',
      'shipping issue': 'fa-shipping-fast',
      'return': 'fa-undo',
    };
    return icons[type.toLowerCase()] || 'fa-tag';
  };
  
  const formatRelativeTime = (date: Date) => {
    try {
      const now = new Date();
      const diffInMs = now.getTime() - date.getTime();
      const diffInSeconds = Math.floor(diffInMs / 1000);
      const diffInMinutes = Math.floor(diffInSeconds / 60);
      const diffInHours = Math.floor(diffInMinutes / 60);
      const diffInDays = Math.floor(diffInHours / 24);

      if (diffInSeconds < 60) return 'just now';
      if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
      if (diffInHours < 24) return `${diffInHours}h ago`;
      if (diffInDays < 7) return `${diffInDays}d ago`;
      return date.toLocaleDateString();
    } catch {
      return 'Invalid date';
    }
  };

  return (
    <tr 
      className={`transition-all duration-300 ease-in-out border-b border-white/5 backdrop-blur-sm 
        ${showDeleteConfirm ? 'bg-danger/10' : 'bg-white/5 hover:bg-white/10'}`
      }
    >
      {/* ID */}
      <td className="p-3 align-middle">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 bg-primary/10 border border-primary/20 rounded-md px-2 py-1 text-xs font-semibold text-primary">
            <span className="opacity-70">#</span>
            <span>{ticket.id}</span>
          </span>
          {ticket.isFromEmail && (
            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-success/10 border border-success/20 text-success text-xs animate-pulse" title="Created from email">
              <i className="fas fa-envelope" />
            </div>
          )}
        </div>
      </td>

      {/* Title */}
      <td className="p-3 align-middle max-w-md xl:max-w-lg">
        <div className="flex flex-col gap-1">
          <Link href={`/tickets/${ticket.id}`} className="group">
            <h4 className="font-semibold text-white truncate group-hover:text-primary transition-colors">
              {ticket.title}
            </h4>
            <div className="h-0.5 bg-gradient-to-r from-primary to-primary-hover w-0 group-hover:w-full transition-all duration-300" />
          </Link>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-muted">
            <span className="flex items-center gap-1">
              <i className="fas fa-clock fa-fw" />
              {formatRelativeTime(ticket.createdAt)}
            </span>
            {ticket.orderNumber && (
              <span className="flex items-center gap-1 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">
                <i className="fas fa-shopping-cart fa-fw" />
                {ticket.orderNumber}
              </span>
            )}
            {ticket.trackingNumber && (
              <span className="flex items-center gap-1 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">
                <i className="fas fa-shipping-fast fa-fw" />
                {ticket.trackingNumber}
              </span>
            )}
          </div>
        </div>
      </td>

      {/* Description */}
      {/*
      <td className="p-3 align-middle max-w-sm hidden lg:table-cell">
        <p className="text-sm text-foreground-muted line-clamp-2">
          {ticket.description?.replace(/<[^>]*>/g, '') || 'No description'}
        </p>
      </td>
       */}
      
      {/* Assignee */}
      <td className="p-3 align-middle hidden md:table-cell">
        {ticket.assigneeName ? (
          <div className="flex items-center gap-2" title={ticket.assigneeEmail || ''}>
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary-hover text-white font-semibold text-sm shadow-md">
              {ticket.assigneeName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-medium text-white text-sm truncate max-w-[120px]">{ticket.assigneeName}</p>
            </div>
          </div>
        ) : (
          <span className="inline-flex items-center gap-2 text-xs font-medium bg-white/10 text-foreground-muted px-2 py-1 rounded-full">
            <i className="fas fa-user-slash" />
            Unassigned
          </span>
        )}
      </td>

      {/* Reporter (Customer) */}
      <td className="p-3 align-middle hidden md:table-cell">
        {ticket.reporterName ? (
          <div className="flex items-center gap-2" title={ticket.reporterEmail || ''}>
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-secondary to-secondary-hover text-white font-semibold text-sm shadow-md">
              {ticket.reporterName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-medium text-white text-sm truncate max-w-[120px]">{ticket.reporterName}</p>
            </div>
          </div>
        ) : (
          <span className="text-foreground-subtle">—</span>
        )}
      </td>

      {/* Priority */}
      <td className="p-3 align-middle">
        <span className={`inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${getPriorityClass(ticket.priority)}`}>
          <i className={`fas ${getPriorityIcon(ticket.priority)} text-xs`} />
          {ticket.priority}
        </span>
      </td>

      {/* Status */}
      <td className="p-3 align-middle">
        <span className={`inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${getStatusClass(ticket.status)}`}>
          <i className={`fas ${getStatusIcon(ticket.status)} text-xs`} />
          {ticket.status.replace('_', ' ')}
        </span>
      </td>

      {/* Type */}
      <td className="p-3 align-middle hidden sm:table-cell">
        {ticket.type ? (
          <span className="inline-flex items-center gap-2 text-xs font-medium bg-white/5 border border-white/10 text-foreground-muted px-2 py-1 rounded-md">
            <i className={`fas ${getTypeIcon(ticket.type)} fa-fw`} />
            {ticket.type}
          </span>
        ) : (
          <span className="text-foreground-subtle">—</span>
        )}
      </td>

      {/* Actions */}
      <td className="p-3 align-middle">
        <div className="flex items-center gap-2">
          {!showDeleteConfirm ? (
            <>
              <Link href={`/tickets/${ticket.id}`} className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors" title="View">
                <i className="fas fa-eye" />
              </Link>
              <Link href={`/tickets/${ticket.id}/edit`} className="flex items-center justify-center w-8 h-8 rounded-md bg-warning/10 text-warning hover:bg-warning/20 transition-colors" title="Edit">
                <i className="fas fa-edit" />
              </Link>
              <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center justify-center w-8 h-8 rounded-md bg-danger/10 text-danger hover:bg-danger/20 transition-colors" title="Delete">
                <i className="fas fa-trash" />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-1 p-1 rounded-md bg-danger/20 border border-danger/30">
              <button onClick={handleDelete} disabled={isDeleting} className="flex items-center justify-center w-7 h-7 rounded-md bg-danger/80 text-white hover:bg-danger" title="Confirm Delete">
                {isDeleting ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-check" />}
              </button>
              <button onClick={cancelDelete} disabled={isDeleting} className="flex items-center justify-center w-7 h-7 rounded-md bg-white/10 text-white hover:bg-white/20" title="Cancel">
                <i className="fas fa-times" />
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
};

export default TicketDisplay;