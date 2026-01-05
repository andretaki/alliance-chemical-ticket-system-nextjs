// src/components/CreateTicketClient.tsx
'use client';

import React, { useState, useEffect } from 'react';
import axios, { AxiosError } from 'axios';
import { useRouter } from 'next/navigation';
import { ticketPriorityEnum, ticketStatusEnum, ticketTypeEcommerceEnum } from '@/db/schema';
import Link from 'next/link';
import {
  Ticket,
  ArrowLeft,
  AlertCircle,
  X,
  CheckCircle,
  FileText,
  Info,
  Settings,
  User as UserIcon,
  Mail,
  Phone,
  Building,
  ShoppingCart,
  Truck,
  Plus,
} from 'lucide-react';

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
        senderCompany: customerCompany,
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
      <div className="loading-container">
        <div className="loading-content">
          <div className="loading-spinner">
            <div className="spinner-ring" />
            <div className="spinner-ring" />
            <div className="spinner-ring" />
          </div>
          <h3>Setting Up Form</h3>
          <p>Loading user data and preparing the ticket creation form...</p>
        </div>
        
        <style jsx>{`
          .loading-container {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 60vh;
            background: rgba(255, 255, 255, 0.02);
            border-radius: 24px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(20px);
            margin: 2rem;
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
      <div className="create-ticket-container">
        {/* Header Section */}
        <div className="form-header">
          <div className="header-content">
            <div className="header-main">
              <div className="header-icon">
                <Ticket />
              </div>
              <div className="header-text">
                <h1 className="header-title">
                  Create New Ticket
                  <div className="title-glow" />
                </h1>
                <p className="header-subtitle">Fill out the form below to create a new support ticket</p>
              </div>
            </div>
            <button
              type="button"
              className="back-btn"
              onClick={() => router.back()}
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
          </div>
        </div>

        {/* Alert Messages */}
        {error && !Object.keys(fieldErrors).length && (
          <div className="alert alert-error">
            <div className="alert-content">
              <AlertCircle className="alert-icon" />
              <div className="alert-text">{error}</div>
              <button type="button" className="alert-close" onClick={() => setError(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {createdTicketId && (
          <div className="alert alert-success">
            <div className="alert-content">
              <CheckCircle className="alert-icon" />
              <div className="alert-text">
                <div className="alert-title">Ticket Created Successfully!</div>
                <div className="alert-subtitle">Your ticket has been created and assigned ID #{createdTicketId}</div>
              </div>
              <Link 
                href={`/tickets/${createdTicketId}/create-quote`} 
                className="quote-btn"
              >
                <FileText className="w-4 h-4" />
                Create Quote
              </Link>
            </div>
          </div>
        )}

        {/* Main Form */}
        <div className="form-container">
          <form onSubmit={handleSubmit} className="ticket-form">
            
            {/* Basic Information Section */}
            <div className="form-section">
              <div className="section-header">
                <div className="section-icon">
                  <Info />
                </div>
                <div className="section-title">Basic Information</div>
              </div>
              
              <div className="form-grid">
                <div className="form-group full-width">
                  <label className="form-label">
                    <span className="label-text">Ticket Title</span>
                    <span className="label-required">*</span>
                  </label>
                  <div className="input-wrapper">
                    <input
                      type="text"
                      className={`form-input ${fieldErrors.title ? 'error' : ''}`}
                      placeholder="Enter ticket title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                    />
                    {fieldErrors.title && <div className="field-error">{fieldErrors.title}</div>}
                  </div>
                </div>
                
                <div className="form-group full-width">
                  <label className="form-label">
                    <span className="label-text">Description</span>
                    <span className="label-required">*</span>
                  </label>
                  <div className="input-wrapper">
                    <textarea
                      className={`form-textarea ${fieldErrors.description ? 'error' : ''}`}
                      placeholder="Describe the issue or request in detail"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      required
                      rows={4}
                    />
                    {fieldErrors.description && <div className="field-error">{fieldErrors.description}</div>}
                  </div>
                </div>
              </div>
            </div>

            {/* Ticket Settings Section */}
            <div className="form-section">
              <div className="section-header">
                <div className="section-icon">
                  <Settings />
                </div>
                <div className="section-title">Ticket Settings</div>
              </div>
              
              <div className="form-grid grid-4">
                <div className="form-group">
                  <label className="form-label">
                    <span className="label-text">Ticket Type</span>
                  </label>
                  <select
                    className={`form-select ${fieldErrors.type ? 'error' : ''}`}
                    value={type || ''}
                    onChange={(e) => setType(e.target.value || null)}
                  >
                    <option value="">Select Type</option>
                    {ticketTypeEcommerceEnum.enumValues.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  {fieldErrors.type && <div className="field-error">{fieldErrors.type}</div>}
                </div>
                
                <div className="form-group">
                  <label className="form-label">
                    <span className="label-text">Priority</span>
                  </label>
                  <select
                    className="form-select"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    {ticketPriorityEnum.enumValues.map((p) => (
                      <option key={p} value={p}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </option>
                    ))}
                  </select>
                  <div className="priority-preview">
                    <span className={`priority-badge priority-${getPriorityColor(priority)}`}>
                      {priority.charAt(0).toUpperCase() + priority.slice(1)}
                    </span>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    <span className="label-text">Status</span>
                  </label>
                  <select
                    className="form-select"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    {ticketStatusEnum.enumValues.map((s) => (
                      <option key={s} value={s}>
                        {s.replace('_', ' ').charAt(0).toUpperCase() + s.replace('_', ' ').slice(1)}
                      </option>
                    ))}
                  </select>
                  <div className="status-preview">
                    <span className={`status-badge status-${getStatusColor(status)}`}>
                      {status.replace('_', ' ').charAt(0).toUpperCase() + status.replace('_', ' ').slice(1)}
                    </span>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    <span className="label-text">Assignee</span>
                  </label>
                  <select
                    className={`form-select ${fieldErrors.assigneeEmail ? 'error' : ''}`}
                    value={assigneeEmail || ''}
                    onChange={(e) => setAssigneeEmail(e.target.value || null)}
                  >
                    <option value="">Unassigned</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.email}>
                        {user.name || user.email}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.assigneeEmail && <div className="field-error">{fieldErrors.assigneeEmail}</div>}
                </div>
              </div>
            </div>

            {/* Customer Information Section */}
            <div className="form-section">
              <div className="section-header">
                <div className="section-icon">
                  <UserIcon />
                </div>
                <div className="section-title">Customer Information</div>
              </div>
              
              <div className="form-grid grid-2">
                <div className="form-group">
                  <label className="form-label">
                    <span className="label-text">Email Address</span>
                  </label>
                  <div className="input-wrapper">
                    <div className="input-icon">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      className={`form-input with-icon ${fieldErrors.senderEmail ? 'error' : ''}`}
                      placeholder="customer@example.com"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                    />
                    {fieldErrors.senderEmail && <div className="field-error">{fieldErrors.senderEmail}</div>}
                  </div>
                </div>
                
                <div className="form-group">
                  <label className="form-label">
                    <span className="label-text">Phone Number</span>
                  </label>
                  <div className="input-wrapper">
                    <div className="input-icon">
                      <Phone className="w-4 h-4" />
                    </div>
                    <input
                      type="tel"
                      className={`form-input with-icon ${fieldErrors.senderPhone ? 'error' : ''}`}
                      placeholder="Phone Number"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                    />
                    {fieldErrors.senderPhone && <div className="field-error">{fieldErrors.senderPhone}</div>}
                  </div>
                </div>
                
                <div className="form-group">
                  <label className="form-label">
                    <span className="label-text">Company</span>
                  </label>
                  <div className="input-wrapper">
                    <div className="input-icon">
                      <Building className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      className={`form-input with-icon ${fieldErrors.senderCompany ? 'error' : ''}`}
                      placeholder="Company Name"
                      value={customerCompany}
                      onChange={(e) => setCustomerCompany(e.target.value)}
                    />
                    {fieldErrors.senderCompany && <div className="field-error">{fieldErrors.senderCompany}</div>}
                  </div>
                </div>
                
                <div className="form-group">
                  <label className="form-label">
                    <span className="label-text">Order Number</span>
                  </label>
                  <div className="input-wrapper">
                    <div className="input-icon">
                      <ShoppingCart className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      className={`form-input with-icon ${fieldErrors.orderNumber ? 'error' : ''}`}
                      placeholder="Order Number"
                      value={orderNumber}
                      onChange={(e) => setOrderNumber(e.target.value)}
                    />
                    {fieldErrors.orderNumber && <div className="field-error">{fieldErrors.orderNumber}</div>}
                  </div>
                </div>
              </div>
            </div>

            {/* Shipping Address Section - Conditional */}
            {type === 'International Shipping' && (
              <div className="form-section shipping-section">
                <div className="section-header">
                  <div className="section-icon">
                    <Truck />
                  </div>
                  <div className="section-title">Shipping Address</div>
                  <div className="section-badge">
                    <span>International Shipping Required</span>
                  </div>
                </div>
                
                <div className="form-grid grid-2">
                  <div className="form-group">
                    <label className="form-label">
                      <span className="label-text">Recipient Name</span>
                      <span className="label-required">*</span>
                    </label>
                    <input
                      type="text"
                      className={`form-input ${fieldErrors.shippingName ? 'error' : ''}`}
                      placeholder="Recipient Name"
                      value={shippingName}
                      onChange={(e) => setShippingName(e.target.value)}
                      required
                    />
                    {fieldErrors.shippingName && <div className="field-error">{fieldErrors.shippingName}</div>}
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label">
                      <span className="label-text">Company</span>
                    </label>
                    <input
                      type="text"
                      className={`form-input ${fieldErrors.shippingCompany ? 'error' : ''}`}
                      placeholder="Company Name"
                      value={shippingCompany}
                      onChange={(e) => setShippingCompany(e.target.value)}
                    />
                    {fieldErrors.shippingCompany && <div className="field-error">{fieldErrors.shippingCompany}</div>}
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label">
                      <span className="label-text">Country</span>
                      <span className="label-required">*</span>
                    </label>
                    <input
                      type="text"
                      className={`form-input ${fieldErrors.shippingCountry ? 'error' : ''}`}
                      placeholder="Country"
                      value={shippingCountry}
                      onChange={(e) => setShippingCountry(e.target.value)}
                      required
                    />
                    {fieldErrors.shippingCountry && <div className="field-error">{fieldErrors.shippingCountry}</div>}
                  </div>
                  
                  <div className="form-group full-width">
                    <label className="form-label">
                      <span className="label-text">Street Address</span>
                      <span className="label-required">*</span>
                    </label>
                    <input
                      type="text"
                      className={`form-input ${fieldErrors.shippingAddressLine1 ? 'error' : ''}`}
                      placeholder="Street Address"
                      value={shippingAddressLine1}
                      onChange={(e) => setShippingAddressLine1(e.target.value)}
                      required
                    />
                    {fieldErrors.shippingAddressLine1 && <div className="field-error">{fieldErrors.shippingAddressLine1}</div>}
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label">
                      <span className="label-text">Address Line 2</span>
                    </label>
                    <input
                      type="text"
                      className={`form-input ${fieldErrors.shippingAddressLine2 ? 'error' : ''}`}
                      placeholder="Apartment, suite, etc."
                      value={shippingAddressLine2}
                      onChange={(e) => setShippingAddressLine2(e.target.value)}
                    />
                    {fieldErrors.shippingAddressLine2 && <div className="field-error">{fieldErrors.shippingAddressLine2}</div>}
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label">
                      <span className="label-text">Address Line 3</span>
                    </label>
                    <input
                      type="text"
                      className={`form-input ${fieldErrors.shippingAddressLine3 ? 'error' : ''}`}
                      placeholder="Additional address info"
                      value={shippingAddressLine3}
                      onChange={(e) => setShippingAddressLine3(e.target.value)}
                    />
                    {fieldErrors.shippingAddressLine3 && <div className="field-error">{fieldErrors.shippingAddressLine3}</div>}
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label">
                      <span className="label-text">City</span>
                      <span className="label-required">*</span>
                    </label>
                    <input
                      type="text"
                      className={`form-input ${fieldErrors.shippingCity ? 'error' : ''}`}
                      placeholder="City"
                      value={shippingCity}
                      onChange={(e) => setShippingCity(e.target.value)}
                      required
                    />
                    {fieldErrors.shippingCity && <div className="field-error">{fieldErrors.shippingCity}</div>}
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label">
                      <span className="label-text">State/Province</span>
                      <span className="label-required">*</span>
                    </label>
                    <input
                      type="text"
                      className={`form-input ${fieldErrors.shippingState ? 'error' : ''}`}
                      placeholder="State/Province"
                      value={shippingState}
                      onChange={(e) => setShippingState(e.target.value)}
                      required
                    />
                    {fieldErrors.shippingState && <div className="field-error">{fieldErrors.shippingState}</div>}
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label">
                      <span className="label-text">Postal Code</span>
                      <span className="label-required">*</span>
                    </label>
                    <input
                      type="text"
                      className={`form-input ${fieldErrors.shippingPostalCode ? 'error' : ''}`}
                      placeholder="Postal Code"
                      value={shippingPostalCode}
                      onChange={(e) => setShippingPostalCode(e.target.value)}
                      required
                    />
                    {fieldErrors.shippingPostalCode && <div className="field-error">{fieldErrors.shippingPostalCode}</div>}
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label">
                      <span className="label-text">Phone Number</span>
                      <span className="label-required">*</span>
                    </label>
                    <input
                      type="tel"
                      className={`form-input ${fieldErrors.shippingPhone ? 'error' : ''}`}
                      placeholder="Phone Number"
                      value={shippingPhone}
                      onChange={(e) => setShippingPhone(e.target.value)}
                      required
                    />
                    {fieldErrors.shippingPhone && <div className="field-error">{fieldErrors.shippingPhone}</div>}
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label">
                      <span className="label-text">Email Address</span>
                      <span className="label-required">*</span>
                    </label>
                    <input
                      type="email"
                      className={`form-input ${fieldErrors.shippingEmail ? 'error' : ''}`}
                      placeholder="Email Address"
                      value={shippingEmail}
                      onChange={(e) => setShippingEmail(e.target.value)}
                      required
                    />
                    {fieldErrors.shippingEmail && <div className="field-error">{fieldErrors.shippingEmail}</div>}
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="form-actions">
              <button
                type="button"
                className="action-btn cancel-btn"
                onClick={() => router.back()}
                disabled={isSubmitting}
              >
                <X className="w-4 h-4" />
                <span>Cancel</span>
              </button>
              <button
                type="submit"
                className="action-btn submit-btn"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <div className="btn-spinner">
                      <div className="spinner-ring" />
                    </div>
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>Create Ticket</span>
                  </>
                )}
                <div className="btn-glow" />
              </button>
            </div>
          </form>
        </div>
      </div>

      <style jsx>{`
        .create-ticket-container {
          min-height: 100vh;
          background: rgba(255, 255, 255, 0.02);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px;
          overflow: hidden;
          animation: slideInUp 0.6s ease-out;
          margin: 1rem;
        }

        .form-header {
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
          gap: 1.5rem;
        }

        .header-icon {
          width: 60px;
          height: 60px;
          background: linear-gradient(135deg, #667eea, #764ba2);
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 1.5rem;
          box-shadow: 0 8px 30px rgba(102, 126, 234, 0.4);
          animation: iconFloat 3s ease-in-out infinite;
        }

        @keyframes iconFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-5px); }
        }

        .header-text {
          position: relative;
        }

        .header-title {
          position: relative;
          margin: 0 0 0.5rem 0;
          font-size: 2rem;
          font-weight: 700;
          color: white;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
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

        .header-title:hover .title-glow {
          opacity: 0.3;
        }

        .header-subtitle {
          margin: 0;
          color: rgba(255, 255, 255, 0.7);
          font-size: 1rem;
        }

        .back-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.5rem;
          background: rgba(107, 114, 128, 0.2);
          color: rgba(255, 255, 255, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
          text-decoration: none;
          backdrop-filter: blur(10px);
        }

        .back-btn:hover {
          background: rgba(107, 114, 128, 0.3);
          color: white;
          transform: translateY(-1px);
        }

        .alert {
          margin: 1.5rem 2rem;
          border-radius: 16px;
          animation: slideInDown 0.3s ease-out;
          backdrop-filter: blur(10px);
        }

        .alert-error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
        }

        .alert-success {
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.3);
        }

        .alert-content {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1.25rem 1.5rem;
        }

        .alert-icon {
          font-size: 1.25rem;
          flex-shrink: 0;
        }

        .alert-error .alert-icon {
          color: #ef4444;
        }

        .alert-success .alert-icon {
          color: #10b981;
        }

        .alert-text {
          flex: 1;
          color: rgba(255, 255, 255, 0.9);
        }

        .alert-title {
          font-weight: 600;
          margin-bottom: 0.25rem;
        }

        .alert-subtitle {
          font-size: 0.875rem;
          opacity: 0.8;
        }

        .alert-close {
          background: none;
          border: none;
          color: inherit;
          cursor: pointer;
          padding: 0.25rem;
          border-radius: 6px;
          transition: all 0.2s ease;
        }

        .alert-close:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .quote-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          background: linear-gradient(135deg, #10b981, #059669);
          color: white;
          text-decoration: none;
          border-radius: 10px;
          font-weight: 500;
          font-size: 0.875rem;
          transition: all 0.3s ease;
        }

        .quote-btn:hover {
          color: white;
          transform: translateY(-1px);
          box-shadow: 0 4px 20px rgba(16, 185, 129, 0.3);
        }

        .form-container {
          padding: 2rem;
        }

        .ticket-form {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .form-section {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          padding: 2rem;
          transition: all 0.3s ease;
        }

        .form-section:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.2);
        }

        .shipping-section {
          border-color: rgba(102, 126, 234, 0.3);
          background: rgba(102, 126, 234, 0.05);
        }

        .shipping-section:hover {
          border-color: rgba(102, 126, 234, 0.4);
          background: rgba(102, 126, 234, 0.08);
        }

        .section-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1.5rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .section-icon {
          width: 40px;
          height: 40px;
          background: linear-gradient(135deg, rgba(102, 126, 234, 0.2), rgba(118, 75, 162, 0.2));
          border: 1px solid rgba(102, 126, 234, 0.3);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #667eea;
          font-size: 1rem;
        }

        .section-title {
          font-size: 1.25rem;
          font-weight: 600;
          color: white;
          flex: 1;
        }

        .section-badge {
          background: rgba(102, 126, 234, 0.2);
          border: 1px solid rgba(102, 126, 234, 0.3);
          border-radius: 20px;
          padding: 0.25rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 500;
          color: #667eea;
          text-transform: uppercase;
          letter-spacing: 0.025em;
        }

        .form-grid {
          display: grid;
          gap: 1.5rem;
          grid-template-columns: 1fr 1fr;
        }

        .form-grid.grid-4 {
          grid-template-columns: repeat(4, 1fr);
        }

        .form-grid.grid-2 {
          grid-template-columns: repeat(2, 1fr);
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .form-group.full-width {
          grid-column: 1 / -1;
        }

        .form-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: rgba(255, 255, 255, 0.9);
          font-weight: 500;
          font-size: 0.875rem;
        }

        .label-text {
          flex: 1;
        }

        .label-required {
          color: #ef4444;
          font-weight: bold;
        }

        .input-wrapper {
          position: relative;
        }

        .input-icon {
          position: absolute;
          left: 1rem;
          top: 50%;
          transform: translateY(-50%);
          color: rgba(255, 255, 255, 0.5);
          z-index: 2;
          pointer-events: none;
        }

        .form-input,
        .form-select,
        .form-textarea {
          width: 100%;
          padding: 0.875rem 1rem;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          color: white;
          font-size: 0.875rem;
          transition: all 0.3s ease;
          backdrop-filter: blur(10px);
          font-family: inherit;
        }

        .form-input.with-icon {
          padding-left: 2.5rem;
        }

        .form-input:focus,
        .form-select:focus,
        .form-textarea:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
          background: rgba(255, 255, 255, 0.08);
        }

        .form-input::placeholder,
        .form-textarea::placeholder {
          color: rgba(255, 255, 255, 0.5);
        }

        .form-input.error,
        .form-select.error,
        .form-textarea.error {
          border-color: #ef4444;
          box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
        }

        .form-select option {
          background: #1a1a1a;
          color: white;
        }

        .form-textarea {
          resize: vertical;
          min-height: 100px;
        }

        .field-error {
          color: #ef4444;
          font-size: 0.75rem;
          font-weight: 500;
          margin-top: 0.25rem;
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }

        .field-error::before {
          content: "⚠";
          font-size: 0.8rem;
        }

        .priority-preview,
        .status-preview {
          margin-top: 0.5rem;
        }

        .priority-badge,
        .status-badge {
          padding: 0.25rem 0.75rem;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.025em;
          display: inline-block;
        }

        .priority-success,
        .status-success {
          background: rgba(16, 185, 129, 0.2);
          color: #10b981;
          border: 1px solid rgba(16, 185, 129, 0.3);
        }

        .priority-warning,
        .status-warning {
          background: rgba(245, 158, 11, 0.2);
          color: #f59e0b;
          border: 1px solid rgba(245, 158, 11, 0.3);
        }

        .priority-danger,
        .status-danger {
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }

        .priority-primary,
        .status-primary {
          background: rgba(102, 126, 234, 0.2);
          color: #667eea;
          border: 1px solid rgba(102, 126, 234, 0.3);
        }

        .priority-info,
        .status-info {
          background: rgba(59, 130, 246, 0.2);
          color: #3b82f6;
          border: 1px solid rgba(59, 130, 246, 0.3);
        }

        .priority-secondary,
        .status-secondary {
          background: rgba(107, 114, 128, 0.2);
          color: #9ca3af;
          border: 1px solid rgba(107, 114, 128, 0.3);
        }

        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 1rem;
          padding-top: 2rem;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .action-btn {
          position: relative;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.875rem 2rem;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          backdrop-filter: blur(10px);
          overflow: hidden;
          font-family: inherit;
          font-size: 0.875rem;
        }

        .cancel-btn {
          background: rgba(107, 114, 128, 0.2);
          color: rgba(255, 255, 255, 0.8);
        }

        .cancel-btn:hover:not(:disabled) {
          background: rgba(107, 114, 128, 0.3);
          color: white;
          transform: translateY(-1px);
        }

        .submit-btn {
          background: linear-gradient(135deg, #667eea, #764ba2);
          color: white;
          min-width: 180px;
          justify-content: center;
        }

        .submit-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 30px rgba(102, 126, 234, 0.4);
        }

        .submit-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
          transform: none !important;
        }

        .btn-spinner {
          width: 16px;
          height: 16px;
          position: relative;
        }

        .btn-spinner .spinner-ring {
          width: 100%;
          height: 100%;
          border: 2px solid transparent;
          border-top: 2px solid white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
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

        .submit-btn:hover:not(:disabled) .btn-glow {
          opacity: 1;
        }

        @keyframes slideInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
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

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Responsive Design */
        @media (max-width: 1200px) {
          .form-grid.grid-4 {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 768px) {
          .create-ticket-container {
            margin: 0.5rem;
            border-radius: 16px;
          }

          .form-header {
            padding: 1.5rem;
          }

          .header-content {
            flex-direction: column;
            align-items: flex-start;
          }

          .header-title {
            font-size: 1.5rem;
          }

          .form-container {
            padding: 1.5rem;
          }

          .form-section {
            padding: 1.5rem;
          }

          .form-grid,
          .form-grid.grid-2,
          .form-grid.grid-4 {
            grid-template-columns: 1fr;
          }

          .form-actions {
            flex-direction: column-reverse;
          }

          .action-btn {
            justify-content: center;
          }
        }
      `}</style>
    </>
  );
};

export default CreateTicketClient;