'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { format } from 'date-fns';

interface QuarantinedEmail {
  id: number;
  senderEmail: string;
  senderName: string | null;
  subject: string;
  bodyPreview: string;
  receivedAt: string;
  aiClassification: boolean;
  aiReason: string | null;
  status: string;
}

type ModalAction = 'approve-ticket' | 'approve-comment' | 'reject-spam' | 'reject-vendor' | 'delete';

export default function QuarantineReviewPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [emails, setEmails] = useState<QuarantinedEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<QuarantinedEmail | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalAction, setModalAction] = useState<ModalAction | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [targetTicketId, setTargetTicketId] = useState<string>('');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated' && session?.user?.role !== 'admin') {
      router.push('/'); // Redirect non-admins
    }
  }, [status, session, router]);

  useEffect(() => {
    fetchQuarantinedEmails();
  }, []);

  const fetchQuarantinedEmails = async () => {
    try {
      const response = await axios.get('/api/admin/quarantine');
      setEmails(response.data);
      setLoading(false);
    } catch (err) {
      setError('Failed to load quarantined emails');
      setLoading(false);
    }
  };

  const handleAction = async (email: QuarantinedEmail, action: ModalAction) => {
    setSelectedEmail(email);
    setModalAction(action);
    setShowModal(true);
  };

  const handleModalSubmit = async () => {
    if (!selectedEmail || !modalAction) return;

    try {
      const endpoint = `/api/admin/quarantine/${selectedEmail.id}/${modalAction}`;
      const payload = {
        reviewNotes,
        targetTicketId: modalAction === 'approve-comment' ? targetTicketId : undefined
      };

      await axios.post(endpoint, payload);
      await fetchQuarantinedEmails(); // Refresh the list
      setShowModal(false);
      setReviewNotes('');
      setTargetTicketId('');
    } catch (err) {
      setError('Failed to process the action');
    }
  };

  if (loading) {
    return (
      <div className="container mt-4">
        <div className="d-flex justify-content-center">
          <div className="spinner-border" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mt-4">
      <h1 className="mb-4">Quarantine Review</h1>
      
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      <div className="table-responsive">
        <table className="table table-hover">
          <thead>
            <tr>
              <th>Received</th>
              <th>From</th>
              <th>Subject</th>
              <th>AI Classification</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {emails.map((email) => (
              <tr key={email.id}>
                <td>{format(new Date(email.receivedAt), 'MMM d, yyyy HH:mm')}</td>
                <td>
                  {email.senderName ? `${email.senderName} <${email.senderEmail}>` : email.senderEmail}
                </td>
                <td>{email.subject}</td>
                <td>
                  <span className={`badge ${email.aiClassification ? 'bg-success' : 'bg-danger'}`}>
                    {email.aiClassification ? 'Legitimate' : 'Non-Customer'}
                  </span>
                  {email.aiReason && (
                    <small className="d-block text-muted">{email.aiReason}</small>
                  )}
                </td>
                <td>
                  <span className={`badge bg-${getStatusBadgeColor(email.status)}`}>
                    {email.status.replace('_', ' ')}
                  </span>
                </td>
                <td>
                  <div className="btn-group">
                    <button
                      className="btn btn-sm btn-outline-primary"
                      onClick={() => handleAction(email, 'approve-ticket')}
                    >
                      Approve as Ticket
                    </button>
                    <button
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => handleAction(email, 'approve-comment')}
                    >
                      Approve as Comment
                    </button>
                    <button
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => handleAction(email, 'reject-spam')}
                    >
                      Reject (Spam)
                    </button>
                    <button
                      className="btn btn-sm btn-outline-warning"
                      onClick={() => handleAction(email, 'reject-vendor')}
                    >
                      Reject (Vendor)
                    </button>
                    <button
                      className="btn btn-sm btn-outline-dark"
                      onClick={() => handleAction(email, 'delete')}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && selectedEmail && (
        <div className="modal show d-block" tabIndex={-1}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  {getModalTitle(modalAction)}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowModal(false)}
                ></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <strong>From:</strong> {selectedEmail.senderEmail}
                  <br />
                  <strong>Subject:</strong> {selectedEmail.subject}
                  <br />
                  <strong>Received:</strong> {format(new Date(selectedEmail.receivedAt), 'PPpp')}
                </div>

                {modalAction === 'approve-comment' && (
                  <div className="mb-3">
                    <label htmlFor="targetTicketId" className="form-label">Target Ticket ID</label>
                    <input
                      type="text"
                      className="form-control"
                      id="targetTicketId"
                      value={targetTicketId}
                      onChange={(e) => setTargetTicketId(e.target.value)}
                      placeholder="Enter ticket ID"
                    />
                  </div>
                )}

                <div className="mb-3">
                  <label htmlFor="reviewNotes" className="form-label">Review Notes</label>
                  <textarea
                    className="form-control"
                    id="reviewNotes"
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    rows={3}
                    placeholder="Add any notes about this decision..."
                  ></textarea>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`btn ${getActionButtonClass(modalAction)}`}
                  onClick={handleModalSubmit}
                >
                  {getActionButtonText(modalAction)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper functions
function getStatusBadgeColor(status: string): string {
  switch (status) {
    case 'pending_review': return 'warning';
    case 'approved_ticket': return 'success';
    case 'approved_comment': return 'info';
    case 'rejected_spam': return 'danger';
    case 'rejected_vendor': return 'warning';
    case 'deleted': return 'secondary';
    default: return 'secondary';
  }
}

function getModalTitle(action: ModalAction | null): string {
  switch (action) {
    case 'approve-ticket': return 'Approve as New Ticket';
    case 'approve-comment': return 'Approve as Comment';
    case 'reject-spam': return 'Reject as Spam';
    case 'reject-vendor': return 'Reject as Vendor';
    case 'delete': return 'Delete Email';
    default: return 'Review Email';
  }
}

function getActionButtonClass(action: ModalAction | null): string {
  switch (action) {
    case 'approve-ticket': return 'btn-primary';
    case 'approve-comment': return 'btn-info';
    case 'reject-spam': return 'btn-danger';
    case 'reject-vendor': return 'btn-warning';
    case 'delete': return 'btn-dark';
    default: return 'btn-secondary';
  }
}

function getActionButtonText(action: ModalAction | null): string {
  switch (action) {
    case 'approve-ticket': return 'Create Ticket';
    case 'approve-comment': return 'Add as Comment';
    case 'reject-spam': return 'Confirm Spam';
    case 'reject-vendor': return 'Confirm Vendor';
    case 'delete': return 'Delete';
    default: return 'Submit';
  }
} 