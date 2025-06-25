'use client';

import React, { useState, useEffect, useCallback, ChangeEvent, FormEvent, useRef } from 'react';
import axios, { AxiosError } from 'axios';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import TicketDisplay from './TicketDisplay';
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

interface DebounceTimeoutRef extends NodeJS.Timeout {}
type FilterPreset = 'all' | 'my_tickets' | 'unassigned';

export default function TicketListClient({ limit, showSearch = true }: TicketListClientProps) {
  const [tickets, setTickets] = useState<TicketListEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isApplyingFilters, setIsApplyingFilters] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const { data: session } = useSession();
  const [realtimeStatus, setRealtimeStatus] = useState<'polling' | 'sse' | 'disabled'>('polling');

  // Filter states
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [activeFilterPreset, setActiveFilterPreset] = useState<FilterPreset>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Sorting states
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // View mode state
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');

  const debounceTimeoutRef = useRef<DebounceTimeoutRef | null>(null);
  const previousSearchTermRef = useRef<string>('');
  const isInitialMount = useRef(true);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchTickets = useCallback(async (options: { backgroundRefresh?: boolean } = {}) => {
    const { backgroundRefresh = false } = options;

    if (!backgroundRefresh) {
      setIsLoading(true);
      setIsApplyingFilters(true);
    }
    setError(null);

    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (priorityFilter) params.append('priority', priorityFilter);
      if (activeFilterPreset === 'my_tickets' && session?.user?.id) {
        params.append('assigneeId', session.user.id);
      } else if (activeFilterPreset === 'unassigned') {
        params.append('assigneeId', 'unassigned');
      } else if (assigneeFilter) {
        params.append('assigneeId', assigneeFilter);
      }

      if (searchTerm.trim()) params.append('search', searchTerm.trim());
      params.append('sortBy', sortBy);
      params.append('sortOrder', sortOrder);

      const response = await axios.get<{ data: TicketListEntry[] }>(`/api/tickets?${params.toString()}`);
      let fetchedTickets = response.data.data;

      if (limit && limit > 0 && !statusFilter && !priorityFilter && !assigneeFilter && !searchTerm.trim()) {
        fetchedTickets = fetchedTickets.slice(0, limit);
      }
      setTickets(fetchedTickets);
    } catch (err) {
      console.error('Error fetching tickets:', err);
      setError('Failed to load tickets. Please try again.');
    } finally {
      if (!backgroundRefresh) {
        setIsLoading(false);
        setIsApplyingFilters(false);
      }
    }
  }, [statusFilter, priorityFilter, assigneeFilter, activeFilterPreset, session, searchTerm, sortBy, sortOrder, limit]);

  const fetchTicketsRef = useRef(fetchTickets);
  fetchTicketsRef.current = fetchTickets;

  useEffect(() => {
    let pollInterval: NodeJS.Timeout;

    console.log('Using polling for ticket updates (2 minutes interval).');
    setRealtimeStatus('polling');
    
    pollInterval = setInterval(() => {
      console.log('Polling for ticket updates...');
      fetchTicketsRef.current({ backgroundRefresh: true });
    }, 120000);

    return () => {
      console.log('Cleaning up polling interval...');
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, []);

  useEffect(() => {
    fetchTickets();
    if (showSearch && !limit) {
      axios.get<User[]>('/api/users')
        .then(res => setUsers(res.data))
        .catch(err => {
          console.error("Failed to fetch users for filter dropdown:", err);
          setError(prev => prev ? `${prev} And failed to load users.` : "Failed to load users for filters.");
        });
    }
  }, [fetchTickets, showSearch, limit]);

  useEffect(() => {
    if (!showSearch || limit) return;
    
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    
    debounceTimeoutRef.current = setTimeout(() => {
      if (searchTerm !== previousSearchTermRef.current) {
        fetchTickets();
      }
      previousSearchTermRef.current = searchTerm;
    }, 700) as unknown as DebounceTimeoutRef;

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [searchTerm, fetchTickets, showSearch, limit]);

  const deleteTicket = async (id: number) => {
    setError(null);
    try {
      await axios.delete(`/api/tickets/${id}`);
      fetchTickets();
    } catch (err: unknown) {
      console.error('Error deleting ticket:', err);
      let message = 'Failed to delete ticket.';
      if (axios.isAxiosError(err)) {
        const axiosError = err as AxiosError<{ error?: string }>;
        message = axiosError.response?.data?.error || message;
      }
      setError(message);
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleFilterFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    fetchTickets();
  };

  const handleClearFilters = () => {
    setStatusFilter('');
    setPriorityFilter('');
    setAssigneeFilter('');
    setSearchTerm('');
    setSortBy('createdAt');
    setSortOrder('desc');
    fetchTickets();
  };

  const handleSort = (column: string) => {
    const newSortOrder = sortBy === column && sortOrder === 'asc' ? 'desc' : 'asc';
    setSortBy(column);
    setSortOrder(newSortOrder);
  };

  const renderSortIcon = (column: string) => {
    if (sortBy !== column) return <i className="fas fa-sort text-foreground-subtle opacity-50" />;
    return sortOrder === 'desc' 
      ? <i className="fas fa-sort-down text-primary" /> 
      : <i className="fas fa-sort-up text-primary" />;
  };

  const shouldShowControls = showSearch && !limit;

  if (isLoading && tickets.length === 0 && !error) {
    return (
      <div className="flex items-center justify-center min-h-[400px] bg-white/5 rounded-2xl border border-white/10 backdrop-blur-lg">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-4xl text-primary mb-4"></i>
          <h3 className="text-xl font-semibold text-white">Loading Tickets</h3>
          <p className="text-foreground-muted">Fetching your latest tickets...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/5 rounded-2xl border border-white/10 backdrop-blur-lg animate-fadeIn">
      {/* Header */}
      <header className="p-4 sm:p-6 border-b border-white/10 flex justify-between items-center flex-wrap gap-4">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-3">
            <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-primary-hover text-white shadow-lg">
              <i className="fas fa-ticket-alt" />
            </span>
            {limit ? 'Recent Tickets' : 'All Tickets'}
          </h3>
        </div>
        {shouldShowControls && (
          <div className="flex items-center gap-2">
            <Link href="/tickets/create" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-success/80 hover:bg-success text-white font-semibold transition-all duration-300 transform hover:scale-105 shadow-lg">
              <i className="fas fa-plus" />
              <span>New Ticket</span>
            </Link>
          </div>
        )}
      </header>
      
      {error && (
        <div className="m-4 p-4 rounded-lg bg-danger/10 border border-danger/20 text-danger flex items-center gap-3">
          <i className="fas fa-exclamation-triangle" />
          <span>{error}</span>
        </div>
      )}

      {/* Filters */}
      {shouldShowControls && (
        <div className="p-4 border-b border-white/10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            <div className="relative xl:col-span-2">
              <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" />
              <input
                type="text"
                className="w-full bg-white/5 border border-white/20 rounded-lg pl-10 pr-4 py-2 text-white placeholder-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Search by title, description..."
                value={searchTerm}
                onChange={handleSearchChange}
              />
            </div>
            {/* Status, Priority, Assignee Filters */}
            {[
              { value: statusFilter, setter: setStatusFilter, placeholder: 'All Statuses', options: ticketStatusEnum.enumValues, icon: 'fa-flag' },
              { value: priorityFilter, setter: setPriorityFilter, placeholder: 'All Priorities', options: ticketPriorityEnum.enumValues, icon: 'fa-exclamation-circle' },
              { value: assigneeFilter, setter: setAssigneeFilter, placeholder: 'All Assignees', options: users.map(u => ({ value: u.id, label: u.name || u.email })), icon: 'fa-user' }
            ].map((filter, idx) => (
              <div key={idx} className="relative">
                <i className={`fas ${filter.icon} absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted`} />
                <select
                  className="w-full appearance-none bg-white/5 border border-white/20 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  value={filter.value}
                  onChange={(e) => (filter.setter as React.Dispatch<React.SetStateAction<string>>)(e.target.value)}
                >
                  <option value="">{filter.placeholder}</option>
                  {filter.placeholder === 'All Assignees' && <option value="unassigned">Unassigned</option>}
                  {filter.options.map((opt: any) => (
                    <option key={typeof opt === 'string' ? opt : opt.value} value={typeof opt === 'string' ? opt : opt.value}>
                      {typeof opt === 'string' ? opt.replace(/_/g, ' ') : opt.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1024px] text-sm text-left text-foreground-secondary">
          <thead className="bg-white/10 text-xs text-foreground-muted uppercase tracking-wider">
            <tr>
              {['id', 'title', 'assignee', 'reporter', 'priority', 'status', 'type', 'actions'].map(col => (
                <th key={col} scope="col" className="p-4" onClick={() => col !== 'actions' && handleSort(col)}>
                  <div className={`flex items-center gap-2 ${col !== 'actions' ? 'cursor-pointer' : ''}`}>
                    {col.replace('_', ' ')}
                    {col !== 'actions' && renderSortIcon(col)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!isLoading && tickets.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-16">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 flex items-center justify-center rounded-full bg-white/5 text-foreground-muted text-3xl">
                      <i className="fas fa-ticket-alt" />
                    </div>
                    <h4 className="text-xl font-semibold text-white">No Tickets Found</h4>
                    <p className="text-foreground-muted">Try adjusting your search filters.</p>
                  </div>
                </td>
              </tr>
            ) : (
              tickets.map(ticket => (
                <TicketDisplay
                  key={ticket.id}
                  ticket={{
                    ...ticket,
                    createdAt: new Date(ticket.createdAt),
                    updatedAt: new Date(ticket.updatedAt),
                  }}
                  deleteTicket={deleteTicket}
                  refreshTickets={fetchTickets}
                />
              ))
            )}
            {isLoading && tickets.length > 0 && isApplyingFilters && (
              <tr>
                <td colSpan={8} className="text-center py-8">
                  <i className="fas fa-spinner fa-spin text-2xl text-primary"></i>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}