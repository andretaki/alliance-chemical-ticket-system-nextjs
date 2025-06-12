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
  const [realtimeStatus, setRealtimeStatus] = useState<'polling' | 'sse' | 'disabled'>('polling');

  // Filter states
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
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

    if (!isApplyingFilters && !backgroundRefresh) {
      setIsLoading(true);
    }
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
      setIsLoading(false);
      setIsApplyingFilters(false);
    }
  }, [statusFilter, priorityFilter, assigneeFilter, searchTerm, sortBy, sortOrder, limit]);

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
    if (sortBy !== column) return <i className="fas fa-sort sort-icon inactive" />;
    return sortOrder === 'desc' 
      ? <i className="fas fa-sort-down sort-icon active" /> 
      : <i className="fas fa-sort-up sort-icon active" />;
  };

  const shouldShowControls = showSearch && !limit;

  if (isLoading && tickets.length === 0 && !error) {
    return (
      <div className="loading-container">
        <div className="loading-content">
          <div className="loading-spinner">
            <div className="spinner-ring" />
            <div className="spinner-ring" />
            <div className="spinner-ring" />
          </div>
          <h3>Loading Tickets</h3>
          <p>Fetching your latest tickets...</p>
        </div>
        
        <style jsx>{`
          .loading-container {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 400px;
            background: rgba(255, 255, 255, 0.02);
            border-radius: 24px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(20px);
          }

          .loading-content {
            text-align: center;
            color: white;
          }

          .loading-spinner {
            position: relative;
            width: 80px;
            height: 80px;
            margin: 0 auto 2rem;
          }

          .spinner-ring {
            position: absolute;
            width: 100%;
            height: 100%;
            border: 3px solid transparent;
            border-top: 3px solid #667eea;
            border-radius: 50%;
            animation: spin 1.2s linear infinite;
          }

          .spinner-ring:nth-child(2) {
            animation-delay: 0.15s;
            border-top-color: #764ba2;
          }

          .spinner-ring:nth-child(3) {
            animation-delay: 0.3s;
            border-top-color: rgba(102, 126, 234, 0.6);
          }

          @keyframes spin {
            to { transform: rotate(360deg); }
          }

          .loading-content h3 {
            margin: 0 0 0.5rem 0;
            font-weight: 600;
            font-size: 1.5rem;
          }

          .loading-content p {
            margin: 0;
            opacity: 0.8;
            color: rgba(255, 255, 255, 0.7);
          }
        `}</style>
      </div>
    );
  }

  return (
    <>
      <div className="modern-ticket-list">
        {/* Header Section */}
        <div className="ticket-list-header">
          <div className="header-content">
            <div className="header-main">
              <h3 className="list-title">
                <span className="title-icon">
                  <i className="fas fa-ticket-alt" />
                </span>
                {limit ? 'Recent Tickets' : 'All Tickets'}
                <div className="title-glow" />
              </h3>
              {shouldShowControls && (
                <div className="view-controls">
                  <button
                    type="button"
                    className={`view-btn ${viewMode === 'table' ? 'active' : ''}`}
                    onClick={() => setViewMode('table')}
                  >
                    <i className="fas fa-list" />
                  </button>
                  <button
                    type="button"
                    className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                    onClick={() => setViewMode('grid')}
                  >
                    <i className="fas fa-th-large" />
                  </button>
                </div>
              )}
            </div>
            
            {shouldShowControls && (
              <div className="header-actions">
                <Link href="/tickets/create" className="create-ticket-btn" prefetch={false}>
                  <span className="btn-icon">
                    <i className="fas fa-plus" />
                  </span>
                  <span className="btn-text">New Ticket</span>
                  <div className="btn-glow" />
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="error-alert">
            <div className="error-content">
              <i className="fas fa-exclamation-triangle error-icon" />
              <span className="error-text">{error}</span>
              <button type="button" className="error-close" onClick={() => setError(null)}>
                <i className="fas fa-times" />
              </button>
            </div>
          </div>
        )}

        {/* Filters Section */}
        {shouldShowControls && (
          <div className="filters-section">
            <form onSubmit={handleFilterFormSubmit} className="filters-form">
              <div className="filters-grid">
                {/* Search Input */}
                <div className="filter-group search-group">
                  <div className="search-input-wrapper">
                    <i className="fas fa-search search-icon" />
                    <input
                      type="text"
                      className="search-input"
                      placeholder="Search tickets..."
                      value={searchTerm}
                      onChange={handleSearchChange}
                      disabled={isLoading || isApplyingFilters}
                    />
                    {searchTerm && (
                      <button 
                        type="button"
                        className="clear-search"
                        onClick={() => setSearchTerm('')}
                      >
                        <i className="fas fa-times" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Status Filter */}
                <div className="filter-group">
                  <label className="filter-label">
                    <i className="fas fa-flag" />
                    Status
                  </label>
                  <select 
                    className="filter-select" 
                    value={statusFilter} 
                    onChange={(e) => setStatusFilter(e.target.value)}
                    disabled={isLoading || isApplyingFilters}
                  >
                    <option value="">All Status</option>
                    {ticketStatusEnum.enumValues.map(s => (
                      <option key={s} value={s}>
                        {s.replace('_', ' ').split(' ').map(word => 
                          word.charAt(0).toUpperCase() + word.slice(1)
                        ).join(' ')}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Priority Filter */}
                <div className="filter-group">
                  <label className="filter-label">
                    <i className="fas fa-exclamation-circle" />
                    Priority
                  </label>
                  <select 
                    className="filter-select" 
                    value={priorityFilter} 
                    onChange={(e) => setPriorityFilter(e.target.value)}
                    disabled={isLoading || isApplyingFilters}
                  >
                    <option value="">All Priority</option>
                    {ticketPriorityEnum.enumValues.map(p => (
                      <option key={p} value={p}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Assignee Filter */}
                <div className="filter-group">
                  <label className="filter-label">
                    <i className="fas fa-user" />
                    Assignee
                  </label>
                  <select 
                    className="filter-select" 
                    value={assigneeFilter} 
                    onChange={(e) => setAssigneeFilter(e.target.value)}
                    disabled={isLoading || isApplyingFilters}
                  >
                    <option value="">All Assignees</option>
                    <option value="unassigned">Unassigned</option>
                    {users.map(user => (
                      <option key={user.id} value={user.id}>
                        {user.name || user.email}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Action Buttons */}
                <div className="filter-actions">
                  <button 
                    type="submit" 
                    className="filter-btn apply-btn" 
                    disabled={isApplyingFilters}
                  >
                    {isApplyingFilters ? (
                      <><i className="fas fa-spinner fa-spin" /> Filtering...</>
                    ) : (
                      <><i className="fas fa-filter" /> Filter</>
                    )}
                  </button>
                  <button 
                    type="button" 
                    className="filter-btn clear-btn" 
                    onClick={handleClearFilters} 
                    disabled={isApplyingFilters}
                  >
                    <i className="fas fa-undo" />
                    Clear
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* Real-time Status */}
        {realtimeStatus !== 'disabled' && (
          <div className="realtime-status">
            <div className="status-indicator">
              <div className={`status-dot ${realtimeStatus}`} />
              <span className="status-text">
                {realtimeStatus === 'sse' ? 'Live Updates' : 'Auto-refresh (2 minutes)'}
              </span>
            </div>
          </div>
        )}

        {/* Table Content */}
        <div className="table-container">
          <div className="table-wrapper">
            <table className="tickets-table">
              <thead>
                <tr>
                  <th className="sortable-header" onClick={() => handleSort('id')}>
                    <span className="header-content">
                      <span>ID</span>
                      {renderSortIcon('id')}
                    </span>
                  </th>
                  <th className="sortable-header" onClick={() => handleSort('title')}>
                    <span className="header-content">
                      <span>Title</span>
                      {renderSortIcon('title')}
                    </span>
                  </th>
                  <th className="description-header">Description</th>
                  <th className="sortable-header" onClick={() => handleSort('assignee')}>
                    <span className="header-content">
                      <span>Assignee</span>
                      {renderSortIcon('assignee')}
                    </span>
                  </th>
                  <th className="sortable-header" onClick={() => handleSort('priority')}>
                    <span className="header-content">
                      <span>Priority</span>
                      {renderSortIcon('priority')}
                    </span>
                  </th>
                  <th className="sortable-header" onClick={() => handleSort('status')}>
                    <span className="header-content">
                      <span>Status</span>
                      {renderSortIcon('status')}
                    </span>
                  </th>
                  <th className="sortable-header" onClick={() => handleSort('type')}>
                    <span className="header-content">
                      <span>Type</span>
                      {renderSortIcon('type')}
                    </span>
                  </th>
                  <th className="actions-header">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && tickets.length === 0 ? (
                  <tr className="loading-row">
                    <td colSpan={8}>
                      <div className="table-loading">
                        <i className="fas fa-spinner fa-spin" />
                        <span>Loading tickets...</span>
                      </div>
                    </td>
                  </tr>
                ) : !isLoading && tickets.length === 0 ? (
                  <tr className="empty-row">
                    <td colSpan={8}>
                      <div className="empty-state">
                        <div className="empty-icon">
                          <i className="fas fa-ticket-alt" />
                        </div>
                        <h3>No Tickets Found</h3>
                        <p>No tickets match your current filters. Try adjusting your search criteria.</p>
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
              </tbody>
            </table>
          </div>
          {isApplyingFilters && (
            <div className="table-overlay">
              <div className="table-loading">
                <i className="fas fa-spinner fa-spin" />
                <span>Refreshing tickets...</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .modern-ticket-list {
          background: rgba(255, 255, 255, 0.02);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px;
          overflow: visible;
          animation: slideInUp 0.6s ease-out;
        }

        .ticket-list-header {
          background: rgba(255, 255, 255, 0.05);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          padding: 2rem;
        }

        .header-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 1.5rem;
        }

        .header-main {
          display: flex;
          align-items: center;
          gap: 2rem;
        }

        .list-title {
          position: relative;
          display: flex;
          align-items: center;
          gap: 1rem;
          margin: 0;
          font-size: 1.5rem;
          font-weight: 700;
          color: white;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
        }

        .title-icon {
          width: 40px;
          height: 40px;
          background: linear-gradient(135deg, #667eea, #764ba2);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 1rem;
          box-shadow: 0 4px 20px rgba(102, 126, 234, 0.3);
        }

        .title-glow {
          position: absolute;
          top: -10px;
          left: -10px;
          right: -10px;
          bottom: -10px;
          background: linear-gradient(135deg, #667eea, #764ba2);
          border-radius: 20px;
          opacity: 0;
          filter: blur(20px);
          z-index: -1;
          transition: opacity 0.3s ease;
        }

        .list-title:hover .title-glow {
          opacity: 0.3;
        }

        .view-controls {
          display: flex;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 0.25rem;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .view-btn {
          padding: 0.5rem 1rem;
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.7);
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .view-btn.active,
        .view-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          color: white;
        }

        .create-ticket-btn {
          position: relative;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.5rem;
          background: linear-gradient(135deg, #10b981, #059669);
          color: white;
          text-decoration: none;
          border-radius: 12px;
          font-weight: 600;
          transition: all 0.3s ease;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .create-ticket-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 30px rgba(16, 185, 129, 0.4);
          color: white;
        }

        .btn-icon {
          width: 20px;
          height: 20px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
        }

        .create-ticket-btn:hover .btn-icon {
          background: rgba(255, 255, 255, 0.3);
          transform: rotate(90deg);
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

        .create-ticket-btn:hover .btn-glow {
          opacity: 1;
        }

        .error-alert {
          margin: 1rem 2rem;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 12px;
          animation: slideInDown 0.3s ease-out;
        }

        .error-content {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem 1.5rem;
          color: #ef4444;
        }

        .error-icon {
          font-size: 1.2rem;
        }

        .error-text {
          flex: 1;
          font-weight: 500;
        }

        .error-close {
          background: none;
          border: none;
          color: #ef4444;
          cursor: pointer;
          padding: 0.25rem;
          border-radius: 4px;
          transition: all 0.2s ease;
        }

        .error-close:hover {
          background: rgba(239, 68, 68, 0.1);
        }

        .filters-section {
          background: rgba(255, 255, 255, 0.02);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          padding: 1.5rem 2rem;
        }

        .filters-grid {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr 1fr auto;
          gap: 1rem;
          align-items: end;
        }

        .filter-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .search-group {
          position: relative;
        }

        .filter-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: rgba(255, 255, 255, 0.8);
          font-size: 0.875rem;
          font-weight: 500;
        }

        .search-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .search-icon {
          position: absolute;
          left: 1rem;
          color: rgba(255, 255, 255, 0.5);
          z-index: 2;
        }

        .search-input,
        .filter-select {
          width: 100%;
          padding: 0.75rem 1rem;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          color: white;
          font-size: 0.875rem;
          transition: all 0.3s ease;
          backdrop-filter: blur(10px);
        }

        .search-input {
          padding-left: 2.5rem;
          padding-right: 2.5rem;
        }

        .search-input:focus,
        .filter-select:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
          background: rgba(255, 255, 255, 0.08);
        }

        .search-input::placeholder {
          color: rgba(255, 255, 255, 0.5);
        }

        .filter-select option {
          background: #1a1a1a;
          color: white;
        }

        .clear-search {
          position: absolute;
          right: 1rem;
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.5);
          cursor: pointer;
          padding: 0.25rem;
          border-radius: 4px;
          transition: all 0.2s ease;
          z-index: 2;
        }

        .clear-search:hover {
          color: white;
          background: rgba(255, 255, 255, 0.1);
        }

        .filter-actions {
          display: flex;
          gap: 0.5rem;
        }

        .filter-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
          backdrop-filter: blur(10px);
          white-space: nowrap;
        }

        .apply-btn {
          background: rgba(102, 126, 234, 0.2);
          color: #667eea;
        }

        .apply-btn:hover:not(:disabled) {
          background: rgba(102, 126, 234, 0.3);
          transform: translateY(-1px);
        }

        .clear-btn {
          background: rgba(107, 114, 128, 0.2);
          color: #9ca3af;
        }

        .clear-btn:hover:not(:disabled) {
          background: rgba(107, 114, 128, 0.3);
          transform: translateY(-1px);
        }

        .filter-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .realtime-status {
          padding: 0.75rem 2rem;
          background: rgba(255, 255, 255, 0.02);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          justify-content: flex-end;
        }

        .status-indicator {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          animation: pulse 2s ease-in-out infinite;
        }

        .status-dot.sse {
          background: #10b981;
        }

        .status-dot.polling {
          background: #3b82f6;
        }

        .status-text {
          color: rgba(255, 255, 255, 0.7);
          font-size: 0.75rem;
          font-weight: 500;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .table-container {
          overflow-x: auto;
          position: relative;
        }

        .table-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(17, 24, 39, 0.8);
          backdrop-filter: blur(2px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10;
          border-radius: 0 0 24px 24px;
          animation: fadeIn 0.3s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .table-wrapper {
          min-width: 800px;
        }

        .tickets-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }

        .tickets-table th:nth-child(1) { width: 8%; }   /* ID */
        .tickets-table th:nth-child(2) { width: 20%; }  /* Title */
        .tickets-table th:nth-child(3) { width: 25%; }  /* Description */
        .tickets-table th:nth-child(4) { width: 15%; }  /* Assignee */
        .tickets-table th:nth-child(5) { width: 10%; }  /* Priority */
        .tickets-table th:nth-child(6) { width: 10%; }  /* Status */
        .tickets-table th:nth-child(7) { width: 8%; }   /* Type */
        .tickets-table th:nth-child(8) { width: 14%; }   /* Actions */

        .tickets-table thead tr {
          background: rgba(255, 255, 255, 0.05);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .tickets-table th {
          padding: 1rem 1.5rem;
          text-align: left;
          color: rgba(255, 255, 255, 0.9);
          font-weight: 600;
          font-size: 0.875rem;
          text-transform: uppercase;
          letter-spacing: 0.025em;
        }

        .sortable-header {
          cursor: pointer;
          transition: all 0.2s ease;
          user-select: none;
        }

        .sortable-header:hover {
          background: rgba(255, 255, 255, 0.05);
          color: white;
        }

        .header-content {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .sort-icon {
          opacity: 0.5;
          transition: all 0.2s ease;
          font-size: 0.75rem;
        }

        .sort-icon.active {
          opacity: 1;
          color: #667eea;
        }

        .sort-icon.inactive {
          opacity: 0.3;
        }

        .sortable-header:hover .sort-icon {
          opacity: 0.8;
        }

        .loading-row td {
          padding: 2rem;
        }

        .table-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          color: rgba(255, 255, 255, 0.9);
          font-size: 1.2rem;
          font-weight: 500;
        }

        .empty-row td {
          padding: 4rem 2rem;
        }

        .empty-state {
          text-align: center;
          color: rgba(255, 255, 255, 0.7);
        }

        .empty-icon {
          width: 80px;
          height: 80px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 1.5rem;
          font-size: 2rem;
          color: rgba(255, 255, 255, 0.3);
        }

        .empty-state h3 {
          margin: 0 0 0.5rem 0;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.8);
        }

        .empty-state p {
          margin: 0;
          font-size: 0.875rem;
        }

        @keyframes slideInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slideInDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Responsive Design */
        @media (max-width: 1200px) {
          .filters-grid {
            grid-template-columns: 1fr;
            gap: 1rem;
          }

          .filter-actions {
            justify-content: center;
          }

          .table-wrapper {
            min-width: 600px;
          }

          .tickets-table th:nth-child(1) { width: 10%; }  /* ID */
          .tickets-table th:nth-child(2) { width: 25%; }  /* Title */
          .tickets-table th:nth-child(3) { width: 20%; }  /* Description */
          .tickets-table th:nth-child(4) { width: 15%; }  /* Assignee */
          .tickets-table th:nth-child(5) { width: 10%; }  /* Priority */
          .tickets-table th:nth-child(6) { width: 10%; }  /* Status */
          .tickets-table th:nth-child(7) { width: 0%; }   /* Type - hide */
          .tickets-table th:nth-child(8) { width: 10%; }  /* Actions */
        }

        @media (max-width: 768px) {
          .ticket-list-header {
            padding: 1.5rem;
          }

          .header-content {
            flex-direction: column;
            align-items: flex-start;
          }

          .filters-section {
            padding: 1rem 1.5rem;
          }

          .realtime-status {
            padding: 0.5rem 1.5rem;
          }

          .tickets-table th {
            padding: 0.75rem 1rem;
          }

          .table-wrapper {
            min-width: 500px;
          }

          .tickets-table th:nth-child(3) { width: 15%; }  /* Description - smaller */
          .tickets-table th:nth-child(4) { width: 0%; }   /* Assignee - hide */
          .tickets-table th:nth-child(7) { width: 0%; }   /* Type - hide */
        }

        /* Global styles for nested TicketDisplay components */
        :global(.tickets-table tbody tr) {
          border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
          transition: all 0.2s ease !important;
        }

        :global(.tickets-table tbody tr:hover) {
          background: rgba(255, 255, 255, 0.02) !important;
        }

        :global(.tickets-table tbody td) {
          padding: 1rem 1.5rem !important;
          color: rgba(255, 255, 255, 0.9) !important;
          font-size: 0.875rem !important;
        }
      `}</style>
    </>
  );
}