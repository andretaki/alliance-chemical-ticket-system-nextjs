'use client';

import React, { ChangeEvent, useState, useEffect } from 'react';
import Link from 'next/link';
import { Button, Dropdown, Form, Nav, Navbar, Spinner, Badge, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExternalLinkAlt, faInfoCircle, faPaperPlane, faRedo, faSync, faTicketAlt, faBell, faUsers, faKeyboard } from '@fortawesome/free-solid-svg-icons';
import { Ticket as TicketData, TicketUser as BaseUser } from '@/types/ticket';
import { ticketStatusEnum } from '@/db/schema';

interface TicketHeaderBarProps {
  ticket: TicketData;
  users: BaseUser[];
  isUpdatingAssignee: boolean;
  isUpdatingStatus: boolean;
  handleAssigneeChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  handleStatusSelectChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  showAiSuggestionIndicator: boolean;
  onReopenTicket: () => void;
  onMergeClick: () => void;
  orderNumberForStatus?: string | null;
  onGetOrderStatusDraft: () => void;
  isLoadingOrderStatusDraft: boolean;
  onResendInvoice: () => void;
  isResendingInvoice: boolean;
  hasInvoiceInfo: boolean;
}

interface Notification {
  id: string;
  type: 'info' | 'warning' | 'success' | 'danger';
  message: string;
  timestamp: Date;
  read: boolean;
}

interface ActiveUser {
  id: string;
  name: string;
  avatar?: string;
  lastSeen: Date;
}

