'use client';

import { useState } from 'react';
import { Form, Button, Alert, Card } from 'react-bootstrap';
import axios from 'axios';

interface ReopenTicketFormProps {
  ticketId: number;
  customerEmail: string;
}

export default function ReopenTicketForm({ ticketId, customerEmail }: ReopenTicketFormProps) {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!reason.trim()) {
      setError('Please provide a reason for reopening the ticket');
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const response = await axios.post(`/api/tickets/${ticketId}/reopen`, {
        reason,
        customerEmail
      });
      
      setSuccess(true);
      setReason('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to reopen ticket. Please try again.');
      console.error('Failed to reopen ticket:', err);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (success) {
    return (
      <Card className="shadow-sm mb-4">
        <Card.Header>
          <h5 className="mb-0">Ticket Reopened</h5>
        </Card.Header>
        <Card.Body>
          <Alert variant="success">
            <p className="mb-0">
              Your ticket has been successfully reopened. Our support team will review your request
              and respond as soon as possible.
            </p>
          </Alert>
          <Button 
            variant="outline-primary" 
            onClick={() => setSuccess(false)}
            className="mt-2"
          >
            Reopen Another Ticket
          </Button>
        </Card.Body>
      </Card>
    );
  }
  
  return (
    <Card className="shadow-sm mb-4">
      <Card.Header>
        <h5 className="mb-0">Reopen Ticket</h5>
      </Card.Header>
      <Card.Body>
        <p>
          This ticket is currently closed. If you need further assistance or have additional
          questions related to this issue, please use the form below to reopen this ticket.
        </p>
        
        {error && (
          <Alert variant="danger">{error}</Alert>
        )}
        
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3">
            <Form.Label>Reason for Reopening</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Please explain why you need to reopen this ticket..."
              required
            />
          </Form.Group>
          
          <Button 
            type="submit" 
            variant="primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Reopening...' : 'Reopen Ticket'}
          </Button>
        </Form>
      </Card.Body>
    </Card>
  );
} 