// src/components/TicketListClient.tsx
'use client';

import React, { useState, useEffect, useCallback, ChangeEvent, FormEvent, useRef } from 'react';
import axios, { AxiosError } from 'axios';
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

export default function TicketListClient({ limit, showSearch = true }: TicketListClientProps) {
  const [tickets, setTickets] = useState<TicketListEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isApplyingFilters, setIsApplyingFilters] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  // Filter states
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Sorting states
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const debounceTimeoutRef = useRef<DebounceTimeoutRef | null>(null);
  const previousSearchTermRef = useRef<string>('');
  const isInitialMount = useRef(true);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchTickets = useCallback(async () => {
    if (!isApplyingFilters) setIsLoading(true);
    setIsApplyingFilters(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (priorityFilter) params.append('priority', priorityFilter);
      if (assigneeFilter) params.append('assigneeId', assigneeFilter);
      if (searchTerm.trim()) params.append('search', searchTerm.trim());
      params.append('sortBy', sortBy);
      params.append('sortOrder', sortOrder);

      const res = await axios.get<TicketListEntry[]>(`/api/tickets?${params.toString()}`);
      let fetchedTickets = res.data;

      if (limit && limit > 0 && !statusFilter && !priorityFilter && !assigneeFilter && !searchTerm.trim()) {
        fetchedTickets = fetchedTickets.slice(0, limit);
      }
      setTickets(fetchedTickets);
    } catch (err) {
      console.error('Error fetching tickets:', err);
      setError('Failed to load tickets. Please try again.');
    } finally {
      setIsLoading(false);
      setIsApplyingFilters(false);
    }
  }, [statusFilter, priorityFilter, assigneeFilter, searchTerm, sortBy, sortOrder, limit, isApplyingFilters]);

  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 3;
    let retryTimeout: NodeJS.Timeout;
    let connectionAttempts = 0;

    const connectEventSource = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      connectionAttempts++;
      console.log(`Attempting to connect to SSE (Attempt ${connectionAttempts})...`);
      
      try {
        const eventSource = new EventSource('/api/tickets/events', { withCredentials: true });
        eventSourceRef.current = eventSource;

        eventSource.onmessage = (event) => {
          console.log('SSE Event Received:', event.data);
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'ticket_created' || data.type === 'ticket_updated' || data.type === 'ticket_deleted') {
              fetchTickets();
            }
          } catch (err) {
            console.warn('Failed to parse SSE event data:', err);
          }
        };

        eventSource.onerror = (error) => {
          const readyState = eventSource.readyState;
          const stateMap = {
            0: 'CONNECTING',
            1: 'OPEN',
            2: 'CLOSED'
          };
          
          console.error('EventSource error:', {
            readyState: stateMap[readyState] || readyState,
            timestamp: new Date().toISOString(),
            connectionAttempt: connectionAttempts,
            retryCount,
            error: error instanceof Error ? error.message : 'Unknown error'
          });

          eventSource.close();
          
          if (retryCount < maxRetries) {
            retryCount++;
            const delay = Math.min(1000 * Math.pow(2, retryCount), 10000); // Exponential backoff with 10s max
            console.log(`Retrying connection (${retryCount}/${maxRetries}) in ${delay/1000}s...`);
            retryTimeout = setTimeout(connectEventSource, delay);
          } else {
            console.error('Max retries reached for EventSource connection');
            setError('Lost connection to real-time updates. Please refresh the page.');
          }
        };

        eventSource.onopen = () => {
          console.log('EventSource connection established', {
            timestamp: new Date().toISOString(),
            connectionAttempt: connectionAttempts
          });
          retryCount = 0;
          setError(null);
        };
      } catch (error) {
        console.error('Failed to create EventSource:', error);
        if (retryCount < maxRetries) {
          retryCount++;
          const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
          retryTimeout = setTimeout(connectEventSource, delay);
        }
      }
    };

    connectEventSource();

    return () => {
      console.log('Cleaning up EventSource connection...');
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
  }, [fetchTickets, limit]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (sortBy !== column) return <i className="fa-solid fa-sort text-gray-400 ms-1 opacity-50 text-xs"></i>;
    return sortOrder === 'desc' 
      ? <i className="fa-solid fa-sort-down ms-1 text-primary"></i> 
      : <i className="fa-solid fa-sort-up ms-1 text-primary"></i>;
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
      case 'waiting_on_customer': return 'bg-warning text-dark';
      default: return 'bg-secondary';
    }
  };

  const formatStatus = (status: string) => {
    return status.replace('_', ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const shouldShowControls = showSearch && !limit;

  if (isLoading && tickets.length === 0 && !error) {
    return (
      <div className="d-flex justify-content-center py-5">
        <div className="spinner-grow text-primary" role="status" style={{ width: '3rem', height: '3rem' }}>
          <span className="visually-hidden">Loading tickets...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="card border-0 shadow-lg rounded-3 overflow-hidden">
      <div className="card-header bg-white d-flex flex-column flex-md-row justify-content-between align-items-md-center p-4 border-bottom-0">
        <h3 className="mb-2 mb-md-0 h5 fw-bold text-primary">
          {limit ? 'Recent Tickets' : 'All Tickets'}
        </h3>
        {shouldShowControls && (
          <Link href="/tickets/create" className="btn btn-primary btn-sm px-4 rounded-pill shadow-sm">
            <i className="fa-solid fa-plus me-2"></i> Create New Ticket
          </Link>
        )}
      </div>
      <div className="card-body px-4 pb-4">
        {error && (
          <div className="alert alert-danger alert-dismissible fade show rounded-3 shadow-sm border-0" role="alert">
            <i className="fa-solid fa-circle-exclamation me-2"></i>
            {error}
            <button type="button" className="btn-close" onClick={() => setError(null)} aria-label="Close"></button>
          </div>
        )}

        {shouldShowControls && (
          <div className="filters-bar mb-4 p-4 rounded-3 shadow-sm bg-light">
            <form onSubmit={handleFilterFormSubmit} className="row g-3 align-items-end">
              <div className="col-lg-3 col-md-6 col-12">
                <label htmlFor="search" className="form-label form-label-sm fw-medium">
                  <i className="fa-solid fa-search me-2 text-primary"></i>Search
                </label>
                <div className="input-group input-group-sm">
                  <input
                    type="text"
                    id="search"
                    className="form-control"
                    placeholder="Search tickets..."
                    value={searchTerm}
                    onChange={handleSearchChange}
                    disabled={isLoading || isApplyingFilters}
                  />
                </div>
              </div>
              <div className="col-lg-2 col-md-3 col-sm-6">
                <label htmlFor="statusFilter" className="form-label form-label-sm fw-medium">
                  <i className="fa-solid fa-check-circle me-2 text-primary"></i>Status
                </label>
                <select 
                  id="statusFilter" 
                  className="form-select form-select-sm" 
                  value={statusFilter} 
                  onChange={(e) => setStatusFilter(e.target.value)}
                  disabled={isLoading || isApplyingFilters}
                >
                  <option value="">All Statuses</option>
                  {ticketStatusEnum.enumValues.map(s => (
                    <option key={s} value={s}>{formatStatus(s)}</option>
                  ))}
                </select>
              </div>
              <div className="col-lg-2 col-md-3 col-sm-6">
                <label htmlFor="priorityFilter" className="form-label form-label-sm fw-medium">
                  <i className="fa-solid fa-flag me-2 text-primary"></i>Priority
                </label>
                <select 
                  id="priorityFilter" 
                  className="form-select form-select-sm" 
                  value={priorityFilter} 
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  disabled={isLoading || isApplyingFilters}
                >
                  <option value="">All Priorities</option>
                  {ticketPriorityEnum.enumValues.map(p => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div className="col-lg-3 col-md-6 col-12">
                <label htmlFor="assigneeFilter" className="form-label form-label-sm fw-medium">
                  <i className="fa-solid fa-user me-2 text-primary"></i>Assignee
                </label>
                <select 
                  id="assigneeFilter" 
                  className="form-select form-select-sm" 
                  value={assigneeFilter} 
                  onChange={(e) => setAssigneeFilter(e.target.value)}
                  disabled={isLoading || isApplyingFilters}
                >
                  <option value="">All Assignees</option>
                  <option value="unassigned">Unassigned</option>
                  {users.map(user => (
                    <option key={user.id} value={user.id}>{user.name || user.email}</option>
                  ))}
                </select>
              </div>
              <div className="col-lg-1 col-md-3 col-sm-6">
                <button 
                  type="submit" 
                  className="btn btn-primary btn-sm w-100" 
                  disabled={isApplyingFilters}
                >
                  {isApplyingFilters ? 
                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> : 
                    <>
                      <i className="fa-solid fa-filter me-1"></i> Filter
                    </>
                  }
                </button>
              </div>
              <div className="col-lg-1 col-md-3 col-sm-6">
                <button 
                  type="button" 
                  className="btn btn-outline-secondary btn-sm w-100" 
                  onClick={handleClearFilters} 
                  title="Clear Filters" 
                  disabled={isApplyingFilters}
                >
                  <i className="fa-solid fa-xmark me-1"></i> Clear
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="table-responsive rounded-3 shadow-sm">
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr>
                <th onClick={() => handleSort('id')} className="sortable-header fw-medium">
                  <div className="d-flex align-items-center">
                    <span>ID</span>
                    {renderSortIcon('id')}
                  </div>
                </th>
                <th onClick={() => handleSort('title')} className="sortable-header fw-medium">
                  <div className="d-flex align-items-center">
                    <span>Title</span>
                    {renderSortIcon('title')}
                  </div>
                </th>
                <th style={{ minWidth: '200px' }} className="fw-medium">Description</th>
                <th onClick={() => handleSort('assignee')} className="sortable-header fw-medium">
                  <div className="d-flex align-items-center">
                    <span>Assignee</span>
                    {renderSortIcon('assignee')}
                  </div>
                </th>
                <th onClick={() => handleSort('priority')} className="sortable-header fw-medium">
                  <div className="d-flex align-items-center">
                    <span>Priority</span>
                    {renderSortIcon('priority')}
                  </div>
                </th>
                <th onClick={() => handleSort('status')} className="sortable-header fw-medium">
                  <div className="d-flex align-items-center">
                    <span>Status</span>
                    {renderSortIcon('status')}
                  </div>
                </th>
                <th onClick={() => handleSort('type')} className="sortable-header fw-medium">
                  <div className="d-flex align-items-center">
                    <span>Type</span>
                    {renderSortIcon('type')}
                  </div>
                </th>
                <th className="fw-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isApplyingFilters && tickets.length > 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-4">
                    <div className="spinner-border spinner-border-sm text-primary" role="status">
                      <span className="visually-hidden">Filtering...</span>
                    </div>
                  </td>
                </tr>
              ) : !isLoading && tickets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-muted py-5 fst-italic">
                    <i className="fa-solid fa-ticket-simple me-2 opacity-50"></i>
                    No tickets match the current filters.
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
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}