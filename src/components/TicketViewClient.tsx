// src/components/TicketViewClient.tsx
'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Alert } from 'react-bootstrap';
import Link from 'next/link';

// Hooks
import { useTicketData } from '@/lib/hooks/useTicketData';
import { useTicketUsers } from '@/lib/hooks/useTicketUsers';
import { useTicketActions } from '@/lib/hooks/useTicketActions';
import { useCommentBox } from '@/lib/hooks/useCommentBox';
import { isAISuggestionNote } from '@/utils/aiSuggestionHelpers';

// Components
import TicketHeaderBar from './ticket-view/TicketHeaderBar';
import CommunicationHistory from './ticket-view/CommunicationHistory';
import ReplyForm from './ticket-view/ReplyForm';
import TicketDetailsSidebar from './ticket-view/TicketDetailsSidebar';
import ShippingInfoSidebar from './ticket-view/ShippingInfoSidebar';
import MergeTicketModal from './ticket-view/MergeTicketModal';

// Types
import type { ShopifyDraftOrderGQLResponse } from '@/agents/quoteAssistant/quoteInterfaces';
import type { Ticket as TicketData, TicketComment as CommentData } from '@/types/ticket';

interface TicketViewClientProps {
  initialTicket: TicketData;
  relatedQuote?: ShopifyDraftOrderGQLResponse | null;
  quoteAdminUrl?: string | null;
}

const LoadingSpinner = () => (
  <div className="ticket-view-page flex items-center justify-center">
    <div className="text-center text-white">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
      <h5 className="font-semibold">Loading Ticket...</h5>
    </div>
  </div>
);

export default function TicketViewClient({ initialTicket, relatedQuote, quoteAdminUrl }: TicketViewClientProps) {
  const [showMergeModal, setShowMergeModal] = useState(false);
  
  // Extracted shipping info state (could be moved to a separate hook if it grows)
  const [extractedStatus, setExtractedStatus] = useState<string | null>(null);
  const [extractedCarrier, setExtractedCarrier] = useState<string | null>(null);
  const [extractedTracking, setExtractedTracking] = useState<string | null>(null);
  const [extractedShipDate, setExtractedShipDate] = useState<string | null>(null);
  const [extractedOrderDate, setExtractedOrderDate] = useState<string | null>(null);

  const { ticket, setTicket, refreshTicket } = useTicketData(initialTicket);
  const { users, isUsersLoading, error: usersError, setError: setUsersError } = useTicketUsers();

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

  const {
    newComment, setNewComment, isInternalNote, setIsInternalNote, sendAsEmail, setSendAsEmail,
    isSubmittingComment, files, setFiles, handleCommentSubmit, handleApproveAndSendDraft, insertSuggestedResponse
  } = useCommentBox({ ticketId: ticket.id, refreshTicket, comments: ticket.comments });

  const {
    isUpdatingAssignee, isUpdatingStatus, isLoadingOrderStatusDraft, isResendingInvoice,
    handleAssigneeChange, handleStatusSelectChange, onReopenTicket, onGetOrderStatusDraft, onResendInvoice
  } = useTicketActions({ ticket, setTicket, users, refreshTicket, relatedQuote });

  const handleGetOrderStatusDraft = useCallback(async () => {
    const draftMessage = await onGetOrderStatusDraft();
    if (draftMessage) {
        setNewComment(draftMessage);
        setSendAsEmail(true);
        setIsInternalNote(false);
    }
  }, [onGetOrderStatusDraft, setNewComment, setSendAsEmail, setIsInternalNote]);

  if (isUsersLoading || !ticket) {
    return <LoadingSpinner />;
  }

  return (
    <div className="ticket-view-page">
      <MergeTicketModal show={showMergeModal} onHide={() => setShowMergeModal(false)} primaryTicketId={ticket.id} onMergeSuccess={refreshTicket} />
      {usersError && <Alert variant="danger" onClose={() => setUsersError(null)} dismissible className="m-3">{usersError}</Alert>}

      <TicketHeaderBar
        ticket={ticket} users={users} isUpdatingAssignee={isUpdatingAssignee} isUpdatingStatus={isUpdatingStatus}
        handleAssigneeChange={handleAssigneeChange} handleStatusSelectChange={handleStatusSelectChange}
        showAiSuggestionIndicator={conversationHistory.some(c => isAISuggestionNote(c.commentText))}
        onReopenTicket={onReopenTicket} onMergeClick={() => setShowMergeModal(true)}
        orderNumberForStatus={ticket.orderNumber} onGetOrderStatusDraft={handleGetOrderStatusDraft}
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
              <ShippingInfoSidebar 
                extractedStatus={extractedStatus} 
                extractedCarrier={extractedCarrier} 
                extractedTracking={extractedTracking} 
                extractedShipDate={extractedShipDate} 
                extractedOrderDate={extractedOrderDate} 
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}