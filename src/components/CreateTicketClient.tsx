// src/components/CreateTicketClient.tsx
'use client';

import React, { useState, useEffect } from 'react';
import axios, { AxiosError } from 'axios';
import { useRouter } from 'next/navigation';
import { ticketPriorityEnum, ticketStatusEnum, ticketTypeEcommerceEnum } from '@/db/schema';
import Link from 'next/link';

interface User {
  id: string;
  name: string | null;
  email: string;
}

const CreateTicketClient: React.FC = () => {
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeEmail, setAssigneeEmail] = useState<string | null>(null);
  const [priority, setPriority] = useState<string>(ticketPriorityEnum.enumValues[1]);
  const [status, setStatus] = useState<string>(ticketStatusEnum.enumValues[0]);
  const [type, setType] = useState<string | null>(null);
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerCompany, setCustomerCompany] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  
  // Shipping address state variables
  const [shippingName, setShippingName] = useState('');
  const [shippingCompany, setShippingCompany] = useState('');
  const [shippingCountry, setShippingCountry] = useState('');
  const [shippingAddressLine1, setShippingAddressLine1] = useState('');
  const [shippingAddressLine2, setShippingAddressLine2] = useState('');
  const [shippingAddressLine3, setShippingAddressLine3] = useState('');
  const [shippingCity, setShippingCity] = useState('');
  const [shippingState, setShippingState] = useState('');
  const [shippingPostalCode, setShippingPostalCode] = useState('');
  const [shippingPhone, setShippingPhone] = useState('');
  const [shippingEmail, setShippingEmail] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [createdTicketId, setCreatedTicketId] = useState<number | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  // Priority colors mapping
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low': return 'success';
      case 'medium': return 'warning';
      case 'high': return 'danger';
      case 'urgent': return 'danger';
      default: return 'secondary';
    }
  };

  // Status colors mapping
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'primary';
      case 'in_progress': return 'info';
      case 'resolved': return 'success';
      case 'closed': return 'secondary';
      default: return 'secondary';
    }
  };

  // Fetch users for the Assignee dropdown
  useEffect(() => {
    const fetchUsers = async () => {
      setIsLoadingUsers(true);
      try {
        const usersRes = await axios.get<User[]>('/api/users');
        setUsers(usersRes.data);
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
        assigneeEmail,
        priority,
        status,
        type,
        senderEmail: customerEmail,
        senderPhone: customerPhone,
        sendercompany: customerCompany,
        orderNumber,
        shippingName,
        shippingCompany,
        shippingCountry,
        shippingAddressLine1,
        shippingAddressLine2,
        shippingAddressLine3,
        shippingCity,
        shippingState,
        shippingPostalCode,
        shippingPhone,
        shippingEmail
      });

      console.log('Ticket created:', response.data);
      setCreatedTicketId(response.data.ticket.id);
      router.push(`/tickets/${response.data.ticket.id}`);
      router.refresh();
    } catch (err: unknown) {
      console.error('Error creating ticket:', err);
      if (axios.isAxiosError(err)) {
        const axiosError = err as AxiosError<{ error?: string, details?: Record<string, string[]> }>;
        if (axiosError.response?.data?.details) {
          const details = axiosError.response.data.details;
          const newFieldErrors: Record<string, string> = {};
          Object.entries(details).forEach(([field, messages]) => {
            newFieldErrors[field] = Array.isArray(messages) ? messages.join(', ') : String(messages);
          });
          setFieldErrors(newFieldErrors);
          setError("Please correct the errors below.");
        } else {
          setError(axiosError.response?.data?.error || 'Failed to create ticket. Please try again.');
        }
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (isLoadingUsers) {
    return (
      <div className="d-flex flex-column justify-content-center align-items-center" style={{ minHeight: '400px' }}>
        <div className="spinner-border text-primary mb-3" role="status" style={{ width: '3rem', height: '3rem' }}>
          <span className="visually-hidden">Loading form...</span>
        </div>
        <p className="text-muted">Preparing ticket form...</p>
      </div>
    );
  }

  return (
    <div className="container-fluid px-4 py-4">
      <div className="row justify-content-center">
        <div className="col-12 col-xl-10">
          {/* Header Section */}
          <div className="d-flex align-items-center justify-content-between mb-4">
            <div>
              <h1 className="h3 mb-1 fw-bold text-dark">
                <i className="fas fa-ticket-alt text-primary me-2"></i>
                Create New Ticket
              </h1>
              <p className="text-muted mb-0">Fill out the form below to create a new support ticket</p>
            </div>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => router.back()}
            >
              <i className="fas fa-arrow-left me-1"></i>Back
            </button>
          </div>

          {/* Alert Messages */}
          {error && !Object.keys(fieldErrors).length && (
            <div className="alert alert-danger alert-dismissible fade show border-0 shadow-sm mb-4" role="alert">
              <div className="d-flex align-items-center">
                <i className="fas fa-exclamation-circle text-danger me-2"></i>
                <div className="flex-grow-1">{error}</div>
              </div>
              <button type="button" className="btn-close" onClick={() => setError(null)} aria-label="Close"></button>
            </div>
          )}

          {createdTicketId && (
            <div className="alert alert-success alert-dismissible fade show border-0 shadow-sm mb-4" role="alert">
              <div className="d-flex align-items-start">
                <i className="fas fa-check-circle text-success me-2 mt-1"></i>
                <div className="flex-grow-1">
                  <h6 className="alert-heading mb-2">Ticket Created Successfully!</h6>
                  <p className="mb-2">Your ticket has been created and assigned ID #{createdTicketId}</p>
                  <Link 
                    href={`/tickets/${createdTicketId}/create-quote`} 
                    className="btn btn-sm btn-success"
                  >
                    <i className="fas fa-file-invoice-dollar me-1"></i>Create Quote
                  </Link>
                </div>
              </div>
              <button type="button" className="btn-close" onClick={() => setCreatedTicketId(null)} aria-label="Close"></button>
            </div>
          )}

          {/* Main Form Card */}
          <div className="card border-0 shadow-sm">
            <div className="card-body p-4">
              <form onSubmit={handleSubmit}>
                
                {/* Basic Information Section */}
                <div className="mb-4">
                  <h5 className="text-primary mb-3 fw-semibold">
                    <i className="fas fa-info-circle me-2"></i>Basic Information
                  </h5>
                  
                  <div className="row g-3">
                    <div className="col-12">
                      <div className="form-floating">
                        <input
                          type="text"
                          className={`form-control ${fieldErrors.title ? 'is-invalid' : ''}`}
                          id="title"
                          placeholder="Enter ticket title"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          required
                        />
                        <label htmlFor="title">Ticket Title <span className="text-danger">*</span></label>
                        {fieldErrors.title && <div className="invalid-feedback">{fieldErrors.title}</div>}
                      </div>
                    </div>
                    
                    <div className="col-12">
                      <div className="form-floating">
                        <textarea
                          className={`form-control ${fieldErrors.description ? 'is-invalid' : ''}`}
                          id="description"
                          placeholder="Describe the issue or request in detail"
                          style={{ height: '120px' }}
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          required
                        ></textarea>
                        <label htmlFor="description">Description <span className="text-danger">*</span></label>
                        {fieldErrors.description && <div className="invalid-feedback">{fieldErrors.description}</div>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Ticket Settings Section */}
                <div className="mb-4">
                  <h5 className="text-primary mb-3 fw-semibold">
                    <i className="fas fa-cogs me-2"></i>Ticket Settings
                  </h5>
                  
                  <div className="row g-3">
                    <div className="col-md-6 col-lg-3">
                      <label htmlFor="type" className="form-label fw-medium">Ticket Type</label>
                      <select
                        className={`form-select ${fieldErrors.type ? 'is-invalid' : ''}`}
                        id="type"
                        value={type || ''}
                        onChange={(e) => setType(e.target.value || null)}
                      >
                        <option value="">Select Type</option>
                        {ticketTypeEcommerceEnum.enumValues.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      {fieldErrors.type && <div className="invalid-feedback">{fieldErrors.type}</div>}
                    </div>
                    
                    <div className="col-md-6 col-lg-3">
                      <label htmlFor="priority" className="form-label fw-medium">Priority</label>
                      <select
                        className="form-select"
                        id="priority"
                        value={priority}
                        onChange={(e) => setPriority(e.target.value)}
                      >
                        {ticketPriorityEnum.enumValues.map((p) => (
                          <option key={p} value={p}>
                            {p.charAt(0).toUpperCase() + p.slice(1)}
                          </option>
                        ))}
                      </select>
                      <div className="mt-1">
                        <span className={`badge bg-${getPriorityColor(priority)} bg-opacity-10 text-${getPriorityColor(priority)} border border-${getPriorityColor(priority)} border-opacity-25`}>
                          {priority.charAt(0).toUpperCase() + priority.slice(1)}
                        </span>
                      </div>
                    </div>

                    <div className="col-md-6 col-lg-3">
                      <label htmlFor="status" className="form-label fw-medium">Status</label>
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
                      <div className="mt-1">
                        <span className={`badge bg-${getStatusColor(status)} bg-opacity-10 text-${getStatusColor(status)} border border-${getStatusColor(status)} border-opacity-25`}>
                          {status.replace('_', ' ').charAt(0).toUpperCase() + status.replace('_', ' ').slice(1)}
                        </span>
                      </div>
                    </div>

                    <div className="col-md-6 col-lg-3">
                      <label htmlFor="assignee" className="form-label fw-medium">Assignee</label>
                      <select
                        className={`form-select ${fieldErrors.assigneeEmail ? 'is-invalid' : ''}`}
                        id="assignee"
                        value={assigneeEmail || ''}
                        onChange={(e) => setAssigneeEmail(e.target.value || null)}
                        disabled={isLoadingUsers}
                      >
                        <option value="">Unassigned</option>
                        {users.map((user) => (
                          <option key={user.id} value={user.email}>
                            {user.name || user.email}
                          </option>
                        ))}
                      </select>
                      {fieldErrors.assigneeEmail && <div className="invalid-feedback">{fieldErrors.assigneeEmail}</div>}
                    </div>
                  </div>
                </div>

                {/* Customer Information Section */}
                <div className="mb-4">
                  <h5 className="text-primary mb-3 fw-semibold">
                    <i className="fas fa-user me-2"></i>Customer Information
                  </h5>
                  
                  <div className="row g-3">
                    <div className="col-md-6">
                      <div className="form-floating">
                        <input
                          type="email"
                          className={`form-control ${fieldErrors.senderEmail ? 'is-invalid' : ''}`}
                          id="customerEmail"
                          placeholder="customer@example.com"
                          value={customerEmail}
                          onChange={(e) => setCustomerEmail(e.target.value)}
                        />
                        <label htmlFor="customerEmail">Email Address</label>
                        {fieldErrors.senderEmail && <div className="invalid-feedback">{fieldErrors.senderEmail}</div>}
                      </div>
                    </div>
                    
                    <div className="col-md-6">
                      <div className="form-floating">
                        <input
                          type="tel"
                          className={`form-control ${fieldErrors.senderPhone ? 'is-invalid' : ''}`}
                          id="customerPhone"
                          placeholder="Phone Number"
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                        />
                        <label htmlFor="customerPhone">Phone Number</label>
                        {fieldErrors.senderPhone && <div className="invalid-feedback">{fieldErrors.senderPhone}</div>}
                      </div>
                    </div>
                    
                    <div className="col-md-6">
                      <div className="form-floating">
                        <input
                          type="text"
                          className={`form-control ${fieldErrors.sendercompany ? 'is-invalid' : ''}`}
                          id="customerCompany"
                          placeholder="Company Name"
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
                        <label htmlFor="orderNumber">Order Number</label>
                        {fieldErrors.orderNumber && <div className="invalid-feedback">{fieldErrors.orderNumber}</div>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Shipping Address Section - Conditional */}
                {type === 'International Shipping' && (
                  <div className="mb-4">
                    <h5 className="text-primary mb-3 fw-semibold">
                      <i className="fas fa-shipping-fast me-2"></i>Shipping Address
                    </h5>
                    
                    <div className="row g-3">
                      <div className="col-md-6">
                        <div className="form-floating">
                          <input
                            type="text"
                            className={`form-control ${fieldErrors.shippingName ? 'is-invalid' : ''}`}
                            id="shippingName"
                            placeholder="Recipient Name"
                            value={shippingName}
                            onChange={(e) => setShippingName(e.target.value)}
                            required
                          />
                          <label htmlFor="shippingName">Recipient Name <span className="text-danger">*</span></label>
                          {fieldErrors.shippingName && <div className="invalid-feedback">{fieldErrors.shippingName}</div>}
                        </div>
                      </div>
                      
                      <div className="col-md-6">
                        <div className="form-floating">
                          <input
                            type="text"
                            className={`form-control ${fieldErrors.shippingCompany ? 'is-invalid' : ''}`}
                            id="shippingCompany"
                            placeholder="Company Name"
                            value={shippingCompany}
                            onChange={(e) => setShippingCompany(e.target.value)}
                          />
                          <label htmlFor="shippingCompany">Company</label>
                          {fieldErrors.shippingCompany && <div className="invalid-feedback">{fieldErrors.shippingCompany}</div>}
                        </div>
                      </div>
                      
                      <div className="col-md-6">
                        <div className="form-floating">
                          <input
                            type="text"
                            className={`form-control ${fieldErrors.shippingCountry ? 'is-invalid' : ''}`}
                            id="shippingCountry"
                            placeholder="Country"
                            value={shippingCountry}
                            onChange={(e) => setShippingCountry(e.target.value)}
                            required
                          />
                          <label htmlFor="shippingCountry">Country <span className="text-danger">*</span></label>
                          {fieldErrors.shippingCountry && <div className="invalid-feedback">{fieldErrors.shippingCountry}</div>}
                        </div>
                      </div>
                      
                      <div className="col-12">
                        <div className="form-floating">
                          <input
                            type="text"
                            className={`form-control ${fieldErrors.shippingAddressLine1 ? 'is-invalid' : ''}`}
                            id="shippingAddressLine1"
                            placeholder="Street Address"
                            value={shippingAddressLine1}
                            onChange={(e) => setShippingAddressLine1(e.target.value)}
                            required
                          />
                          <label htmlFor="shippingAddressLine1">Street Address <span className="text-danger">*</span></label>
                          {fieldErrors.shippingAddressLine1 && <div className="invalid-feedback">{fieldErrors.shippingAddressLine1}</div>}
                        </div>
                      </div>
                      
                      <div className="col-md-6">
                        <div className="form-floating">
                          <input
                            type="text"
                            className={`form-control ${fieldErrors.shippingAddressLine2 ? 'is-invalid' : ''}`}
                            id="shippingAddressLine2"
                            placeholder="Apartment, suite, etc."
                            value={shippingAddressLine2}
                            onChange={(e) => setShippingAddressLine2(e.target.value)}
                          />
                          <label htmlFor="shippingAddressLine2">Address Line 2</label>
                          {fieldErrors.shippingAddressLine2 && <div className="invalid-feedback">{fieldErrors.shippingAddressLine2}</div>}
                        </div>
                      </div>
                      
                      <div className="col-md-6">
                        <div className="form-floating">
                          <input
                            type="text"
                            className={`form-control ${fieldErrors.shippingAddressLine3 ? 'is-invalid' : ''}`}
                            id="shippingAddressLine3"
                            placeholder="Additional address info"
                            value={shippingAddressLine3}
                            onChange={(e) => setShippingAddressLine3(e.target.value)}
                          />
                          <label htmlFor="shippingAddressLine3">Address Line 3</label>
                          {fieldErrors.shippingAddressLine3 && <div className="invalid-feedback">{fieldErrors.shippingAddressLine3}</div>}
                        </div>
                      </div>
                      
                      <div className="col-md-4">
                        <div className="form-floating">
                          <input
                            type="text"
                            className={`form-control ${fieldErrors.shippingCity ? 'is-invalid' : ''}`}
                            id="shippingCity"
                            placeholder="City"
                            value={shippingCity}
                            onChange={(e) => setShippingCity(e.target.value)}
                            required
                          />
                          <label htmlFor="shippingCity">City <span className="text-danger">*</span></label>
                          {fieldErrors.shippingCity && <div className="invalid-feedback">{fieldErrors.shippingCity}</div>}
                        </div>
                      </div>
                      
                      <div className="col-md-4">
                        <div className="form-floating">
                          <input
                            type="text"
                            className={`form-control ${fieldErrors.shippingState ? 'is-invalid' : ''}`}
                            id="shippingState"
                            placeholder="State/Province"
                            value={shippingState}
                            onChange={(e) => setShippingState(e.target.value)}
                            required
                          />
                          <label htmlFor="shippingState">State/Province <span className="text-danger">*</span></label>
                          {fieldErrors.shippingState && <div className="invalid-feedback">{fieldErrors.shippingState}</div>}
                        </div>
                      </div>
                      
                      <div className="col-md-4">
                        <div className="form-floating">
                          <input
                            type="text"
                            className={`form-control ${fieldErrors.shippingPostalCode ? 'is-invalid' : ''}`}
                            id="shippingPostalCode"
                            placeholder="Postal Code"
                            value={shippingPostalCode}
                            onChange={(e) => setShippingPostalCode(e.target.value)}
                            required
                          />
                          <label htmlFor="shippingPostalCode">Postal Code <span className="text-danger">*</span></label>
                          {fieldErrors.shippingPostalCode && <div className="invalid-feedback">{fieldErrors.shippingPostalCode}</div>}
                        </div>
                      </div>
                      
                      <div className="col-md-6">
                        <div className="form-floating">
                          <input
                            type="tel"
                            className={`form-control ${fieldErrors.shippingPhone ? 'is-invalid' : ''}`}
                            id="shippingPhone"
                            placeholder="Phone Number"
                            value={shippingPhone}
                            onChange={(e) => setShippingPhone(e.target.value)}
                            required
                          />
                          <label htmlFor="shippingPhone">Phone Number <span className="text-danger">*</span></label>
                          {fieldErrors.shippingPhone && <div className="invalid-feedback">{fieldErrors.shippingPhone}</div>}
                        </div>
                      </div>
                      
                      <div className="col-md-6">
                        <div className="form-floating">
                          <input
                            type="email"
                            className={`form-control ${fieldErrors.shippingEmail ? 'is-invalid' : ''}`}
                            id="shippingEmail"
                            placeholder="Email Address"
                            value={shippingEmail}
                            onChange={(e) => setShippingEmail(e.target.value)}
                            required
                          />
                          <label htmlFor="shippingEmail">Email Address <span className="text-danger">*</span></label>
                          {fieldErrors.shippingEmail && <div className="invalid-feedback">{fieldErrors.shippingEmail}</div>}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="d-flex justify-content-end gap-3 pt-4 border-top">
                  <button
                    type="button"
                    className="btn btn-light px-4"
                    onClick={() => router.back()}
                    disabled={isSubmitting}
                  >
                    <i className="fas fa-times me-2"></i>Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary px-4"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        Creating...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-plus me-2"></i>Create Ticket
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateTicketClient;