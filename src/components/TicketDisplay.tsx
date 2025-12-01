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

const TicketDisplay: React.FC<TicketDisplayProps> = ({ ticket, deleteTicket }) => {
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
    } catch (error) {
      console.error('Failed to delete ticket:', error);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const priorityColors: Record<string, string> = {
    low: 'text-emerald-400 bg-emerald-400/10',
    medium: 'text-amber-400 bg-amber-400/10',
    high: 'text-red-400 bg-red-400/10',
    urgent: 'text-red-400 bg-red-400/10',
  };

  const statusColors: Record<string, string> = {
    new: 'text-indigo-400 bg-indigo-400/10',
    open: 'text-sky-400 bg-sky-400/10',
    in_progress: 'text-sky-400 bg-sky-400/10',
    pending_customer: 'text-amber-400 bg-amber-400/10',
    resolved: 'text-emerald-400 bg-emerald-400/10',
    closed: 'text-white/40 bg-white/5',
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (mins < 60) return `${mins}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <tr className={`hover:bg-white/[0.02] transition-colors ${showDeleteConfirm ? 'bg-red-500/5' : ''}`}>
      {/* ID */}
      <td className="px-4 py-3 align-middle">
        <span className="text-white/40 text-xs font-mono">{ticket.id}</span>
      </td>

      {/* Title */}
      <td className="px-4 py-3 align-middle max-w-xs">
        <Link href={`/tickets/${ticket.id}`} className="group block">
          <span className="text-white/90 text-sm font-medium truncate block group-hover:text-indigo-400 transition-colors">
            {ticket.title}
          </span>
          <span className="text-white/30 text-xs">{formatTime(ticket.createdAt)}</span>
        </Link>
      </td>

      {/* Assignee */}
      <td className="px-4 py-3 align-middle hidden md:table-cell">
        {ticket.assigneeName ? (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 text-xs font-medium">
              {ticket.assigneeName.charAt(0).toUpperCase()}
            </div>
            <span className="text-white/70 text-sm truncate max-w-[100px]">{ticket.assigneeName}</span>
          </div>
        ) : (
          <span className="text-white/30 text-xs">—</span>
        )}
      </td>

      {/* Reporter */}
      <td className="px-4 py-3 align-middle hidden md:table-cell">
        {ticket.reporterName ? (
          <span className="text-white/60 text-sm truncate block max-w-[100px]">{ticket.reporterName}</span>
        ) : (
          <span className="text-white/30 text-xs">—</span>
        )}
      </td>

      {/* Priority */}
      <td className="px-4 py-3 align-middle">
        <span className={`inline-block text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded ${priorityColors[ticket.priority] || 'text-white/40 bg-white/5'}`}>
          {ticket.priority}
        </span>
      </td>

      {/* Status */}
      <td className="px-4 py-3 align-middle">
        <span className={`inline-block text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded ${statusColors[ticket.status] || 'text-white/40 bg-white/5'}`}>
          {ticket.status.replace('_', ' ')}
        </span>
      </td>

      {/* Type */}
      <td className="px-4 py-3 align-middle hidden sm:table-cell">
        {ticket.type ? (
          <span className="text-white/40 text-xs">{ticket.type}</span>
        ) : (
          <span className="text-white/20">—</span>
        )}
      </td>

      {/* Actions */}
      <td className="px-4 py-3 align-middle">
        <div className="flex items-center gap-1">
          {!showDeleteConfirm ? (
            <>
              <Link
                href={`/tickets/${ticket.id}`}
                className="w-7 h-7 flex items-center justify-center rounded text-white/40 hover:text-white/70 hover:bg-white/[0.04] transition-colors"
              >
                <i className="fas fa-eye text-xs" />
              </Link>
              <Link
                href={`/tickets/${ticket.id}/edit`}
                className="w-7 h-7 flex items-center justify-center rounded text-white/40 hover:text-white/70 hover:bg-white/[0.04] transition-colors"
              >
                <i className="fas fa-pen text-xs" />
              </Link>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-7 h-7 flex items-center justify-center rounded text-white/40 hover:text-red-400 hover:bg-red-400/10 transition-colors"
              >
                <i className="fas fa-trash text-xs" />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="w-7 h-7 flex items-center justify-center rounded bg-red-500 text-white text-xs"
              >
                {isDeleting ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-check" />}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="w-7 h-7 flex items-center justify-center rounded bg-white/10 text-white/70 text-xs"
              >
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