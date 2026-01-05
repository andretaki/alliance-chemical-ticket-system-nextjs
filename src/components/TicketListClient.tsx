'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useSession } from '@/lib/auth-client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StatusBadge, PriorityBadge, PriorityDot } from '@/components/StatusBadge';
import { useKeyboardShortcuts } from '@/components/KeyboardShortcuts';
import {
  Search,
  Plus,
  Filter,
  SlidersHorizontal,
  ArrowUpDown,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  UserPlus,
  CheckCircle,
  XCircle,
  RefreshCw,
  Inbox,
  User,
  Users,
  Clock,
  AlertCircle,
  ChevronDown,
  X,
  Save,
  Star,
} from 'lucide-react';
import { ticketStatusEnum, ticketPriorityEnum } from '@/db/schema';

interface TicketListEntry {
  id: number;
  title: string;
  status: string;
  priority: string;
  type?: string | null;
  createdAt: string;
  updatedAt: string;
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
  senderEmail?: string | null;
}

interface User {
  id: string;
  name: string | null;
  email: string;
}

interface TicketListClientProps {
  limit?: number;
  showSearch?: boolean;
}

type FilterPreset = 'all' | 'my_tickets' | 'unassigned';

// Bulletproof ticket extraction - handles any API shape
function normalizeTickets(payload: any): TicketListEntry[] {
  const candidate =
    payload?.data?.tickets ??
    payload?.data?.data ??
    payload?.tickets ??
    payload?.data;

  if (Array.isArray(candidate)) return candidate;
  if (Array.isArray(candidate?.data)) return candidate.data;
  if (Array.isArray(candidate?.tickets)) return candidate.tickets;

  return [];
}

