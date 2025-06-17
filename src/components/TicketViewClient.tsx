// src/components/TicketViewClient.tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo, ChangeEvent, FormEvent } from 'react';
import axios, { AxiosError } from 'axios';
import Link from 'next/link';
import { ticketStatusEnum, users as usersSchema } from '@/db/schema';
import { InferSelectModel } from 'drizzle-orm';
import toast from 'react-hot-toast';
import { Alert } from 'react-bootstrap';

// Import components
import TicketHeaderBar from './ticket-view/TicketHeaderBar';
import CommunicationHistory from './ticket-view/CommunicationHistory';
import ReplyForm from './ticket-view/ReplyForm';
import TicketDetailsSidebar from './ticket-view/TicketDetailsSidebar';
import ShippingInfoSidebar from './ticket-view/ShippingInfoSidebar';
import MergeTicketModal from './ticket-view/MergeTicketModal';
import type { ShopifyDraftOrderGQLResponse } from '@/agents/quoteAssistant/quoteInterfaces';
import type { Ticket as TicketData, TicketComment as CommentData, AttachmentData, TicketUser as BaseUser } from '@/types/ticket';

// Types
type User = InferSelectModel<typeof usersSchema>;

// Type for valid ticket status values
type TicketStatus = typeof ticketStatusEnum.enumValues[number];

interface TicketViewClientProps {
  initialTicket: TicketData;
  relatedQuote?: ShopifyDraftOrderGQLResponse | null;
  quoteAdminUrl?: string | null;
}

const AI_SUGGESTION_MARKERS = [
  "**AI Suggested Reply:**", "**Order Status Found - Suggested Reply:**",
  "**Suggested Reply (Request for Lot #):**", "**Order Status Reply:**",
  "**Suggested Reply (SDS Document):**", "**Suggested Reply (COC Information):**",
  "**Suggested Reply (Document Request):**", "**AI Order Status Reply:**", "**AI COA Reply:**"
];

const isAISuggestionNote = (text: string | null): boolean => !!text && AI_SUGGESTION_MARKERS.some(marker => text.startsWith(marker));
const extractAISuggestionContent = (text: string | null): string => {
  if (!text) return '';
  for (const marker of AI_SUGGESTION_MARKERS) {
    if (text.startsWith(marker)) return text.substring(marker.length).trim();
  }
  return text;
};

