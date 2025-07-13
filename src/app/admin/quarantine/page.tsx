'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

interface QuarantinedEmail {
  id: number;
  senderEmail: string;
  senderName: string | null;
  subject: string;
  bodyPreview: string;
  receivedAt: string;
  aiClassification: boolean | null; // Can be null if triage failed
  aiReason: string | null;
  status: string;
}

type ModalAction = 'approve-ticket' | 'approve-comment' | 'reject-spam' | 'delete';

export default function QuarantineReviewPage() {
  const session = useSession();
  const router = useRouter();
  const [emails, setEmails] = useState<QuarantinedEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<QuarantinedEmail | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalAction, setModalAction] = useState<ModalAction | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [targetTicketId, setTargetTicketId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!session?.data?.user) {
      router.push('/auth/signin?callbackUrl=/admin/quarantine');
    }
    // TODO: Add role-based access control when Better Auth types are properly extended
    // } else if (session.data.user.role !== 'admin') {
    //   router.push('/?error=AccessDenied');
    // }
  }, [session, router]);

  const fetchQuarantinedEmails = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/admin/quarantine');
      setEmails(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to load quarantined emails.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.data?.user) {
      fetchQuarantinedEmails();
    }
  }, [session]);

  const openModal = (email: QuarantinedEmail, action: ModalAction) => {
    setSelectedEmail(email);
    setModalAction(action);
    setReviewNotes('');
    setTargetTicketId('');
    setShowModal(true);
  };

  const handleModalSubmit = async () => {
    if (!selectedEmail || !modalAction) return;

    setIsSubmitting(true);
    const toastId = toast.loading(`Processing action: ${modalAction}...`);

    try {
      const endpoint = `/api/admin/quarantine/${selectedEmail.id}/${modalAction}`;
      const payload = {
        reviewNotes,
        targetTicketId: modalAction === 'approve-comment' ? targetTicketId : undefined,
      };

      await axios.post(endpoint, payload);
      toast.success('Action completed successfully!', { id: toastId });
      await fetchQuarantinedEmails(); // Refresh the list
      setShowModal(false);
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to process the action.';
      toast.error(errorMessage, { id: toastId });
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (session?.isPending || loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '80vh' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  const modalTitles = {
    'approve-ticket': 'Approve as New Ticket',
    'approve-comment': 'Approve as Comment',
    'reject-spam': 'Reject as Spam',
    'delete': 'Delete Permanently',
  };

  return (
    <div className="container py-4">
      <h1 className="mb-4">Quarantine Review</h1>
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card shadow-sm">
        <div className="card-body">
          <div className="table-responsive">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>Received</th>
                  <th>From</th>
                  <th>Subject</th>
                  <th>AI Reason</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {emails.length === 0 ? (
                  <tr><td colSpan={5} className="text-center text-muted py-4">The quarantine is empty. Good job!</td></tr>
                ) : (
                  emails.map((email) => (
                    <tr key={email.id}>
                      <td className="text-nowrap">{format(new Date(email.receivedAt), 'MMM d, h:mm a')}</td>
                      <td>{email.senderName ? `${email.senderName} <${email.senderEmail}>` : email.senderEmail}</td>
                      <td>{email.subject}</td>
                      <td><small className="text-muted">{email.aiReason || 'N/A'}</small></td>
                      <td>
                        <div className="btn-group btn-group-sm">
                          <button className="btn btn-outline-success" onClick={() => openModal(email, 'approve-ticket')} title="Approve as Ticket"><i className="fas fa-check"></i></button>
                          <button className="btn btn-outline-info" onClick={() => openModal(email, 'approve-comment')} title="Approve as Comment"><i className="fas fa-comment-dots"></i></button>
                          <button className="btn btn-outline-warning" onClick={() => openModal(email, 'reject-spam')} title="Reject as Spam"><i className="fas fa-ban"></i></button>
                          <button className="btn btn-outline-danger" onClick={() => openModal(email, 'delete')} title="Delete Permanently"><i className="fas fa-trash"></i></button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && selectedEmail && (
        <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{modalTitles[modalAction!]}</h5>
                <button type="button" className="btn-close" onClick={() => setShowModal(false)}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3 p-2 bg-light rounded">
                  <p className="mb-1"><strong>From:</strong> {selectedEmail.senderEmail}</p>
                  <p className="mb-0"><strong>Subject:</strong> {selectedEmail.subject}</p>
                </div>

                {modalAction === 'approve-comment' && (
                  <div className="mb-3">
                    <label htmlFor="targetTicketId" className="form-label">Target Ticket ID *</label>
                    <input type="text" className="form-control" id="targetTicketId" value={targetTicketId} onChange={(e) => setTargetTicketId(e.target.value)} placeholder="Enter the ticket ID to add this as a comment"/>
                  </div>
                )}

                <div className="mb-3">
                  <label htmlFor="reviewNotes" className="form-label">Review Notes (Optional)</label>
                  <textarea className="form-control" id="reviewNotes" value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} rows={2} placeholder="Add any notes about this decision..."></textarea>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)} disabled={isSubmitting}>Cancel</button>
                <button type="button" className={`btn btn-primary`} onClick={handleModalSubmit} disabled={isSubmitting || (modalAction === 'approve-comment' && !targetTicketId)}>
                  {isSubmitting ? <span className="spinner-border spinner-border-sm"></span> : 'Confirm Action'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 