export default function TicketHeaderBar({
  ticket,
  users,
  isUpdatingAssignee,
  isUpdatingStatus,
  handleAssigneeChange,
  handleStatusSelectChange,
  showAiSuggestionIndicator,
  onReopenTicket,
  onMergeClick,
  orderNumberForStatus,
  onGetOrderStatusDraft,
  isLoadingOrderStatusDraft,
  onResendInvoice,
  isResendingInvoice,
  hasInvoiceInfo
}: TicketHeaderBarProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);

  const isClosed = ticket.status === 'closed';
  const unreadNotifications = notifications.filter(n => !n.read).length;

  // Simulate real-time notifications and active users
  useEffect(() => {
    // Mock notifications
    const mockNotifications: Notification[] = [
      {
        id: '1',
        type: 'info',
        message: 'Customer viewed your last reply',
        timestamp: new Date(Date.now() - 5 * 60 * 1000),
        read: false
      },
      {
        id: '2',
        type: 'success',
        message: 'Order status updated automatically',
        timestamp: new Date(Date.now() - 15 * 60 * 1000),
        read: false
      }
    ];

    // Mock active users
    const mockActiveUsers: ActiveUser[] = [
      {
        id: '1',
        name: 'Sarah Chen',
        lastSeen: new Date(Date.now() - 2 * 60 * 1000)
      },
      {
        id: '2',
        name: 'Mike Johnson',
        lastSeen: new Date(Date.now() - 10 * 60 * 1000)
      }
    ];

    setNotifications(mockNotifications);
    setActiveUsers(mockActiveUsers);
  }, []);

  const getSmartStatusTransitions = () => {
    const currentStatus = ticket.status;
    const suggestedStatuses = [];

    switch (currentStatus) {
      case 'new':
        suggestedStatuses.push({ value: 'open', label: 'Open', icon: 'fa-folder-open', reason: 'Start working on this ticket' });
        if (ticket.assignee) {
          suggestedStatuses.push({ value: 'in_progress', label: 'In Progress', icon: 'fa-play', reason: 'Assigned and ready to work' });
        }
        break;
      case 'open':
        suggestedStatuses.push({ value: 'in_progress', label: 'In Progress', icon: 'fa-play', reason: 'Begin active work' });
        suggestedStatuses.push({ value: 'pending_customer', label: 'Pending Customer', icon: 'fa-clock', reason: 'Waiting for customer response' });
        break;
      case 'in_progress':
        suggestedStatuses.push({ value: 'pending_customer', label: 'Pending Customer', icon: 'fa-clock', reason: 'Waiting for customer input' });
        suggestedStatuses.push({ value: 'closed', label: 'Resolve', icon: 'fa-check', reason: 'Issue resolved' });
        break;
      case 'pending_customer':
        suggestedStatuses.push({ value: 'in_progress', label: 'Resume Work', icon: 'fa-play', reason: 'Customer responded' });
        suggestedStatuses.push({ value: 'closed', label: 'Resolve', icon: 'fa-check', reason: 'No response needed' });
        break;
    }

    return suggestedStatuses;
  };

  const smartStatusTransitions = getSmartStatusTransitions();

  const markNotificationAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success': return 'fa-check-circle text-success';
      case 'warning': return 'fa-exclamation-triangle text-warning';
      case 'danger': return 'fa-exclamation-circle text-danger';
      default: return 'fa-info-circle text-info';
    }
  };

  return (
    <>
      {/* Breadcrumb Navigation */}
      <nav aria-label="breadcrumb" className="bg-light border-bottom">
        <div className="container-fluid">
          <ol className="breadcrumb mb-0 py-2">
            <li className="breadcrumb-item">
              <Link href="/tickets" className="text-decoration-none">
                <i className="fas fa-ticket-alt me-1"></i>Tickets
              </Link>
            </li>
            <li className="breadcrumb-item active" aria-current="page">
              #{ticket.id} - {ticket.title}
            </li>
          </ol>
        </div>
      </nav>

      <Navbar bg="dark" variant="dark" expand="lg" className="ticket-header-bar p-2">
        <div className="d-flex align-items-center text-white me-3">
          <FontAwesomeIcon icon={faTicketAlt} className="me-2" />
          <Navbar.Brand className="mb-0">
            <span className="fw-bold">#{ticket.id}</span>
            <span className="mx-2">•</span>
            <span>{ticket.title}</span>
          </Navbar.Brand>
        </div>
        
        <Navbar.Toggle aria-controls="basic-navbar-nav" />
        <Navbar.Collapse id="basic-navbar-nav">
          <Nav className="ms-auto align-items-center gap-2">
            
            {/* Active Users Indicator */}
            {activeUsers.length > 0 && (
              <OverlayTrigger
                placement="bottom"
                overlay={
                  <Tooltip>
                    <div>
                      <strong>Also viewing:</strong>
                      {activeUsers.map(user => (
                        <div key={user.id} className="small">
                          {user.name} - {Math.round((Date.now() - user.lastSeen.getTime()) / 60000)}m ago
                        </div>
                      ))}
                    </div>
                  </Tooltip>
                }
              >
                <div className="d-flex align-items-center text-info me-2">
                  <FontAwesomeIcon icon={faUsers} className="me-1" />
                  <Badge bg="info" className="rounded-pill">
                    {activeUsers.length}
                  </Badge>
                </div>
              </OverlayTrigger>
            )}

            {/* Notifications */}
            <Dropdown show={showNotifications} onToggle={setShowNotifications}>
              <Dropdown.Toggle 
                variant="outline-light" 
                size="sm" 
                className="position-relative"
                style={{ border: 'none' }}
              >
                <FontAwesomeIcon icon={faBell} />
                {unreadNotifications > 0 && (
                  <Badge 
                    bg="danger" 
                    className="position-absolute top-0 start-100 translate-middle rounded-pill"
                    style={{ fontSize: '0.6rem' }}
                  >
                    {unreadNotifications}
                  </Badge>
                )}
              </Dropdown.Toggle>
              <Dropdown.Menu align="end" style={{ minWidth: '300px' }}>
                <Dropdown.Header>Recent Activity</Dropdown.Header>
                {notifications.length === 0 ? (
                  <Dropdown.Item disabled>No new notifications</Dropdown.Item>
                ) : (
                  notifications.map(notification => (
                    <Dropdown.Item
                      key={notification.id}
                      onClick={() => markNotificationAsRead(notification.id)}
                      className={`small ${!notification.read ? 'bg-light' : ''}`}
                    >
                      <div className="d-flex align-items-start">
                        <i className={`fas ${getNotificationIcon(notification.type)} me-2 mt-1`}></i>
                        <div className="flex-grow-1">
                          <div>{notification.message}</div>
                          <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                            {notification.timestamp.toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                    </Dropdown.Item>
                  ))
                )}
              </Dropdown.Menu>
            </Dropdown>

            {/* Keyboard Shortcuts */}
            <OverlayTrigger
              placement="bottom"
              overlay={
                <Tooltip>
                  <div className="text-start">
                    <div><strong>Keyboard Shortcuts:</strong></div>
                    <div>Ctrl+R: Reply</div>
                    <div>Ctrl+Enter: Send</div>
                    <div>Ctrl+S: Save Draft</div>
                    <div>Ctrl+M: Merge</div>
                  </div>
                </Tooltip>
              }
            >
              <Button variant="outline-light" size="sm" style={{ border: 'none' }}>
                <FontAwesomeIcon icon={faKeyboard} />
              </Button>
            </OverlayTrigger>

            {orderNumberForStatus && (
              <OverlayTrigger
                placement="bottom"
                overlay={<Tooltip>Get AI-generated order status update</Tooltip>}
              >
                <Button
                  variant="outline-info"
                  size="sm"
                  onClick={onGetOrderStatusDraft}
                  disabled={isLoadingOrderStatusDraft || isClosed}
                >
                  {isLoadingOrderStatusDraft ? (
                    <Spinner as="span" animation="border" size="sm" />
                  ) : (
                    <><FontAwesomeIcon icon={faInfoCircle} className="me-1" /> Order Status</>
                  )}
                </Button>
              </OverlayTrigger>
            )}

            {hasInvoiceInfo && (
              <OverlayTrigger
                placement="bottom"
                overlay={<Tooltip>Resend invoice email to customer</Tooltip>}
              >
                <Button
                  variant="outline-light"
                  size="sm"
                  onClick={onResendInvoice}
                  disabled={isResendingInvoice || isClosed}
                >
                  {isResendingInvoice ? (
                    <Spinner as="span" animation="border" size="sm" />
                  ) : (
                    <><FontAwesomeIcon icon={faPaperPlane} className="me-1" /> Resend Invoice</>
                  )}
                </Button>
              </OverlayTrigger>
            )}

            <OverlayTrigger
              placement="bottom"
              overlay={<Tooltip>{isClosed ? 'Cannot merge closed tickets' : 'Merge with another ticket'}</Tooltip>}
            >
              <Button variant="outline-secondary" size="sm" onClick={onMergeClick} disabled={isClosed}>
                Merge
              </Button>
            </OverlayTrigger>

            {isClosed ? (
              <Button variant="success" size="sm" onClick={onReopenTicket}>
                <FontAwesomeIcon icon={faRedo} className="me-1" /> Reopen Ticket
              </Button>
            ) : (
              <Dropdown>
                <Dropdown.Toggle variant="primary" id="dropdown-basic" size="sm" disabled={isUpdatingStatus}>
                  {isUpdatingStatus ? 'Updating...' : 'Change Status'}
                </Dropdown.Toggle>
                <Dropdown.Menu>
                  {smartStatusTransitions.length > 0 && (
                    <>
                      <Dropdown.Header>
                        <i className="fas fa-magic me-1"></i>Suggested Actions
                      </Dropdown.Header>
                      {smartStatusTransitions.map(status => (
                        <Dropdown.Item 
                          key={status.value} 
                          onClick={() => handleStatusSelectChange({ target: { value: status.value } } as any)}
                          className="d-flex align-items-center"
                        >
                          <i className={`fas ${status.icon} me-2 text-primary`}></i>
                          <div>
                            <div>{status.label}</div>
                            <small className="text-muted">{status.reason}</small>
                          </div>
                        </Dropdown.Item>
                      ))}
                      <Dropdown.Divider />
                      <Dropdown.Header>All Statuses</Dropdown.Header>
                    </>
                  )}
                  {ticketStatusEnum.enumValues.map(status => (
                    <Dropdown.Item 
                      key={status} 
                      onClick={() => handleStatusSelectChange({ target: { value: status } } as any)}
                      className={ticket.status === status ? 'active' : ''}
                    >
                      {status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown>
            )}

            <div className="d-flex align-items-center text-white">
              <span className="me-2">Assignee:</span>
              {isUpdatingAssignee ? (
                <Spinner animation="border" size="sm" />
              ) : (
                <Form.Select 
                  value={ticket.assignee?.id || ''} 
                  onChange={handleAssigneeChange} 
                  disabled={isUpdatingAssignee} 
                  size="sm"
                  style={{ 
                    width: '140px', 
                    background: 'var(--bs-dark)', 
                    color: 'white', 
                    border: '1px solid rgba(255,255,255,0.2)'
                  }}
                >
                  <option value="">Unassigned</option>
                  {users.map(user => (
                    <option key={user.id} value={user.id} style={{ background: '#212529', color: 'white' }}>
                      {user.name || user.email}
                    </option>
                  ))}
                </Form.Select>
              )}
            </div>

            {showAiSuggestionIndicator && (
              <OverlayTrigger
                placement="bottom"
                overlay={<Tooltip>AI suggestion available in conversation</Tooltip>}
              >
                <div className="ai-indicator text-info" style={{ cursor: 'help' }}>
                  <FontAwesomeIcon icon={faSync} spin />
                  <span className="ms-1">AI</span>
                </div>
              </OverlayTrigger>
            )}
          </Nav>
        </Navbar.Collapse>
      </Navbar>
    </>
  );
}