export default function TicketViewClient({ initialTicket, relatedQuote, quoteAdminUrl }: TicketViewClientProps) {
  const [ticket, setTicket] = useState<TicketData>(initialTicket);
  const [users, setUsers] = useState<BaseUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUsersLoading, setIsUsersLoading] = useState(true);
  const [isUpdatingAssignee, setIsUpdatingAssignee] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [sendAsEmail, setSendAsEmail] = useState(true); // Default to sending email
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [extractedStatus, setExtractedStatus] = useState<string | null>(null);
  const [extractedCarrier, setExtractedCarrier] = useState<string | null>(null);
  const [extractedTracking, setExtractedTracking] = useState<string | null>(null);
  const [extractedShipDate, setExtractedShipDate] = useState<string | null>(null);
  const [extractedOrderDate, setExtractedOrderDate] = useState<string | null>(null);
  const [isLoadingOrderStatusDraft, setIsLoadingOrderStatusDraft] = useState(false);
  const [isResendingInvoice, setIsResendingInvoice] = useState(false);
  
  const conversationHistory = useMemo(() => {
    const history: CommentData[] = [];
    if (ticket.description) {
      history.push({
        id: -1, commentText: ticket.description, createdAt: ticket.createdAt,
        commenter: ticket.reporter, isInternalNote: false, isFromCustomer: true, isOutgoingReply: false,
        attachments: ticket.attachments?.filter(a => !a.commentId) || [],
      });
    }
    history.push(...ticket.comments);
    return history;
  }, [ticket]);

  const refreshTicket = useCallback(async () => {
    try {
      const response = await axios.get<TicketData>(`/api/tickets/${initialTicket.id}`);
      setTicket(response.data);
    } catch (err) {
      toast.error("Failed to refresh ticket data.");
    }
  }, [initialTicket.id]);

  const handleAssigneeChange = useCallback(async (e: ChangeEvent<HTMLSelectElement>) => {
    const newAssigneeId = e.target.value || null;
    setIsUpdatingAssignee(true);
    try {
      await axios.put(`/api/tickets/${ticket.id}`, { assigneeId: newAssigneeId });
      setTicket(prev => ({ ...prev, assignee: newAssigneeId ? users.find(u => u.id === newAssigneeId) || null : null }));
      toast.success('Assignee updated!');
    } catch (err) { toast.error('Failed to update assignee.'); }
    finally { setIsUpdatingAssignee(false); }
  }, [ticket.id, users]);

  const handleStatusSelectChange = useCallback(async (e: ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value as 'new' | 'open' | 'in_progress' | 'pending_customer' | 'closed';
    setIsUpdatingStatus(true);
    try {
      await axios.put(`/api/tickets/${ticket.id}`, { status: newStatus });
      setTicket(prev => ({ ...prev, status: newStatus }));
      toast.success(`Status updated to ${newStatus.replace('_', ' ')}`);
    } catch (err) { toast.error('Failed to update status.'); }
    finally { setIsUpdatingStatus(false); }
  }, [ticket.id]);

  const handleCommentSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() && files.length === 0) return;
    setIsSubmittingComment(true);
    const toastId = toast.loading('Submitting...');
    try {
      let attachmentIds: number[] = [];
      if (files.length > 0) {
        const formData = new FormData();
        files.forEach(file => formData.append('files', file));
        const uploadRes = await axios.post(`/api/tickets/${ticket.id}/attachments`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        attachmentIds = uploadRes.data.attachments.map((att: AttachmentData) => att.id);
      }
      await axios.post(`/api/tickets/${ticket.id}/reply`, { content: newComment, isInternalNote, sendAsEmail, attachmentIds });
      toast.success('Reply submitted!', { id: toastId });
      setNewComment('');
      setFiles([]);
      refreshTicket();
    } catch (err) {
      const errorMsg = err instanceof AxiosError ? err.response?.data?.error || err.message : 'An unknown error occurred.';
      toast.error(errorMsg, { id: toastId });
    } finally { setIsSubmittingComment(false); }
  }, [newComment, files, ticket.id, isInternalNote, sendAsEmail, refreshTicket]);

  const handleApproveAndSendDraft = useCallback(async (draftText: string) => {
    setNewComment(draftText);
    setIsInternalNote(false);
    setSendAsEmail(true);
    toast.success('AI suggestion moved to reply box. Review and send.');
  }, []);

  const onReopenTicket = useCallback(async () => {
    const toastId = toast.loading('Reopening ticket...');
    try {
      await axios.post(`/api/admin/tickets/${ticket.id}/reopen`);
      toast.success('Ticket reopened!', { id: toastId });
      refreshTicket();
    } catch (err) {
      const errorMsg = err instanceof AxiosError ? err.response?.data?.error : 'Failed to reopen ticket.';
      toast.error(errorMsg, { id: toastId });
    }
  }, [ticket.id, refreshTicket]);

  const onGetOrderStatusDraft = useCallback(async () => {
    setIsLoadingOrderStatusDraft(true);
    try {
      const response = await axios.get(`/api/tickets/${ticket.id}/draft-order-status`);
      setNewComment(response.data.draftMessage);
      setSendAsEmail(true);
      setIsInternalNote(false);
      toast.success('Order status reply drafted!');
    } catch (err) {
      const errorMsg = err instanceof AxiosError ? err.response?.data?.error || 'Failed to get order status.' : 'Failed to get order status.';
      toast.error(errorMsg);
    } finally { setIsLoadingOrderStatusDraft(false); }
  }, [ticket.id]);

  const onResendInvoice = useCallback(async () => {
    if (!relatedQuote) return;
    setIsResendingInvoice(true);
    try {
      await axios.post('/api/email/send-invoice', {
        draftOrderId: relatedQuote.id,
        recipientEmail: ticket.senderEmail,
        ticketId: ticket.id
      });
      toast.success('Invoice email resent!');
      refreshTicket();
    } catch (err) { toast.error('Failed to resend invoice.'); }
    finally { setIsResendingInvoice(false); }
  }, [relatedQuote, ticket.id, ticket.senderEmail, refreshTicket]);

  const insertSuggestedResponse = useCallback(() => {
    const aiSuggestion = ticket.comments.slice().reverse().find(c => isAISuggestionNote(c.commentText));
    if (aiSuggestion?.commentText) {
      setNewComment(extractAISuggestionContent(aiSuggestion.commentText));
      setIsInternalNote(false);
      setSendAsEmail(true);
      toast.success('AI suggestion added to reply box.');
    }
  }, [ticket.comments]);
  
  useEffect(() => {
    const fetchUsers = async () => {
      setIsUsersLoading(true);
      try {
        const res = await axios.get<BaseUser[]>('/api/users');
        setUsers(res.data);
      } catch (err) { setError("Could not load assignable users."); }
      finally { setIsUsersLoading(false); }
    };
    fetchUsers();
  }, []);

  if (isUsersLoading || !ticket) {
    return (
      <div className="ticket-view-page flex items-center justify-center">
        <div className="text-center text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <h5 className="font-semibold">Loading Ticket...</h5>
        </div>
      </div>
    );
  }

  return (
    <div className="ticket-view-page">
      <MergeTicketModal show={showMergeModal} onHide={() => setShowMergeModal(false)} primaryTicketId={ticket.id} onMergeSuccess={refreshTicket} />
      {error && <Alert variant="danger" onClose={() => setError(null)} dismissible className="m-3">{error}</Alert>}

      <TicketHeaderBar
        ticket={ticket} users={users} isUpdatingAssignee={isUpdatingAssignee} isUpdatingStatus={isUpdatingStatus}
        handleAssigneeChange={handleAssigneeChange} handleStatusSelectChange={handleStatusSelectChange}
        showAiSuggestionIndicator={conversationHistory.some(c => isAISuggestionNote(c.commentText))}
        onReopenTicket={onReopenTicket} onMergeClick={() => setShowMergeModal(true)}
        orderNumberForStatus={ticket.orderNumber} onGetOrderStatusDraft={onGetOrderStatusDraft}
        isLoadingOrderStatusDraft={isLoadingOrderStatusDraft} onResendInvoice={onResendInvoice}
        isResendingInvoice={isResendingInvoice} hasInvoiceInfo={!!relatedQuote}
      />

      <main className="ticket-content-wrapper">
        <div className="ticket-main-pane">
          <div className="conversation-content">
            <div className="conversation-messages">
              <CommunicationHistory comments={conversationHistory} ticket={ticket} handleApproveAndSendDraft={handleApproveAndSendDraft} isSubmittingComment={isSubmittingComment} />
            </div>
          </div>
          <div className="reply-form-wrapper">
             <ReplyForm ticketId={ticket.id} senderEmail={ticket.senderEmail} orderNumber={ticket.orderNumber}
                extractedStatus={extractedStatus} isSubmittingComment={isSubmittingComment} newComment={newComment}
                setNewComment={setNewComment} isInternalNote={isInternalNote} setIsInternalNote={setIsInternalNote}
                sendAsEmail={sendAsEmail} setSendAsEmail={setSendAsEmail} files={files} setFiles={setFiles}
                handleCommentSubmit={handleCommentSubmit} insertSuggestedResponse={insertSuggestedResponse}
              />
          </div>
        </div>

        <div className="ticket-sidebar-pane">
          <div className="sidebar-content">
            <TicketDetailsSidebar ticket={ticket} relatedQuote={relatedQuote} quoteAdminUrl={quoteAdminUrl} />
            {(extractedStatus || extractedCarrier || extractedTracking) && (
              <ShippingInfoSidebar extractedStatus={extractedStatus} extractedCarrier={extractedCarrier} extractedTracking={extractedTracking} extractedShipDate={extractedShipDate} extractedOrderDate={extractedOrderDate} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}