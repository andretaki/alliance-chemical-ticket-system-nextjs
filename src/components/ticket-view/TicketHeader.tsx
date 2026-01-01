'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { StatusBadge, PriorityBadge } from '@/components/StatusBadge';
import {
  ArrowLeft,
  MoreHorizontal,
  Pencil,
  Trash2,
  UserPlus,
  CheckCircle,
  XCircle,
  Sparkles,
  Package,
  Clock,
  Mail,
  Copy,
  ExternalLink,
  ChevronDown,
  Loader2,
} from 'lucide-react';

type TicketStatus = 'new' | 'open' | 'in_progress' | 'pending_customer' | 'closed';
type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

interface TicketHeaderProps {
  ticket: {
    id: number;
    title: string;
    status: TicketStatus;
    priority: TicketPriority;
    senderEmail?: string | null;
    senderName?: string | null;
    orderNumber?: string | null;
    assignee?: { id: string; name: string | null; email: string | null } | null;
    createdAt: string;
    updatedAt: string;
  };
  currentUser: { id: string; name: string | null; email: string | null };
  onStatusChange: (status: TicketStatus) => void;
  onPriorityChange?: (priority: TicketPriority) => void;
  onAssigneeChange: (assigneeId: string | null, assignee: any) => void;
  onDraftReply: () => void;
  onCheckOrderStatus: () => void;
  isLoadingAI: boolean;
  users?: Array<{ id: string; name: string | null; email: string }>;
}

const statusOptions: { value: TicketStatus; label: string; icon: React.ElementType }[] = [
  { value: 'new', label: 'New', icon: Clock },
  { value: 'open', label: 'Open', icon: Mail },
  { value: 'in_progress', label: 'In Progress', icon: Clock },
  { value: 'pending_customer', label: 'Pending Customer', icon: Clock },
  { value: 'closed', label: 'Closed', icon: CheckCircle },
];

