'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, Table, Badge, Button, Spinner, Pagination } from 'react-bootstrap';

interface ResolvedTicket {
  id: number;
  title: string;
  senderName: string | null;
  senderEmail: string;
  closedAt: string;
  resolutionSummary: string;
  confidence: 'high' | 'medium' | 'low';
  autoClose: boolean;
  aiReasoning?: string;
  conversationTurns?: number;
}

export default function AutoResolvedTicketsTable() {
  const [tickets, setTickets] = useState<ResolvedTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  useEffect(() => {
    async function loadResolvedTickets() {
      try {
        setIsLoading(true);
        const res = await axios.get(`/api/admin/resolved-tickets?page=${page}&limit=10`);
        setTickets(res.data.tickets);
        setTotalPages(res.data.totalPages);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load resolved tickets');
        console.error('Failed to load resolved tickets', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadResolvedTickets();
  }, [page]);
  
  const getConfidenceBadge = (confidence: 'high' | 'medium' | 'low') => {
    switch (confidence) {
      case 'high':
        return <Badge bg="success" className="me-1">High Confidence</Badge>;
      case 'medium':
        return <Badge bg="warning" className="me-1">Medium Confidence</Badge>;
      case 'low':
        return <Badge bg="danger" className="me-1">Low Confidence</Badge>;
      default:
        return <Badge bg="secondary" className="me-1">Unknown</Badge>;
    }
  };
  
  const getAutoCloseBadge = (autoClose: boolean) => {
    return autoClose ? 
      <Badge bg="primary" className="me-1">AI Auto-Closed</Badge> : 
      <Badge bg="secondary" className="me-1">Manual Resolution</Badge>;
  };
  
  const handleReopenTicket = async (ticketId: number) => {
    try {
      await axios.post(`/api/admin/tickets/${ticketId}/reopen`);
      // Remove ticket from the list or refresh the list
      setTickets(tickets.filter(t => t.id !== ticketId));
    } catch (err: any) {
      console.error(`Failed to reopen ticket ${ticketId}`, err);
      alert(`Failed to reopen ticket: ${err.response?.data?.error || 'Unknown error'}`);
    }
  };
  
  const renderPagination = () => {
    if (totalPages <= 1) return null;
    
    return (
      <div className="d-flex justify-content-center mt-3">
        <Pagination>
          <Pagination.First 
            disabled={page === 1} 
            onClick={() => setPage(1)} 
          />
          <Pagination.Prev 
            disabled={page === 1} 
            onClick={() => setPage(p => Math.max(1, p - 1))} 
          />
          
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            // Show pages around current page
            let pageNum = page;
            if (page < 3) {
              pageNum = i + 1;
            } else if (page > totalPages - 2) {
              pageNum = totalPages - 4 + i;
            } else {
              pageNum = page - 2 + i;
            }
            
            if (pageNum > 0 && pageNum <= totalPages) {
              return (
                <Pagination.Item 
                  key={pageNum} 
                  active={pageNum === page}
                  onClick={() => setPage(pageNum)}
                >
                  {pageNum}
                </Pagination.Item>
              );
            }
            return null;
          })}
          
          <Pagination.Next 
            disabled={page === totalPages} 
            onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
          />
          <Pagination.Last 
            disabled={page === totalPages} 
            onClick={() => setPage(totalPages)} 
          />
        </Pagination>
      </div>
    );
  };
  
  if (isLoading) {
    return (
      <Card className="shadow-sm mb-4">
        <Card.Header>
          <h5 className="mb-0">Recently Auto-Resolved Tickets</h5>
        </Card.Header>
        <Card.Body className="text-center py-5">
          <Spinner animation="border" role="status">
            <span className="visually-hidden">Loading...</span>
          </Spinner>
        </Card.Body>
      </Card>
    );
  }
  
  return (
    <Card className="shadow-sm mb-4">
      <Card.Header>
        <h5 className="mb-0">Recently Auto-Resolved Tickets</h5>
      </Card.Header>
      <Card.Body className="p-0">
        {error ? (
          <div className="p-3 text-danger">{error}</div>
        ) : tickets.length === 0 ? (
          <div className="p-3 text-center text-muted">No auto-resolved tickets found</div>
        ) : (
          <Table responsive hover>
            <thead>
              <tr>
                <th>Ticket #</th>
                <th>Customer</th>
                <th>Resolution Details</th>
                <th>AI Analysis</th>
                <th>Closed Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td>
                    <strong>#{ticket.id}</strong>
                    <br />
                    <small className="text-muted" title={ticket.title}>
                      {ticket.title.length > 30 ? `${ticket.title.substring(0, 30)}...` : ticket.title}
                    </small>
                  </td>
                  <td>
                    <div>
                      <strong>{ticket.senderName || 'Unknown'}</strong>
                      <br />
                      <small className="text-muted">{ticket.senderEmail}</small>
                    </div>
                  </td>
                  <td>
                    <div className="mb-1">
                      {getAutoCloseBadge(ticket.autoClose)}
                      {getConfidenceBadge(ticket.confidence)}
                    </div>
                    <small className="text-muted">
                      {ticket.resolutionSummary.length > 100 
                        ? `${ticket.resolutionSummary.substring(0, 100)}...` 
                        : ticket.resolutionSummary}
                    </small>
                  </td>
                  <td>
                    <div className="d-flex flex-column">
                      <div className="mb-1">
                        <i className="bi bi-robot me-1"></i>
                        <span className="badge bg-light text-dark">AI Analyzed</span>
                      </div>
                      {ticket.conversationTurns && (
                        <small className="text-muted">
                          <i className="bi bi-chat-dots me-1"></i>
                          {ticket.conversationTurns} turns
                        </small>
                      )}
                      {ticket.aiReasoning && (
                        <small className="text-muted mt-1" title={ticket.aiReasoning}>
                          <i className="bi bi-lightbulb me-1"></i>
                          {ticket.aiReasoning.length > 50 
                            ? `${ticket.aiReasoning.substring(0, 50)}...` 
                            : ticket.aiReasoning}
                        </small>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="text-nowrap">
                      {new Date(ticket.closedAt).toLocaleDateString()}
                      <br />
                      <small className="text-muted">
                        {new Date(ticket.closedAt).toLocaleTimeString()}
                      </small>
                    </div>
                  </td>
                  <td>
                    <Button 
                      variant="outline-warning" 
                      size="sm" 
                      onClick={() => handleReopenTicket(ticket.id)}
                      title="Reopen this ticket if the AI closure was incorrect"
                    >
                      <i className="bi bi-arrow-clockwise me-1"></i>
                      Reopen
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card.Body>
      {renderPagination()}
    </Card>
  );
} 