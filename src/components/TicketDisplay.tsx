import React, { useState } from 'react';
import Link from 'next/link';
import { Eye, Pencil, Trash2, Loader2, Check, X } from 'lucide-react';

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
    low: 'text-emerald-600 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-400/10',
    medium: 'text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-400/10',
    high: 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-400/10',
    urgent: 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-400/10',
  };

  const statusColors: Record<string, string> = {
    new: 'text-indigo-600 bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-400/10',
    open: 'text-sky-600 bg-sky-100 dark:text-sky-400 dark:bg-sky-400/10',
    in_progress: 'text-sky-600 bg-sky-100 dark:text-sky-400 dark:bg-sky-400/10',
    pending_customer: 'text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-400/10',
    resolved: 'text-emerald-600 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-400/10',
    closed: 'text-gray-500 bg-gray-100 dark:text-gray-400 dark:bg-gray-800',
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
    <tr className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${showDeleteConfirm ? 'bg-red-50 dark:bg-red-500/5' : ''}`}>
      {/* ID */}
      <td className="px-4 py-3 align-middle">
        <span className="text-gray-400 dark:text-gray-500 text-xs font-mono">{ticket.id}</span>
      </td>

      {/* Title */}
      <td className="px-4 py-3 align-middle max-w-xs">
        <Link href={`/tickets/${ticket.id}`} className="group block">
          <span className="text-gray-900 dark:text-gray-100 text-sm font-medium truncate block group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
            {ticket.title}
          </span>
          <span className="text-gray-400 dark:text-gray-500 text-xs">{formatTime(ticket.createdAt)}</span>
        </Link>
      </td>

      {/* Assignee */}
      <td className="px-4 py-3 align-middle hidden md:table-cell">
        {ticket.assigneeName ? (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-xs font-medium">
              {ticket.assigneeName.charAt(0).toUpperCase()}
            </div>
            <span className="text-gray-600 dark:text-gray-300 text-sm truncate max-w-[100px]">{ticket.assigneeName}</span>
          </div>
        ) : (
          <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>
        )}
      </td>

      {/* Reporter */}
      <td className="px-4 py-3 align-middle hidden md:table-cell">
        {ticket.reporterName ? (
          <span className="text-gray-500 dark:text-gray-400 text-sm truncate block max-w-[100px]">{ticket.reporterName}</span>
        ) : (
          <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>
        )}
      </td>

      {/* Priority */}
      <td className="px-4 py-3 align-middle">
        <span className={`inline-block text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded ${priorityColors[ticket.priority] || 'text-gray-500 bg-gray-100 dark:text-gray-400 dark:bg-gray-800'}`}>
          {ticket.priority}
        </span>
      </td>

      {/* Status */}
      <td className="px-4 py-3 align-middle">
        <span className={`inline-block text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded ${statusColors[ticket.status] || 'text-gray-500 bg-gray-100 dark:text-gray-400 dark:bg-gray-800'}`}>
          {ticket.status.replace('_', ' ')}
        </span>
      </td>

      {/* Type */}
      <td className="px-4 py-3 align-middle hidden sm:table-cell">
        {ticket.type ? (
          <span className="text-gray-400 dark:text-gray-500 text-xs">{ticket.type}</span>
        ) : (
          <span className="text-gray-300 dark:text-gray-600">—</span>
        )}
      </td>

      {/* Actions */}
      <td className="px-4 py-3 align-middle">
        <div className="flex items-center gap-1">
          {!showDeleteConfirm ? (
            <>
              <Link
                href={`/tickets/${ticket.id}`}
                className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-800 transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
              </Link>
              <Link
                href={`/tickets/${ticket.id}/edit`}
                className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-800 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
              </Link>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:text-gray-500 dark:hover:text-red-400 dark:hover:bg-red-400/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="w-7 h-7 flex items-center justify-center rounded bg-red-500 text-white"
              >
                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="w-7 h-7 flex items-center justify-center rounded bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
};

export default TicketDisplay;