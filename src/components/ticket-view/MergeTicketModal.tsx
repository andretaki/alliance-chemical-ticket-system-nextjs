'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Form, ListGroup, Spinner, Alert } from 'react-bootstrap';
import { useDebounce } from 'use-debounce';
import axios from 'axios';
import toast from 'react-hot-toast';

interface TicketSearchResult {
  id: number;
  title: string;
  senderEmail: string | null;
  createdAt: string;
}

interface MergeTicketModalProps {
  show: boolean;
  onHide: () => void;
  primaryTicketId: number;
  onMergeSuccess: (mergedIntoId: number) => void;
}

export default function MergeTicketModal({ show, onHide, primaryTicketId, onMergeSuccess }: MergeTicketModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm] = useDebounce(searchTerm, 500);
  const [searchResults, setSearchResults] = useState<TicketSearchResult[]>([]);
  const [selectedTickets, setSelectedTickets] = useState<TicketSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = useCallback(async (term: string) => {
    if (term.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const { data } = await axios.get(`/api/tickets?search=${term}`);
      // Filter out the primary ticket and already selected tickets
      setSearchResults(data.data.filter((t: TicketSearchResult) => 
        t.id !== primaryTicketId && !selectedTickets.some(st => st.id === t.id)
      ));
    } catch (err) {
      console.error('Error searching tickets:', err);
    } finally {
      setIsSearching(false);
    }
  }, [primaryTicketId, selectedTickets]);

  useEffect(() => {
    handleSearch(debouncedSearchTerm);
  }, [debouncedSearchTerm, handleSearch]);

  const addTicketToMergeList = (ticket: TicketSearchResult) => {
    if (!selectedTickets.some(st => st.id === ticket.id)) {
      setSelectedTickets(prev => [...prev, ticket]);
      setSearchResults(prev => prev.filter(t => t.id !== ticket.id));
    }
  };

  const removeTicketFromMergeList = (ticketId: number) => {
    const ticketToRemove = selectedTickets.find(t => t.id === ticketId);
    setSelectedTickets(prev => prev.filter(t => t.id !== ticketId));
    if (ticketToRemove) {
      // Optionally add back to search results if it matches current term
      if (ticketToRemove.title.toLowerCase().includes(searchTerm.toLowerCase())) {
        setSearchResults(prev => [ticketToRemove, ...prev]);
      }
    }
  };

  const handleMerge = async () => {
    if (selectedTickets.length === 0) {
      setError('Please select at least one ticket to merge.');
      return;
    }
    setIsMerging(true);
    setError(null);
    try {
      const sourceTicketIds = selectedTickets.map(t => t.id);
      await axios.post(`/api/tickets/${primaryTicketId}/merge`, { sourceTicketIds });
      toast.success(`Successfully merged ${sourceTicketIds.length} tickets!`);
      onMergeSuccess(primaryTicketId);
      handleClose();
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Failed to merge tickets.';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsMerging(false);
    }
  };

  const handleClose = () => {
    setSearchTerm('');
    setSearchResults([]);
    setSelectedTickets([]);
    setError(null);
    onHide();
  };

  return (
    <Modal show={show} onHide={handleClose} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>Merge Tickets into Ticket #{primaryTicketId}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger">{error}</Alert>}
        
        <Form.Group className="mb-3">
          <Form.Label>Search for tickets to merge (by ID, title, or email)</Form.Label>
          <Form.Control
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </Form.Group>

        {isSearching && <div className="text-center"><Spinner animation="border" size="sm" /> Searching...</div>}
        
        {!isSearching && searchResults.length > 0 && (
          <ListGroup style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {searchResults.map(ticket => (
              <ListGroup.Item key={ticket.id} action onClick={() => addTicketToMergeList(ticket)}>
                <strong>#{ticket.id}: {ticket.title}</strong>
                <small className="d-block text-muted">{ticket.senderEmail} - Created on {new Date(ticket.createdAt).toLocaleDateString()}</small>
              </ListGroup.Item>
            ))}
          </ListGroup>
        )}

        <hr />

        <h6>Tickets to be Merged ({selectedTickets.length}):</h6>
        {selectedTickets.length === 0 ? (
          <p className="text-muted">No tickets selected.</p>
        ) : (
          <ListGroup>
            {selectedTickets.map(ticket => (
              <ListGroup.Item key={ticket.id} className="d-flex justify-content-between align-items-center">
                <span>#{ticket.id}: {ticket.title}</span>
                <Button variant="outline-danger" size="sm" onClick={() => removeTicketFromMergeList(ticket.id)}>
                  <i className="fas fa-times"></i>
                </Button>
              </ListGroup.Item>
            ))}
          </ListGroup>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose}>Cancel</Button>
        <Button variant="primary" onClick={handleMerge} disabled={isMerging || selectedTickets.length === 0}>
          {isMerging ? (
            <>
              <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" />
              Merging...
            </>
          ) : `Merge ${selectedTickets.length} Tickets`}
        </Button>
      </Modal.Footer>
    </Modal>
  );
} 