const priorityOptions: { value: TicketPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export function TicketHeader({
  ticket,
  currentUser,
  onStatusChange,
  onPriorityChange,
  onAssigneeChange,
  onDraftReply,
  onCheckOrderStatus,
  isLoadingAI,
  users = [],
}: TicketHeaderProps) {
  const [copied, setCopied] = useState(false);

  const copyTicketId = () => {
    navigator.clipboard.writeText(`#${ticket.id}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const timeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(hours / 24);

    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <TooltipProvider>
      <div className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/tickets"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </TooltipTrigger>
              <TooltipContent>Back to Tickets</TooltipContent>
            </Tooltip>

            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={copyTicketId}
                    className="font-mono text-sm text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                  >
                    #{ticket.id}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{copied ? 'Copied!' : 'Click to copy'}</TooltipContent>
              </Tooltip>

              {/* Status Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="group flex items-center gap-1">
                    <StatusBadge status={ticket.status} />
                    <ChevronDown className="h-3 w-3 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-gray-600" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-48 border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                  <DropdownMenuLabel className="text-gray-500 dark:text-gray-400">Change Status</DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-gray-100 dark:bg-gray-700" />
                  {statusOptions.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      onClick={() => onStatusChange(option.value)}
                      className={cn(
                        'text-gray-700 focus:bg-gray-100 focus:text-gray-900 dark:text-gray-300 dark:focus:bg-gray-700 dark:focus:text-white',
                        ticket.status === option.value && 'bg-gray-50 dark:bg-gray-700/50'
                      )}
                    >
                      <StatusBadge status={option.value} size="sm" />
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Priority Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="group flex items-center gap-1">
                    <PriorityBadge priority={ticket.priority} size="sm" />
                    <ChevronDown className="h-3 w-3 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-gray-600" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-40 border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                  <DropdownMenuLabel className="text-gray-500 dark:text-gray-400">Change Priority</DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-gray-100 dark:bg-gray-700" />
                  {priorityOptions.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      onClick={() => onPriorityChange?.(option.value)}
                      className={cn(
                        'text-gray-700 focus:bg-gray-100 focus:text-gray-900 dark:text-gray-300 dark:focus:bg-gray-700 dark:focus:text-white',
                        ticket.priority === option.value && 'bg-gray-50 dark:bg-gray-700/50'
                      )}
                    >
                      <PriorityBadge priority={option.value} size="sm" />
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* AI Draft Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onDraftReply}
                  disabled={isLoadingAI}
                  className="gap-2 border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  {isLoadingAI ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
                  )}
                  AI Draft
                </Button>
              </TooltipTrigger>
              <TooltipContent>Generate AI-powered reply suggestion</TooltipContent>
            </Tooltip>

            {/* Order Status Button */}
            {ticket.orderNumber && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onCheckOrderStatus}
                    disabled={isLoadingAI}
                    className="gap-2 border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <Package className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
                    Order
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Check order #{ticket.orderNumber}</TooltipContent>
              </Tooltip>
            )}

            {/* Edit Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="gap-2 border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <Link href={`/tickets/${ticket.id}/edit`}>
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit ticket details</TooltipContent>
            </Tooltip>

            {/* More Actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 border-gray-200 bg-white p-0 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                <DropdownMenuItem className="text-gray-700 focus:bg-gray-100 focus:text-gray-900 dark:text-gray-300 dark:focus:bg-gray-700 dark:focus:text-white">
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Link
                </DropdownMenuItem>
                <DropdownMenuItem className="text-gray-700 focus:bg-gray-100 focus:text-gray-900 dark:text-gray-300 dark:focus:bg-gray-700 dark:focus:text-white">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open in New Tab
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-gray-100 dark:bg-gray-700" />
                <DropdownMenuItem className="text-red-600 focus:bg-red-50 focus:text-red-700 dark:text-red-400 dark:focus:bg-red-900/20 dark:focus:text-red-400">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Ticket
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Title & Meta */}
        <div className="px-5 pb-4">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">{ticket.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
            {/* Sender */}
            <div className="flex items-center gap-2">
              <Avatar className="h-5 w-5">
                <AvatarFallback className="bg-gray-100 text-[10px] text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                  {(ticket.senderName || ticket.senderEmail || 'U').charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span>{ticket.senderName || ticket.senderEmail || 'Unknown'}</span>
            </div>

            <span className="text-gray-300 dark:text-gray-600">·</span>

            {/* Created time */}
            <span>{timeAgo(ticket.createdAt)}</span>

            <span className="text-gray-300 dark:text-gray-600">·</span>

            {/* Assignee */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="group flex items-center gap-2 transition-colors hover:text-gray-700 dark:hover:text-gray-200">
                  {ticket.assignee ? (
                    <>
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="bg-indigo-100 text-[10px] text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                          {ticket.assignee.name?.charAt(0).toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <span>{ticket.assignee.name || 'Assigned'}</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                      <span className="text-amber-500 dark:text-amber-400">Unassigned</span>
                    </>
                  )}
                  <ChevronDown className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56 border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                <DropdownMenuLabel className="text-gray-500 dark:text-gray-400">Assign to</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-gray-100 dark:bg-gray-700" />
                <DropdownMenuItem
                  onClick={() => onAssigneeChange(currentUser.id, currentUser)}
                  className="text-gray-700 focus:bg-gray-100 focus:text-gray-900 dark:text-gray-300 dark:focus:bg-gray-700 dark:focus:text-white"
                >
                  <Avatar className="mr-2 h-5 w-5">
                    <AvatarFallback className="bg-indigo-100 text-[10px] text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                      {currentUser.name?.charAt(0).toUpperCase() || 'M'}
                    </AvatarFallback>
                  </Avatar>
                  Assign to me
                </DropdownMenuItem>
                {ticket.assignee && (
                  <DropdownMenuItem
                    onClick={() => onAssigneeChange(null, null)}
                    className="text-gray-700 focus:bg-gray-100 focus:text-gray-900 dark:text-gray-300 dark:focus:bg-gray-700 dark:focus:text-white"
                  >
                    <XCircle className="mr-2 h-4 w-4 text-gray-400 dark:text-gray-500" />
                    Unassign
                  </DropdownMenuItem>
                )}
                {users.length > 0 && (
                  <>
                    <DropdownMenuSeparator className="bg-gray-100 dark:bg-gray-700" />
                    {users.slice(0, 5).map((user) => (
                      <DropdownMenuItem
                        key={user.id}
                        onClick={() => onAssigneeChange(user.id, user)}
                        className={cn(
                          'text-gray-700 focus:bg-gray-100 focus:text-gray-900 dark:text-gray-300 dark:focus:bg-gray-700 dark:focus:text-white',
                          ticket.assignee?.id === user.id && 'bg-gray-50 dark:bg-gray-700/50'
                        )}
                      >
                        <Avatar className="mr-2 h-5 w-5">
                          <AvatarFallback className="bg-gray-100 text-[10px] text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                            {user.name?.charAt(0).toUpperCase() || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        {user.name || user.email}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
