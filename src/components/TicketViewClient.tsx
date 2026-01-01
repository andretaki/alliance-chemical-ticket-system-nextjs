// src/components/TicketViewClient.tsx
'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Alert, Button } from 'react-bootstrap';
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
import AiNextActionCard from './ticket-view/AiNextActionCard';
import AIMessageSuggestion from './ticket-view/AIMessageSuggestion';
import MergeTicketModal from './ticket-view/MergeTicketModal';

// Types
import type { ShopifyDraftOrderGQLResponse } from '@/agents/quoteAssistant/quoteInterfaces';
import type { Ticket as TicketData, TicketComment as CommentData, TicketUser } from '@/types/ticket';

interface TicketViewClientProps {
  initialTicket: TicketData;
  relatedQuote?: ShopifyDraftOrderGQLResponse | null;
  quoteAdminUrl?: string | null;
}

const LoadingSpinner = () => (
  <div className="ticket-view-page flex items-center justify-center">
    <div className="text-center text-gray-700 dark:text-white">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
      <h5 className="font-semibold">Loading Ticket...</h5>
    </div>
  </div>
);

export default function TicketViewClient({ initialTicket, relatedQuote, quoteAdminUrl }: TicketViewClientProps) {
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [showQuickReply, setShowQuickReply] = useState(false);
  const [draftAutoSaved, setDraftAutoSaved] = useState(false);

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

  // --- State for AI reply drafts ---
  const [aiDraft, setAiDraft] = useState<{ content: string; sourceId: number | string } | null>(null);

  const {
    newComment, setNewComment, isInternalNote, setIsInternalNote, sendAsEmail, setSendAsEmail,
    isSubmittingComment, files, setFiles, handleCommentSubmit
  } = useCommentBox({
      ticketId: ticket.id,
      refreshTicket
  });

  const handleApproveAndSendDraft = (draftText: string) => {
    setNewComment(draftText);
    setIsInternalNote(false);
    setSendAsEmail(true);
    setAiDraft(null); // Clear the suggestion card once it's used
    // TODO: Add toast notification for better UX
    console.log('AI suggestion moved to reply box. Review and send.');
  };

  const {
    isUpdatingAssignee, isUpdatingStatus, isLoadingOrderStatusDraft, isResendingInvoice, isDraftingAIReply,
    handleAssigneeChange, handleStatusSelectChange, onReopenTicket, onGetOrderStatusDraft, onResendInvoice, onDraftAIReply
  } = useTicketActions({ ticket, setTicket, users, refreshTicket, relatedQuote });

  const handleGetOrderStatusDraft = useCallback(async () => {
    const draftMessage = await onGetOrderStatusDraft();
    if (draftMessage) {
        setAiDraft({ content: draftMessage, sourceId: `order-status-${Date.now()}`});
    }
  }, [onGetOrderStatusDraft]);
  
  const handleDraftAIReply = useCallback(async () => {
    const draftMessage = await onDraftAIReply();
    if (draftMessage) {
        setAiDraft({ content: draftMessage, sourceId: `general-${Date.now()}` });
        setSendAsEmail(true); // Default to sending as email for AI replies
        setIsInternalNote(false);
    }
  }, [onDraftAIReply, setSendAsEmail, setIsInternalNote]);

  const handleActionClick = (action: string) => {
    if (action === 'CHECK_ORDER_STATUS') {
      handleGetOrderStatusDraft();
    }
    // Add handlers for other actions like DOCUMENT_REQUEST here
  };

  // Keyboard shortcuts (Outlook-like)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'Enter':
            // Ctrl+Enter - Send reply
            if (newComment.trim() || files.length > 0) {
              e.preventDefault();
              handleCommentSubmit(e as any);
            }
            break;
          case 's':
            // Ctrl+S - Save draft (auto-save)
            e.preventDefault();
            setDraftAutoSaved(true);
            setTimeout(() => setDraftAutoSaved(false), 2000);
            break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [newComment, files, handleCommentSubmit]);

  // Auto-save draft every 30 seconds
  useEffect(() => {
    if (newComment.trim()) {
      const autoSaveTimer = setTimeout(() => {
        localStorage.setItem(`ticket-${ticket.id}-draft`, newComment);
        setDraftAutoSaved(true);
        setTimeout(() => setDraftAutoSaved(false), 2000);
      }, 30000);

      return () => clearTimeout(autoSaveTimer);
    }
  }, [newComment, ticket.id]);

  // Load saved draft on mount
  useEffect(() => {
    const savedDraft = localStorage.getItem(`ticket-${ticket.id}-draft`);
    if (savedDraft && !newComment) {
      setNewComment(savedDraft);
    }
  }, [ticket.id, newComment, setNewComment]);

  if (isUsersLoading || !ticket) {
    return <LoadingSpinner />;
  }

  return (
    <>
      <MergeTicketModal show={showMergeModal} onHide={() => setShowMergeModal(false)} primaryTicketId={ticket.id} onMergeSuccess={refreshTicket} />
      {usersError && <Alert variant="danger" onClose={() => setUsersError(null)} dismissible className="m-3">{usersError}</Alert>}
      
      {/* Auto-save indicator */}
      {draftAutoSaved && (
        <div className="position-fixed top-0 end-0 m-3" style={{ zIndex: 1050 }}>
          <div className="alert alert-success alert-dismissible fade show" role="alert">
            <i className="fas fa-check-circle me-2"></i>Draft saved
          </div>
        </div>
      )}

      {/* Center Pane: Main Conversation */}
      <main className="inbox-main-pane">
        <TicketHeaderBar
          ticket={ticket} 
          users={users} 
          isUpdatingAssignee={isUpdatingAssignee} 
          isUpdatingStatus={isUpdatingStatus}
          handleAssigneeChange={handleAssigneeChange} 
          handleStatusSelectChange={handleStatusSelectChange}
          showAiSuggestionIndicator={conversationHistory.some(c => isAISuggestionNote(c.commentText))}
          onReopenTicket={onReopenTicket} 
          onMergeClick={() => setShowMergeModal(true)}
          orderNumberForStatus={ticket.orderNumber}
          onGetOrderStatusDraft={handleGetOrderStatusDraft}
          isLoadingOrderStatusDraft={isLoadingOrderStatusDraft}
          onResendInvoice={onResendInvoice}
          isResendingInvoice={isResendingInvoice}
          hasInvoiceInfo={!!relatedQuote}
          onDraftAIReply={handleDraftAIReply} 
          isDraftingAIReply={isDraftingAIReply}
        />
        <div className="conversation-content flex-grow-1">
          <div className="conversation-messages p-4">
              <AiNextActionCard
                action={ticket.aiSuggestedAction}
                ticketId={ticket.id}
                onActionClick={handleActionClick}
                isLoading={isLoadingOrderStatusDraft}
              />
              {aiDraft && (
                  <AIMessageSuggestion
                      draftContent={aiDraft.content}
                      onApproveAndSendDraft={handleApproveAndSendDraft}
                      onDiscard={() => setAiDraft(null)}
                      isSubmitting={isSubmittingComment}
                  />
              )}
              <CommunicationHistory 
                comments={conversationHistory} 
                ticket={ticket} 
                handleApproveAndSendDraft={handleApproveAndSendDraft} 
                isSubmittingComment={isSubmittingComment}
              />
          </div>
        </div>
        <div className="reply-form-wrapper mt-auto">
          <ReplyForm ticketId={ticket.id} senderEmail={ticket.senderEmail}
              isSubmittingComment={isSubmittingComment} newComment={newComment}
                setNewComment={setNewComment} isInternalNote={isInternalNote} setIsInternalNote={setIsInternalNote}
                sendAsEmail={sendAsEmail} setSendAsEmail={setSendAsEmail} files={files} setFiles={setFiles}
                handleCommentSubmit={handleCommentSubmit}
              />
        </div>
      </main>

      {/* Right Pane: Contextual Information */}
      <aside className="inbox-context-pane">
        <TicketDetailsSidebar ticket={ticket} relatedQuote={relatedQuote} quoteAdminUrl={quoteAdminUrl} />
      </aside>
    </>
  );
}