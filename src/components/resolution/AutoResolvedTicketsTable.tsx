'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, Table, Badge, Button, Spinner, Pagination } from 'react-bootstrap';
import Link from 'next/link';

interface ResolvedTicket {
  id: number;
  title: string;
  senderName: string | null;
  senderEmail: string | null;
  resolutionSummary: string;
  closedAt: string;
  autoClose: boolean;
  confidence: 'high' | 'medium' | 'low';
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
        return <Badge bg="success">High</Badge>;
      case 'medium':
        return <Badge bg="warning">Medium</Badge>;
      case 'low':
        return <Badge bg="danger">Low</Badge>;
      default:
        return null;
    }
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
          <Table hover responsive className="mb-0">
            <thead className="bg-light">
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Customer</th>
                <th>Resolution</th>
                <th>Closed At</th>
                <th>Confidence</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map(ticket => (
                <tr key={ticket.id}>
                  <td>#{ticket.id}</td>
                  <td>
                    <Link href={`/tickets/${ticket.id}`}>
                      {ticket.title}
                    </Link>
                  </td>
                  <td>
                    {ticket.senderName || ticket.senderEmail || 'Unknown'}
                  </td>
                  <td>
                    <span title={ticket.resolutionSummary}>
                      {ticket.resolutionSummary.length > 50 
                        ? `${ticket.resolutionSummary.substring(0, 50)}...` 
                        : ticket.resolutionSummary}
                    </span>
                  </td>
                  <td>
                    {new Date(ticket.closedAt).toLocaleString()}
                  </td>
                  <td>
                    {getConfidenceBadge(ticket.confidence)}
                    {' '}
                    {ticket.autoClose && <Badge bg="info">Auto</Badge>}
                  </td>
                  <td>
                    <Button 
                      size="sm" 
                      variant="outline-primary"
                      onClick={() => handleReopenTicket(ticket.id)}
                    >
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