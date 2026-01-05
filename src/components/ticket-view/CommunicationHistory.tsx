'use client';

import React from 'react';
import { format } from 'date-fns';
import DOMPurify from 'dompurify';
import AttachmentListDisplay from './AttachmentListDisplay';
import { isAISuggestionNote, extractAISuggestionContent } from '@/utils/aiSuggestionHelpers';
import type { TicketComment, Ticket as TicketData, AttachmentData, TicketUser as BaseUser } from '@/types/ticket';
import { MessageSquare, Copy, Send } from 'lucide-react';

// Type definitions
// type BaseUser = { id: string; name: string | null; email: string | null; };
// interface AttachmentData { id: number; filename?: string; originalFilename: string; fileSize: number; mimeType: string; uploadedAt: string; url?: string; commentId?: number | null; ticketId?: number | null; }
// interface CommentData { id: number; commentText: string | null; createdAt: string; commenter: BaseUser | null; isInternalNote: boolean; isFromCustomer: boolean; isOutgoingReply: boolean; attachments?: AttachmentData[]; externalMessageId?: string | null; }
// interface TicketData { id: number; senderName: string | null; senderEmail: string | null; }
interface CommunicationHistoryProps {
  comments: TicketComment[];
  ticket: TicketData;
  handleApproveAndSendDraft: (draftText: string) => void;
  isSubmittingComment?: boolean;
  viewMode?: 'conversation' | 'thread';
}

// Helper Functions
const formatFileSize = (bytes?: number): string => {
  if (bytes === undefined || bytes === null || bytes < 0) return '';
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// AI Suggestion Detection
const getAISuggestionTitle = (text: string | null): string => {
  if (!text) return "AI Suggestion";
  if (text.includes("Order Status")) return "AI Order Status Reply";
  if (text.includes("COA") || text.includes("Lot #")) return "AI COA/Lot# Reply";
  if (text.includes("SDS")) return "AI SDS Reply";
  if (text.includes("COC")) return "AI COC Reply";
  return "AI General Reply";
};

const parseDate = (dateString: string | null): Date | null => dateString ? new Date(dateString) : null;

export default function CommunicationHistory({
  comments,
  ticket,
  handleApproveAndSendDraft,
  isSubmittingComment = false,
  viewMode = 'conversation'
}: CommunicationHistoryProps) {
  if (comments.length === 0) {
    return (
      <div className="communication-empty text-center py-5">
        <div className="empty-state">
          <div className="empty-icon mb-3">
            <MessageSquare className="w-12 h-12 text-muted opacity-25" />
          </div>
          <h5 className="text-muted">No messages yet</h5>
          <p className="text-muted mb-0">This conversation will appear here once messages are added.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="communication-history">
      {comments.map((comment) => {
        const isAI = isAISuggestionNote(comment.commentText);
        const aiContent = isAI ? extractAISuggestionContent(comment.commentText) : '';
        const aiTitle = isAI ? getAISuggestionTitle(comment.commentText) : '';
        const date = parseDate(comment.createdAt);
        const sender = isAI ? "AI Assistant" : comment.commenter?.name || (comment.isFromCustomer ? (ticket.senderName || 'Customer') : 'Agent');

        let bubbleClasses = 'message-bubble';
        if (comment.isOutgoingReply) bubbleClasses += ' outgoing-message';
        if (comment.isInternalNote) bubbleClasses += ' internal-message';
        if (isAI) bubbleClasses += ' ai-message';

        return (
          <div key={comment.id} className={bubbleClasses}>
            <div className="message-avatar">
              <div className="avatar-circle">{sender.charAt(0)}</div>
            </div>
            <div className="message-content">
              <div className="message-header">
                <span className="sender-name">{sender}</span>
                <span className="message-timestamp">{date ? format(date, 'MMM d, h:mm a') : ''}</span>
              </div>
              <div className="message-text">
                {isAI ? (
                  <div className="ai-suggestion-card">
                    <div className="ai-suggestion-content">
                      <div className="suggested-text" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(aiContent) }} />
                      <div className="d-flex gap-2 mt-2">
                        <button className="btn btn-sm btn-outline-primary inline-flex items-center gap-1" onClick={() => navigator.clipboard.writeText(aiContent)}><Copy className="w-4 h-4" />Copy</button>
                        <button className="btn btn-sm btn-primary inline-flex items-center gap-1" onClick={() => handleApproveAndSendDraft(aiContent)} disabled={isSubmittingComment}><Send className="w-4 h-4" />Use & Send</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(comment.commentText || '<em class="text-muted">(No content)</em>') }} />
                )}
              </div>
              <AttachmentListDisplay attachments={comment.attachments || []} />
            </div>
          </div>
        );
      })}
    </div>
  );
}