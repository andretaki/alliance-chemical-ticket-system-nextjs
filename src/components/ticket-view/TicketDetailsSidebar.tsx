'use client';

import React, { useState, useEffect } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { RagSearchInterface } from '@/components/RagSearchInterface';
import CustomerOrderHistory from './CustomerOrderHistory';
import type { ShopifyDraftOrderGQLResponse } from '@/agents/quoteAssistant/quoteInterfaces';
import type { Ticket, TicketUser } from '@/types/ticket';
import {
  AlertTriangle,
  Clock,
  ChevronUp,
  ChevronDown,
  ArrowUp,
  GitBranch,
  Phone,
  ListTodo,
  Smile,
  Frown,
  Meh,
  User,
  Mail,
  Settings,
  ShoppingCart,
  Truck,
  Link2,
  FileText,
  ExternalLink,
  Brain,
} from 'lucide-react';

interface TicketDetailsSidebarProps {
  ticket: Ticket;
  relatedQuote?: ShopifyDraftOrderGQLResponse | null;
  quoteAdminUrl?: string | null;
}

interface SmartAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  variant: string;
  action: () => void;
  condition?: boolean;
}

interface RelatedTicket {
  id: number;
  title: string;
  status: string;
  createdAt: string;
}

// Helper function to get priority class
const getPriorityClass = (priority: string): string => {
  switch (priority?.toLowerCase()) {
    case 'high':
    case 'urgent':
      return 'badge bg-danger';
    case 'medium': return 'badge bg-warning text-dark';
    case 'low': return 'badge bg-info text-dark';
    default: return 'badge bg-secondary';
  }
};

// Helper function to get status class
const getStatusClass = (status: string): string => {
  switch (status?.toLowerCase()) {
    case 'new': return 'badge bg-primary';
    case 'open': return 'badge bg-info';
    case 'in_progress': return 'badge bg-warning text-dark';
    case 'pending_customer': return 'badge bg-secondary';
    case 'closed': return 'badge bg-success';
    default: return 'badge bg-secondary';
  }
};

// Helper function to get sentiment class
const getSentimentClass = (sentiment: string | null): string => {
  switch (sentiment?.toLowerCase()) {
    case 'positive': return 'text-success';
    case 'negative': return 'text-danger';
    case 'neutral': return 'text-muted';
    default: return 'text-muted';
  }
};

// Helper function to parse dates
const parseDate = (dateString: string | null): Date | null => {
  if (!dateString) return null;
  try {
    return new Date(dateString);
  } catch {
    return null;
  }
};

// Calculate SLA status
const getSLAStatus = (createdAt: string, priority: string) => {
  const created = new Date(createdAt);
  const now = new Date();
  const hoursElapsed = (now.getTime() - created.getTime()) / (1000 * 60 * 60);
  
  let slaHours = 24; // Default
  switch (priority?.toLowerCase()) {
    case 'urgent': slaHours = 2; break;
    case 'high': slaHours = 4; break;
    case 'medium': slaHours = 8; break;
    case 'low': slaHours = 24; break;
  }
  
  const remainingHours = slaHours - hoursElapsed;
  const isBreached = remainingHours <= 0;
  const isAtRisk = remainingHours <= slaHours * 0.2; // Last 20% of time
  
  return { remainingHours, isBreached, isAtRisk, slaHours };
};

