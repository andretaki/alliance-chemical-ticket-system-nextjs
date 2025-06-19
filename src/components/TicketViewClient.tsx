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
  const [showQuickReply, setShowQuickReply] = useState(false);
  const [isScrolledDown, setIsScrolledDown] = useState(false);
  const [draftAutoSaved, setDraftAutoSaved] = useState(false);
  const [viewMode, setViewMode] = useState<'conversation' | 'thread'>('conversation');
  
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
    isUpdatingAssignee, isUpdatingStatus, isLoadingOrderStatusDraft, isResendingInvoice, isDraftingAIReply,
    handleAssigneeChange, handleStatusSelectChange, onReopenTicket, onGetOrderStatusDraft, onResendInvoice, onDraftAIReply
  } = useTicketActions({ ticket, setTicket, users, refreshTicket, relatedQuote });

  const handleGetOrderStatusDraft = useCallback(async () => {
    const draftMessage = await onGetOrderStatusDraft();
    if (draftMessage) {
        setNewComment(draftMessage);
        setSendAsEmail(true);
        setIsInternalNote(false);
    }
  }, [onGetOrderStatusDraft, setNewComment, setSendAsEmail, setIsInternalNote]);

  const handleDraftAIReply = useCallback(async () => {
    const draftMessage = await onDraftAIReply();
    if (draftMessage) {
        setNewComment(draftMessage);
        setSendAsEmail(true); // Default to sending as email for AI replies
        setIsInternalNote(false);
    }
  }, [onDraftAIReply, setNewComment, setSendAsEmail, setIsInternalNote]);

  // Keyboard shortcuts (Outlook-like)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'r':
            if (e.shiftKey) {
                             // Ctrl+Shift+R - Reply All (focus reply form)
               e.preventDefault();
               (document.querySelector('textarea, [contenteditable]') as HTMLElement)?.focus();
            } else {
                             // Ctrl+R - Reply (focus reply form)
               e.preventDefault();
               (document.querySelector('textarea, [contenteditable]') as HTMLElement)?.focus();
            }
            break;
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

  // Scroll detection for floating reply button
  useEffect(() => {
    const handleScroll = () => {
      const scrolled = window.scrollY > 300;
      setIsScrolledDown(scrolled);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
    <div className="ticket-view-page">
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

      <TicketHeaderBar
        ticket={ticket} users={users} isUpdatingAssignee={isUpdatingAssignee} isUpdatingStatus={isUpdatingStatus}
        handleAssigneeChange={handleAssigneeChange} handleStatusSelectChange={handleStatusSelectChange}
        showAiSuggestionIndicator={conversationHistory.some(c => isAISuggestionNote(c.commentText))}
        onReopenTicket={onReopenTicket} onMergeClick={() => setShowMergeModal(true)}
        orderNumberForStatus={ticket.orderNumber} onGetOrderStatusDraft={handleGetOrderStatusDraft}
        isLoadingOrderStatusDraft={isLoadingOrderStatusDraft} onResendInvoice={onResendInvoice}
        isResendingInvoice={isResendingInvoice} hasInvoiceInfo={!!relatedQuote}
        onDraftAIReply={handleDraftAIReply} isDraftingAIReply={isDraftingAIReply}
      />

      {/* View Mode Toggle */}
      <div className="d-flex justify-content-between align-items-center p-3 bg-light border-bottom">
        <div className="btn-group btn-group-sm" role="group">
          <button
            type="button"
            className={`btn ${viewMode === 'conversation' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setViewMode('conversation')}
          >
            <i className="fas fa-comments me-1"></i>Conversation
          </button>
          <button
            type="button"
            className={`btn ${viewMode === 'thread' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setViewMode('thread')}
          >
            <i className="fas fa-list me-1"></i>Thread
          </button>
        </div>
        
        <div className="text-muted small">
          <i className="fas fa-keyboard me-1"></i>
          <span className="me-3">Ctrl+R: Reply</span>
          <span className="me-3">Ctrl+Enter: Send</span>
          <span>Ctrl+S: Save Draft</span>
        </div>
      </div>

      <main className="ticket-content-wrapper">
        <div className="ticket-main-pane">
          <div className="conversation-content">
            <div className="conversation-messages">
              <CommunicationHistory 
                comments={conversationHistory} 
                ticket={ticket} 
                handleApproveAndSendDraft={handleApproveAndSendDraft} 
                isSubmittingComment={isSubmittingComment}
                viewMode={viewMode}
              />
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

      {/* Floating Quick Reply Button */}
      {isScrolledDown && (
        <Button
          className="position-fixed bottom-0 end-0 m-4 rounded-circle shadow-lg"
          style={{ zIndex: 1040, width: '60px', height: '60px' }}
          variant="primary"
                     onClick={() => {
             (document.querySelector('textarea, [contenteditable]') as HTMLElement)?.focus();
             window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
           }}
        >
          <i className="fas fa-reply fa-lg"></i>
        </Button>
      )}
    </div>
  );
}