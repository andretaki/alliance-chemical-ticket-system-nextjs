// src/components/CreateTicketClient.tsx
'use client';

import React, { useState, useEffect } from 'react';
import axios, { AxiosError } from 'axios';
import { useRouter } from 'next/navigation';
import { ticketPriorityEnum, ticketStatusEnum, ticketTypeEcommerceEnum } from '@/db/schema';
import Link from 'next/link';

interface User {
  // Assuming User ID is text (UUID) based on schema changes
  id: string;
  name: string | null; // Allow null names
  email: string;
}

const CreateTicketClient: React.FC = () => {
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeEmail, setAssigneeEmail] = useState<string | null>(null);
  const [priority, setPriority] = useState<string>(ticketPriorityEnum.enumValues[1]); // Default 'medium'
  const [status, setStatus] = useState<string>(ticketStatusEnum.enumValues[0]); // Default 'new'
  const [type, setType] = useState<string | null>(null); // Default type is null (unspecified)
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerCompany, setCustomerCompany] = useState('');
  const [orderNumber, setOrderNumber] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true); // More specific loading state
  const [createdTicketId, setCreatedTicketId] = useState<number | null>(null);

  const [users, setUsers] = useState<User[]>([]);

  // Fetch users for the Assignee dropdown
  useEffect(() => {
    const fetchUsers = async () => {
      setIsLoadingUsers(true);
      try {
        const usersRes = await axios.get<User[]>('/api/users');
        // Filter out external users if they shouldn't be assignable
        // const internalUsers = usersRes.data.filter(u => !u.isExternal);
        // setUsers(internalUsers);
        setUsers(usersRes.data); // Or keep all users if external can be assigned
      } catch (err) {
        console.error('Error loading users:', err);
        setError('Failed to load user list. Assignee dropdown may be incomplete.');
      } finally {
        setIsLoadingUsers(false);
      }
    };

    fetchUsers();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const response = await axios.post('/api/tickets', {
        title,
        description,
        assigneeEmail, // Send null if unassigned
        priority,
        status,
        type, // Add ticket type to the request
        senderEmail: customerEmail,
        senderPhone: customerPhone,
        sendercompany: customerCompany,
        orderNumber
      });

      console.log('Ticket created:', response.data);
      // Optionally show a success toast/message here
      setCreatedTicketId(response.data.ticket.id);
      router.push('/tickets'); // Redirect to the list page
      router.refresh(); // Trigger data refresh on the target page
    } catch (err: unknown) {
      console.error('Error creating ticket:', err);
      if (axios.isAxiosError(err)) {
        const axiosError = err as AxiosError<{ error?: string, details?: Record<string, string[]> }>;
        if (axiosError.response?.data?.details) {
          // Handle validation errors from the API (e.g., Zod errors)
          const details = axiosError.response.data.details;
          const newFieldErrors: Record<string, string> = {};
          Object.entries(details).forEach(([field, messages]) => {
            newFieldErrors[field] = Array.isArray(messages) ? messages.join(', ') : String(messages);
          });
          setFieldErrors(newFieldErrors);
          setError("Please correct the errors below."); // Set a general error message
        } else {
          // Handle general API errors
          setError(axiosError.response?.data?.error || 'Failed to create ticket. Please try again.');
        }
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render loading state for user fetching
  if (isLoadingUsers) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '300px' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading form...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="card shadow-sm border-0 rounded-lg"> {/* Softer shadow, no border, rounded */}
      <div className="card-header bg-primary text-white rounded-top-lg"> {/* Changed from gradient to solid primary */}
        <h3 className="mb-0 h4 fw-bold"><i className="fas fa-plus-circle me-2"></i>Create New Ticket</h3>
      </div>
      <div className="card-body p-4"> {/* Increased padding */}
        {error && !Object.keys(fieldErrors).length && ( // Show general error only if no field errors
          <div className="alert alert-danger alert-dismissible fade show" role="alert">
            <i className="fas fa-exclamation-triangle me-2"></i>{error}
            <button type="button" className="btn-close" onClick={() => setError(null)} aria-label="Close"></button>
          </div>
        )}

        {createdTicketId && (
          <div className="alert alert-success alert-dismissible fade show" role="alert">
            <i className="fas fa-check-circle me-2"></i>Ticket created successfully!
            <div className="mt-2">
              <Link 
                href={`/admin/tickets/${createdTicketId}/create-quote`} 
                className="btn btn-sm btn-success"
              >
                <i className="fas fa-file-invoice-dollar me-1"></i> Create Quote from this Ticket
              </Link>
            </div>
            <button type="button" className="btn-close" onClick={() => setCreatedTicketId(null)} aria-label="Close"></button>
          </div>
        )}

        <form onSubmit={handleSubmit}>

          {/* Title - Floating Label */}
          <div className="form-floating mb-3">
            <input
              type="text"
              className={`form-control ${fieldErrors.title ? 'is-invalid' : ''}`}
              id="title"
              placeholder="Enter ticket title" // Placeholder required for floating label
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <label htmlFor="title">Title <span className="text-danger">*</span></label>
            {fieldErrors.title && <div className="invalid-feedback">{fieldErrors.title}</div>}
          </div>

          {/* Customer Information Section */}
          <div className="card mb-4">
            <div className="card-header bg-light">
              <h4 className="mb-0 h6">Customer Information</h4>
            </div>
            <div className="card-body">
              <div className="row g-3">
                <div className="col-md-6">
                  <div className="form-floating">
                    <input
                      type="email"
                      className={`form-control ${fieldErrors.senderEmail ? 'is-invalid' : ''}`}
                      id="customerEmail"
                      placeholder="Customer Email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                    />
                    <label htmlFor="customerEmail">Email</label>
                    {fieldErrors.senderEmail && <div className="invalid-feedback">{fieldErrors.senderEmail}</div>}
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-floating">
                    <input
                      type="tel"
                      className={`form-control ${fieldErrors.senderPhone ? 'is-invalid' : ''}`}
                      id="customerPhone"
                      placeholder="Customer Phone"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                    />
                    <label htmlFor="customerPhone">Phone</label>
                    {fieldErrors.senderPhone && <div className="invalid-feedback">{fieldErrors.senderPhone}</div>}
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-floating">
                    <input
                      type="text"
                      className={`form-control ${fieldErrors.sendercompany ? 'is-invalid' : ''}`}
                      id="customerCompany"
                      placeholder="Customer Company"
                      value={customerCompany}
                      onChange={(e) => setCustomerCompany(e.target.value)}
                    />
                    <label htmlFor="customerCompany">Company</label>
                    {fieldErrors.sendercompany && <div className="invalid-feedback">{fieldErrors.sendercompany}</div>}
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-floating">
                    <input
                      type="text"
                      className={`form-control ${fieldErrors.orderNumber ? 'is-invalid' : ''}`}
                      id="orderNumber"
                      placeholder="Order Number"
                      value={orderNumber}
                      onChange={(e) => setOrderNumber(e.target.value)}
                    />
                    <label htmlFor="orderNumber">Order #</label>
                    {fieldErrors.orderNumber && <div className="invalid-feedback">{fieldErrors.orderNumber}</div>}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Description - Floating Label */}
          <div className="form-floating mb-4">
            <textarea
              className={`form-control ${fieldErrors.description ? 'is-invalid' : ''}`}
              id="description"
              placeholder="Describe the issue or request" // Placeholder required
              style={{ height: '150px' }} // Set fixed height or use rows
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            ></textarea>
            <label htmlFor="description">Description <span className="text-danger">*</span></label>
            {fieldErrors.description && <div className="invalid-feedback">{fieldErrors.description}</div>}
          </div>

          {/* Grouped Fields: Ticket Type, Priority, Status, Assignee */}
          <div className="row g-3 mb-4"> {/* Use g-3 for gutters */}
            <div className="col-md-3">
              <label htmlFor="type" className="form-label fw-medium small mb-1">Ticket Type</label>
              <select
                className={`form-select ${fieldErrors.type ? 'is-invalid' : ''}`}
                id="type"
                value={type || ''}
                onChange={(e) => setType(e.target.value || null)}
              >
                <option value="">-- Select Type --</option>
                {ticketTypeEcommerceEnum.enumValues.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              {fieldErrors.type && <div className="invalid-feedback">{fieldErrors.type}</div>}
            </div>
            
            <div className="col-md-3">
              <label htmlFor="priority" className="form-label fw-medium small mb-1">Priority</label> {/* Smaller label */}
              <select
                className="form-select"
                id="priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                {ticketPriorityEnum.enumValues.map((p) => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>

            <div className="col-md-3">
              <label htmlFor="status" className="form-label fw-medium small mb-1">Status</label>
              <select
                className="form-select"
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {ticketStatusEnum.enumValues.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ').charAt(0).toUpperCase() + s.replace('_', ' ').slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-3">
              <label htmlFor="assignee" className="form-label fw-medium small mb-1">Assignee</label>
              <select
                className={`form-select ${fieldErrors.assigneeEmail ? 'is-invalid' : ''}`}
                id="assignee"
                value={assigneeEmail || ''} // Ensure controlled component
                onChange={(e) => setAssigneeEmail(e.target.value || null)}
                disabled={isLoadingUsers} // Disable while loading users
              >
                <option value="">-- Unassigned --</option>
                {!isLoadingUsers && users.length > 0 ? (
                  users.map((user) => (
                    <option key={user.id} value={user.email}>{user.name || user.email} </option> // Display name or email
                  ))
                ) : !isLoadingUsers ? (
                  <option value="" disabled>No users available</option>
                ) : null /* Don't show anything while loading */}
              </select>
              {fieldErrors.assigneeEmail && <div className="invalid-feedback">{fieldErrors.assigneeEmail}</div>}
            </div>
          </div>

          {/* Buttons */}
          <div className="d-flex justify-content-end gap-2 mt-4 pt-3 border-top"> {/* Align buttons right */}
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => router.back()} // Go back instead of always to list
              disabled={isSubmitting}
            >
              <i className="fas fa-times me-1"></i>Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary d-flex align-items-center" // Use flex for spinner alignment
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  <span>Creating...</span>
                </>
              ) : (
                <><i className="fas fa-save me-2"></i>Create Ticket</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Example gradient CSS (add this to your globals.css or a relevant CSS module)
/*
.bg-gradient-primary-to-secondary {
  background: linear-gradient(to right, var(--bs-primary), var(--bs-secondary));
}
*/

export default CreateTicketClient;