export default function TicketDetailsSidebar({ ticket, relatedQuote, quoteAdminUrl }: TicketDetailsSidebarProps) {
  const [relatedTickets, setRelatedTickets] = useState<RelatedTicket[]>([]);
  const [isLoadingRelated, setIsLoadingRelated] = useState(false);
  const [customerPreferences, setCustomerPreferences] = useState<any>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['details', 'customer']));

  const createdAtDate = parseDate(ticket.createdAt);
  const updatedAtDate = parseDate(ticket.updatedAt);
  const slaStatus = getSLAStatus(ticket.createdAt, ticket.priority);

  // Fetch related tickets and customer preferences
  useEffect(() => {
    const fetchRelatedData = async () => {
      if (!ticket.senderEmail) return;
      
      setIsLoadingRelated(true);
      try {
        const [relatedRes, prefsRes] = await Promise.all([
          fetch(`/api/tickets/related?email=${encodeURIComponent(ticket.senderEmail)}&exclude=${ticket.id}`).then(r => r.json()).catch(() => ({ tickets: [] })),
          fetch(`/api/customers/preferences?email=${encodeURIComponent(ticket.senderEmail)}`).then(r => r.json()).catch(() => null)
        ]);
        
        const raw = relatedRes?.tickets ?? relatedRes?.data?.tickets;
        setRelatedTickets(Array.isArray(raw) ? raw : []);
        setCustomerPreferences(prefsRes);
      } catch (error) {
        console.error('Failed to fetch related data:', error);
      } finally {
        setIsLoadingRelated(false);
      }
    };
    
    fetchRelatedData();
  }, [ticket.senderEmail, ticket.id]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  // Smart actions based on ticket context
  const smartActions: SmartAction[] = [
    {
      id: 'escalate',
      label: 'Escalate',
      icon: <ArrowUp className="w-4 h-4" />,
      variant: 'outline-warning',
      action: () => console.log('Escalate ticket'),
      condition: ticket.priority !== 'urgent'
    },
    {
      id: 'merge',
      label: 'Find Similar',
      icon: <GitBranch className="w-4 h-4" />,
      variant: 'outline-info',
      action: () => console.log('Find similar tickets'),
      condition: relatedTickets.length > 0
    },
    {
      id: 'schedule',
      label: 'Schedule Call',
      icon: <Phone className="w-4 h-4" />,
      variant: 'outline-primary',
      action: () => console.log('Schedule call'),
      condition: !!ticket.senderPhone
    },
    {
      id: 'create_task',
      label: 'Create Task',
      icon: <ListTodo className="w-4 h-4" />,
      variant: 'outline-secondary',
      action: () => console.log('Create task')
    }
  ];

  return (
    <div className="ticket-details-sidebar">
      {/* SLA Alert */}
      {slaStatus.isBreached && (
        <div className="alert alert-danger alert-sm mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <strong>SLA Breached!</strong> Overdue by {Math.abs(slaStatus.remainingHours).toFixed(1)} hours
        </div>
      )}

      {slaStatus.isAtRisk && !slaStatus.isBreached && (
        <div className="alert alert-warning alert-sm mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          <strong>SLA At Risk!</strong> {slaStatus.remainingHours.toFixed(1)} hours remaining
        </div>
      )}

      {/* Smart Actions Panel */}
      <div className="card shadow-sm mb-4">
        <div className="card-header bg-light d-flex justify-content-between align-items-center">
          <h6 className="mb-0">Quick Actions</h6>
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={() => toggleSection('actions')}
          >
            {expandedSections.has('actions') ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
        {expandedSections.has('actions') && (
          <div className="card-body">
            <div className="d-grid gap-2">
              {smartActions.filter(action => action.condition !== false).map(action => (
                <button
                  key={action.id}
                  className={`btn btn-sm ${action.variant} inline-flex items-center gap-2`}
                  onClick={action.action}
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Enhanced Ticket Details Card */}
      <div className="card shadow-sm mb-4">
        <div className="card-header bg-light d-flex justify-content-between align-items-center">
          <h6 className="mb-0">Ticket Details</h6>
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={() => toggleSection('details')}
          >
            {expandedSections.has('details') ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
        {expandedSections.has('details') && (
          <ul className="list-group list-group-flush">
            <li className="list-group-item d-flex justify-content-between align-items-center">
              <span className="text-muted">Status</span>
              <span className={getStatusClass(ticket.status)}>{ticket.status?.toUpperCase()}</span>
            </li>
            <li className="list-group-item d-flex justify-content-between align-items-center">
              <span className="text-muted">Priority</span>
              <span className={getPriorityClass(ticket.priority)}>{ticket.priority?.toUpperCase() || 'NONE'}</span>
            </li>
            {ticket.type && (
              <li className="list-group-item d-flex justify-content-between align-items-center">
                <span className="text-muted">Type</span>
                <span>{ticket.type}</span>
              </li>
            )}
            {ticket.sentiment && (
              <li className="list-group-item d-flex justify-content-between align-items-center">
                <span className="text-muted">Sentiment</span>
                <span className={`${getSentimentClass(ticket.sentiment)} inline-flex items-center gap-1`}>
                  {ticket.sentiment === 'positive' ? <Smile className="w-4 h-4" /> : ticket.sentiment === 'negative' ? <Frown className="w-4 h-4" /> : <Meh className="w-4 h-4" />}
                  {ticket.sentiment?.toUpperCase()}
                </span>
              </li>
            )}
            <li className="list-group-item d-flex justify-content-between align-items-center">
              <span className="text-muted">SLA Status</span>
              <span className={`small ${slaStatus.isBreached ? 'text-danger' : slaStatus.isAtRisk ? 'text-warning' : 'text-success'}`}>
                {slaStatus.isBreached ? 'BREACHED' : slaStatus.isAtRisk ? 'AT RISK' : 'ON TRACK'}
              </span>
            </li>
            <li className="list-group-item d-flex justify-content-between align-items-center">
              <span className="text-muted">Created</span>
              <span className="text-end small" title={createdAtDate ? format(createdAtDate, 'PPpp') : 'Unknown'}>
                {createdAtDate ? formatDistanceToNow(createdAtDate, { addSuffix: true }) : 'N/A'}
              </span>
            </li>
            <li className="list-group-item d-flex justify-content-between align-items-center">
              <span className="text-muted">Updated</span>
              <span className="text-end small" title={updatedAtDate ? format(updatedAtDate, 'PPpp') : 'Unknown'}>
                {updatedAtDate ? formatDistanceToNow(updatedAtDate, { addSuffix: true }) : 'N/A'}
              </span>
            </li>
          </ul>
        )}
      </div>
      
      {/* Enhanced Customer Information Card */}
      <div className="card shadow-sm mb-4">
        <div className="card-header bg-light d-flex justify-content-between align-items-center">
          <h6 className="mb-0">Customer Information</h6>
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={() => toggleSection('customer')}
          >
            {expandedSections.has('customer') ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
        {expandedSections.has('customer') && (
          <div className="card-body">
            <p className="mb-1 flex items-center gap-2">
              <User className="w-4 h-4 text-muted" />
              {ticket.senderName || ticket.reporter?.name || 'N/A'}
            </p>
            {(ticket.senderEmail || ticket.reporter?.email) && (
              <p className="mb-1 small flex items-center gap-2">
                <Mail className="w-4 h-4 text-muted" />
                <a href={`mailto:${ticket.senderEmail || ticket.reporter?.email}`} className="text-primary">
                  {ticket.senderEmail || ticket.reporter?.email}
                </a>
              </p>
            )}
            {ticket.senderPhone && (
              <p className="mb-1 small flex items-center gap-2">
                <Phone className="w-4 h-4 text-muted" />
                <a href={`tel:${ticket.senderPhone}`} className="text-primary">
                  {ticket.senderPhone}
                </a>
              </p>
            )}

            {/* Customer Preferences */}
            {customerPreferences && (
              <>
                <hr className="my-2" />
                <div className="small">
                  <p className="mb-1 flex items-center gap-2">
                    <Settings className="w-4 h-4 text-muted" />
                    <strong>Preferences:</strong>
                  </p>
                  {customerPreferences.preferredContactMethod && (
                    <p className="mb-1 ms-3">
                      Contact: {customerPreferences.preferredContactMethod}
                    </p>
                  )}
                  {customerPreferences.timezone && (
                    <p className="mb-1 ms-3">
                      Timezone: {customerPreferences.timezone}
                    </p>
                  )}
                </div>
              </>
            )}

            {(ticket.orderNumber || ticket.trackingNumber) && <hr className="my-2" />}
            {ticket.orderNumber && (
              <p className="mb-1 flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-muted" />
                <strong>Order:</strong> {ticket.orderNumber}
              </p>
            )}
            {ticket.trackingNumber && (
              <p className="mb-0 flex items-center gap-2">
                <Truck className="w-4 h-4 text-muted" />
                <strong>Tracking:</strong> {ticket.trackingNumber}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Related Tickets */}
      {relatedTickets.length > 0 && (
        <div className="card shadow-sm mb-4">
          <div className="card-header bg-light d-flex justify-content-between align-items-center">
            <h6 className="mb-0 flex items-center gap-2">
              <Link2 className="w-4 h-4 text-info" />
              Related Tickets ({relatedTickets.length})
            </h6>
            <button
              className="btn btn-sm btn-outline-secondary"
              onClick={() => toggleSection('related')}
            >
              {expandedSections.has('related') ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
          {expandedSections.has('related') && (
            <div className="card-body">
              {relatedTickets.slice(0, 5).map(relatedTicket => (
                <div key={relatedTicket.id} className="d-flex justify-content-between align-items-start mb-2 pb-2 border-bottom">
                  <div className="flex-grow-1">
                    <a href={`/tickets/${relatedTicket.id}`} className="text-decoration-none">
                      <div className="small fw-bold">#{relatedTicket.id}</div>
                      <div className="small text-muted text-truncate" style={{ maxWidth: '180px' }}>
                        {relatedTicket.title}
                      </div>
                    </a>
                  </div>
                  <div className="text-end">
                    <span className={`badge ${getStatusClass(relatedTicket.status)} mb-1`}>
                      {relatedTicket.status}
                    </span>
                    <div className="small text-muted">
                      {formatDistanceToNow(new Date(relatedTicket.createdAt), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              ))}
              {relatedTickets.length > 5 && (
                <div className="text-center">
                  <a href={`/tickets?customer=${encodeURIComponent(ticket.senderEmail || '')}`} className="btn btn-sm btn-outline-primary">
                    View All ({relatedTickets.length})
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Related Quote Card */}
      {relatedQuote && (
        <div className="card shadow-sm mb-4">
          <div className="card-header bg-light">
            <h6 className="mb-0 flex items-center gap-2">
              <FileText className="w-4 h-4 text-success" />
              Related Quote
            </h6>
          </div>
          <div className="card-body">
            <p className="mb-1">
              <strong>Quote:</strong> {relatedQuote.name || 'Draft Order'}
            </p>
            <p className="mb-1 small">
              <strong>Total:</strong> ${relatedQuote.subtotalPriceSet?.shopMoney?.amount || '0.00'}
            </p>
            <p className="mb-1 small">
              <strong>Items:</strong> {relatedQuote.lineItems?.edges?.length || 0}
            </p>
            {quoteAdminUrl && (
              <a href={quoteAdminUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-success inline-flex items-center gap-1">
                <ExternalLink className="w-4 h-4" />
                View in Shopify
              </a>
            )}
          </div>
        </div>
      )}

      {/* Customer Order History */}
      <CustomerOrderHistory
        customerEmail={ticket.senderEmail || ticket.reporter?.email || undefined}
        className="mb-4"
      />
      
      {/* AI Knowledge Search */}
      <div className="card shadow-sm">
        <div className="card-header bg-light d-flex justify-content-between align-items-center">
          <h6 className="mb-0 flex items-center gap-2">
            <Brain className="w-4 h-4 text-info" />
            AI Knowledge Search
          </h6>
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={() => toggleSection('ai')}
          >
            {expandedSections.has('ai') ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
        {expandedSections.has('ai') && (
          <div className="card-body p-2">
            <RagSearchInterface
              customerEmail={ticket.senderEmail || ticket.reporter?.email || undefined}
              orderNumber={ticket.orderNumber}
            />
          </div>
        )}
      </div>
    </div>
  );
} 