// Time ago helper
function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Ticket Row Component
function TicketRow({
  ticket,
  onDelete,
  isDeleting,
  isSelected,
  rowRef,
}: {
  ticket: TicketListEntry;
  onDelete: (id: number) => void;
  isDeleting: boolean;
  isSelected?: boolean;
  rowRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <>
      <div
        ref={rowRef}
        className={cn(
          'group flex items-center gap-4 border-b border-gray-100 px-4 py-3 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50',
          isDeleting && 'pointer-events-none opacity-50',
          isSelected && 'bg-indigo-50 border-l-2 border-l-indigo-500 dark:bg-indigo-900/20'
        )}
      >
        {/* Priority Indicator */}
        <PriorityDot priority={ticket.priority as any} />

        {/* ID */}
        <span className="w-12 flex-shrink-0 font-mono text-xs text-gray-400 dark:text-gray-500">#{ticket.id}</span>

        {/* Title & Meta */}
        <div className="min-w-0 flex-1">
          <Link
            href={`/tickets/${ticket.id}`}
            className="block truncate text-sm font-medium text-gray-800 transition-colors hover:text-indigo-600 dark:text-gray-200 dark:hover:text-indigo-400"
          >
            {ticket.title}
          </Link>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span className="truncate">{ticket.senderEmail || ticket.reporterName || 'Unknown'}</span>
            {ticket.type && (
              <>
                <span>·</span>
                <span className="truncate">{ticket.type}</span>
              </>
            )}
          </div>
        </div>

        {/* Status Badge */}
        <div className="hidden w-28 flex-shrink-0 sm:block">
          <StatusBadge status={ticket.status as any} size="sm" />
        </div>

        {/* Priority Badge */}
        <div className="hidden w-24 flex-shrink-0 md:block">
          <PriorityBadge priority={ticket.priority as any} size="sm" showIcon={false} />
        </div>

        {/* Assignee */}
        <div className="hidden w-32 flex-shrink-0 lg:block">
          {ticket.assigneeName ? (
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="bg-indigo-100 text-[10px] text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                  {ticket.assigneeName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="truncate text-xs text-gray-600 dark:text-gray-300">{ticket.assigneeName}</span>
            </div>
          ) : (
            <span className="text-xs text-gray-400 dark:text-gray-500">Unassigned</span>
          )}
        </div>

        {/* Time */}
        <div className="w-16 flex-shrink-0 text-right">
          <span className="text-xs text-gray-400 dark:text-gray-500">{timeAgo(ticket.updatedAt)}</span>
        </div>

        {/* Actions */}
        <div className="w-8 flex-shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <MoreHorizontal className="h-4 w-4 text-gray-400 dark:text-gray-500" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild>
                <Link href={`/tickets/${ticket.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  View Details
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/tickets/${ticket.id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowDeleteConfirm(true)}
                className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Ticket</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete ticket #{ticket.id}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                onDelete(ticket.id);
                setShowDeleteConfirm(false);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Saved filter type
interface SavedFilter {
  id: string;
  name: string;
  status: string[];
  priority: string[];
  preset: FilterPreset;
}

const SAVED_FILTERS_KEY = 'ticket-saved-filters';

export default function TicketListClient({ limit, showSearch = true }: TicketListClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useSession();
  const { selectedIndex, setSelectedIndex } = useKeyboardShortcuts();

  const [tickets, setTickets] = useState<TicketListEntry[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [activePreset, setActivePreset] = useState<FilterPreset>('my_tickets');
  const [sortBy, setSortBy] = useState('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Saved filters
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newFilterName, setNewFilterName] = useState('');

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const selectedRowRef = useRef<HTMLDivElement>(null);
  const isEmbedded = !!limit;

  // Load saved filters from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SAVED_FILTERS_KEY);
      if (saved) {
        setSavedFilters(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Failed to load saved filters', e);
    }
  }, []);

  // Keyboard navigation - listen for open ticket event
  useEffect(() => {
    const handleOpenTicket = () => {
      if (selectedIndex >= 0 && selectedIndex < tickets.length) {
        const ticket = tickets[selectedIndex];
        router.push(`/tickets/${ticket.id}`);
      }
    };

    window.addEventListener('keyboard-open-ticket', handleOpenTicket);
    return () => window.removeEventListener('keyboard-open-ticket', handleOpenTicket);
  }, [selectedIndex, tickets, router]);

  // Scroll selected row into view
  useEffect(() => {
    if (selectedRowRef.current) {
      selectedRowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex]);

  // Clamp selected index to valid range
  useEffect(() => {
    if (selectedIndex >= tickets.length) {
      setSelectedIndex(Math.max(-1, tickets.length - 1));
    }
  }, [tickets.length, selectedIndex, setSelectedIndex]);

  // Fetch tickets
  const fetchTickets = useCallback(
    async (options: { refresh?: boolean } = {}) => {
      if (options.refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams();

        // Apply status filter
        if (statusFilter.length > 0) {
          params.append('status', statusFilter.join(','));
        }

        // Apply priority filter
        if (priorityFilter.length > 0) {
          params.append('priority', priorityFilter.join(','));
        }

        // Apply preset filters
        if (activePreset === 'my_tickets' && session?.data?.user?.id) {
          params.append('assigneeId', session.data.user.id);
        } else if (activePreset === 'unassigned') {
          params.append('assigneeId', 'unassigned');
        }

        // Search
        if (searchTerm.trim()) {
          params.append('search', searchTerm.trim());
        }

        // Sort
        params.append('sortBy', sortBy);
        params.append('sortOrder', sortOrder);

        const res = await fetch(`/api/tickets?${params.toString()}`);
        const payload = await res.json();

        // Use bulletproof normalizer to extract tickets array
        let fetchedTickets = normalizeTickets(payload);

        // Apply limit if embedded
        if (limit && limit > 0) {
          fetchedTickets = fetchedTickets.slice(0, limit);
        }

        setTickets(fetchedTickets);
      } catch (err) {
        console.error('Error fetching tickets:', err);
        setError('Failed to load tickets');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [statusFilter, priorityFilter, activePreset, session?.data?.user?.id, searchTerm, sortBy, sortOrder, limit]
  );

  // Initial load and periodic refresh
  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Fetch users for assignee filter
  useEffect(() => {
    if (!isEmbedded) {
      fetch('/api/users')
        .then((res) => res.json())
        .then(setUsers)
        .catch(console.error);
    }
  }, [isEmbedded]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      fetchTickets();
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  // Delete handler
  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await fetch(`/api/tickets/${id}`, { method: 'DELETE' });
      setTickets((prev) => prev.filter((t) => t.id !== id));
      toast.success(`Ticket #${id} deleted`);
    } catch (err) {
      console.error('Failed to delete ticket:', err);
      toast.error('Failed to delete ticket');
      setError('Failed to delete ticket');
    } finally {
      setDeletingId(null);
    }
  };

  // Clear all filters
  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter([]);
    setPriorityFilter([]);
    setActivePreset('all');
    toast.info('Filters cleared');
  };

  // Save current filters
  const saveCurrentFilter = () => {
    if (!newFilterName.trim()) return;

    const newFilter: SavedFilter = {
      id: Date.now().toString(),
      name: newFilterName.trim(),
      status: statusFilter,
      priority: priorityFilter,
      preset: activePreset,
    };

    const updated = [...savedFilters, newFilter];
    setSavedFilters(updated);
    localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(updated));
    setShowSaveDialog(false);
    setNewFilterName('');
    toast.success(`Filter "${newFilter.name}" saved`);
  };

  // Apply saved filter
  const applySavedFilter = (filter: SavedFilter) => {
    setStatusFilter(filter.status);
    setPriorityFilter(filter.priority);
    setActivePreset(filter.preset);
    toast.info(`Applied filter: ${filter.name}`);
  };

  // Delete saved filter
  const deleteSavedFilter = (id: string) => {
    const updated = savedFilters.filter(f => f.id !== id);
    setSavedFilters(updated);
    localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(updated));
    toast.success('Filter deleted');
  };

  const hasActiveFilters = searchTerm || statusFilter.length > 0 || priorityFilter.length > 0;

  // Loading state
  if (isLoading && tickets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-indigo-500 dark:border-gray-700" />
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Loading tickets...</p>
      </div>
    );
  }

  // Embedded mode (simple list)
  if (isEmbedded) {
    return (
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {tickets.length === 0 ? (
          <div className="py-12 text-center">
            <Inbox className="mx-auto mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-500 dark:text-gray-400">No tickets found</p>
          </div>
        ) : (
          tickets.map((ticket) => (
            <TicketRow
              key={ticket.id}
              ticket={ticket}
              onDelete={handleDelete}
              isDeleting={deletingId === ticket.id}
            />
          ))
        )}
      </div>
    );
  }

  // Full page mode
  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Tickets</h1>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {tickets.length} ticket{tickets.length !== 1 ? 's' : ''}
              {hasActiveFilters && ' (filtered)'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchTickets({ refresh: true })}
              disabled={isRefreshing}
              className="gap-2"
            >
              <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
              Refresh
            </Button>
            <Button size="sm" className="gap-2 bg-indigo-600 hover:bg-indigo-500" asChild>
              <Link href="/tickets/create">
                <Plus className="h-4 w-4" />
                New Ticket
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="border-b border-gray-200 px-6 py-3 dark:border-gray-700">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <Input
              placeholder="Search tickets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 pl-9"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Preset Tabs */}
          <Tabs value={activePreset} onValueChange={(v) => setActivePreset(v as FilterPreset)}>
            <TabsList className="h-9 p-1">
              <TabsTrigger
                value="my_tickets"
                className="gap-1.5 text-xs"
              >
                <User className="h-3.5 w-3.5" />
                My Tickets
              </TabsTrigger>
              <TabsTrigger
                value="unassigned"
                className="gap-1.5 text-xs"
              >
                <AlertCircle className="h-3.5 w-3.5" />
                Unassigned
              </TabsTrigger>
              <TabsTrigger
                value="all"
                className="gap-1.5 text-xs"
              >
                <Inbox className="h-3.5 w-3.5" />
                All
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Status Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  'h-9 gap-2',
                  statusFilter.length > 0 && 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
                )}
              >
                Status
                {statusFilter.length > 0 && (
                  <Badge variant="outline" className="ml-1 h-5 px-1.5 text-[10px]">
                    {statusFilter.length}
                  </Badge>
                )}
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48">
              <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {ticketStatusEnum.enumValues.map((status) => (
                <DropdownMenuCheckboxItem
                  key={status}
                  checked={statusFilter.includes(status)}
                  onCheckedChange={(checked) => {
                    setStatusFilter((prev) =>
                      checked ? [...prev, status] : prev.filter((s) => s !== status)
                    );
                  }}
                >
                  {status.replace(/_/g, ' ')}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Priority Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  'h-9 gap-2',
                  priorityFilter.length > 0 && 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
                )}
              >
                Priority
                {priorityFilter.length > 0 && (
                  <Badge variant="outline" className="ml-1 h-5 px-1.5 text-[10px]">
                    {priorityFilter.length}
                  </Badge>
                )}
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48">
              <DropdownMenuLabel>Filter by priority</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {ticketPriorityEnum.enumValues.map((priority) => (
                <DropdownMenuCheckboxItem
                  key={priority}
                  checked={priorityFilter.includes(priority)}
                  onCheckedChange={(checked) => {
                    setPriorityFilter((prev) =>
                      checked ? [...prev, priority] : prev.filter((p) => p !== priority)
                    );
                  }}
                >
                  <PriorityDot priority={priority as any} className="mr-2" />
                  {priority}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Sort */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-2"
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
                Sort
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Sort by</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {[
                { value: 'updatedAt', label: 'Last Updated' },
                { value: 'createdAt', label: 'Created Date' },
                { value: 'priority', label: 'Priority' },
                { value: 'status', label: 'Status' },
              ].map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => {
                    if (sortBy === option.value) {
                      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                    } else {
                      setSortBy(option.value);
                      setSortOrder('desc');
                    }
                  }}
                >
                  {option.label}
                  {sortBy === option.value && (
                    <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
                      {sortOrder === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Saved Filters */}
          {savedFilters.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-2"
                >
                  <Star className="h-3.5 w-3.5" />
                  Saved
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Saved Filters</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {savedFilters.map((filter) => (
                  <DropdownMenuItem
                    key={filter.id}
                    className="flex items-center justify-between"
                  >
                    <span onClick={() => applySavedFilter(filter)} className="flex-1 cursor-pointer">
                      {filter.name}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSavedFilter(filter.id);
                      }}
                      className="ml-2 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Save Filter */}
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSaveDialog(true)}
              className="h-9 gap-1.5"
            >
              <Save className="h-3.5 w-3.5" />
              Save
            </Button>
          )}

          {/* Clear Filters */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-9 gap-1.5"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Save Filter Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Filter</DialogTitle>
            <DialogDescription>
              Save the current filter settings for quick access later.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Filter name (e.g. 'Urgent Open')"
              value={newFilterName}
              onChange={(e) => setNewFilterName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveCurrentFilter()}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowSaveDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={saveCurrentFilter}
              disabled={!newFilterName.trim()}
              className="bg-indigo-600 hover:bg-indigo-500"
            >
              Save Filter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Error State */}
      {error && (
        <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          <AlertCircle className="h-4 w-4" />
          {error}
          <button onClick={() => fetchTickets()} className="ml-auto text-xs underline hover:no-underline">
            Retry
          </button>
        </div>
      )}

      {/* Table Header */}
      <div className="flex items-center gap-4 border-b border-gray-200 bg-gray-50 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
        <div className="w-4" /> {/* Priority dot */}
        <div className="w-12">ID</div>
        <div className="flex-1">Title</div>
        <div className="hidden w-28 sm:block">Status</div>
        <div className="hidden w-24 md:block">Priority</div>
        <div className="hidden w-32 lg:block">Assignee</div>
        <div className="w-16 text-right">Updated</div>
        <div className="w-8" /> {/* Actions */}
      </div>

      {/* Ticket List */}
      <ScrollArea className="flex-1">
        {isRefreshing && (
          <div className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-indigo-100 dark:bg-indigo-900/30">
            <div className="h-full w-1/3 animate-[shimmer_1s_ease-in-out_infinite] bg-indigo-500" />
          </div>
        )}

        {tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Inbox className="mb-4 h-12 w-12 text-gray-300 dark:text-gray-600" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No tickets found</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {hasActiveFilters ? 'Try adjusting your filters' : 'Create a new ticket to get started'}
            </p>
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearFilters}
                className="mt-4"
              >
                Clear Filters
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {tickets.map((ticket, index) => (
              <TicketRow
                key={ticket.id}
                ticket={ticket}
                onDelete={handleDelete}
                isDeleting={deletingId === ticket.id}
                isSelected={selectedIndex === index}
                rowRef={selectedIndex === index ? selectedRowRef : undefined}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
