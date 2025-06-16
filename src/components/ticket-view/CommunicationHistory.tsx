'use client';

import React from 'react';
import { format } from 'date-fns';
import DOMPurify from 'dompurify';

// Type definitions
type BaseUser = {
  id: string;
  name: string | null;
  email: string | null;
};

interface AttachmentData {
  id: number;
  filename?: string;
  originalFilename: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
  url?: string;
  commentId?: number | null;
  ticketId?: number | null;
}

interface CommentData {
  id: number;
  commentText: string | null;
  createdAt: string;
  commenter: BaseUser | null;
  isInternalNote: boolean;
  isFromCustomer: boolean;
  isOutgoingReply: boolean;
  attachments?: AttachmentData[];
  externalMessageId?: string | null;
}

interface TicketData {
  id: number;
  senderName: string | null;
  senderEmail: string | null;
}

interface CommunicationHistoryProps {
  comments: CommentData[];
  ticket: TicketData;
  handleApproveAndSendDraft: (draftText: string) => Promise<void>;
  isSubmittingComment?: boolean;
}

// Helper Functions
const getFileIconClass = (mimeType?: string | null): string => {
  if (!mimeType) return 'fa-file';
  const mt = mimeType.toLowerCase();
  if (mt.startsWith('image/')) return 'fa-file-image';
  if (mt === 'application/pdf') return 'fa-file-pdf';
  if (mt.includes('word')) return 'fa-file-word';
  if (mt.includes('excel')) return 'fa-file-excel';
  if (mt.includes('powerpoint')) return 'fa-file-powerpoint';
  if (mt.includes('zip') || mt.includes('compressed')) return 'fa-file-archive';
  if (mt.startsWith('text/')) return 'fa-file-alt';
  return 'fa-file';
};

const formatFileSize = (bytes?: number): string => {
  if (bytes === undefined || bytes === null || bytes < 0) return '';
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Enhanced Attachment List Component
const AttachmentListDisplay: React.FC<{ attachments?: AttachmentData[], title?: string }> = ({ 
  attachments, 
  title 
}) => {
  if (!attachments || attachments.length === 0) return null;
  
  return (
    <div className="attachment-section mt-3">
      {title && (
        <div className="attachment-header mb-2">
          <small className="text-muted fw-medium">
            <i className="fas fa-paperclip me-1 text-primary"></i>
            {title} ({attachments.length})
          </small>
        </div>
      )}
      <div className="attachment-grid">
        {attachments.map(att => (
          <a
            key={att.id}
            href={`/api/attachments/${att.id}/download`}
            target="_blank"
            rel="noopener noreferrer"
            className="attachment-item d-flex align-items-center p-2 border rounded bg-light text-decoration-none hover-bg-primary-subtle transition-all"
            title={`Download ${att.originalFilename}`}
          >
            <div className="attachment-icon me-2">
              <i className={`fas ${getFileIconClass(att.mimeType)} text-primary fa-lg`}></i>
            </div>
            <div className="attachment-info flex-grow-1 min-w-0">
              <div className="attachment-name text-truncate fw-medium text-dark">
                {att.originalFilename}
              </div>
              <div className="attachment-size small text-muted">
                {formatFileSize(att.fileSize)}
              </div>
            </div>
            <div className="attachment-download">
              <i className="fas fa-download text-muted"></i>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
};

// AI Suggestion Detection
const AI_SUGGESTION_MARKERS = [
  "**AI Suggested Reply:**",
  "**Order Status Found - Suggested Reply:**",
  "**Suggested Reply (Request for Lot #):**",
  "**Order Status Reply:**",
  "**Suggested Reply (SDS Document):**",
  "**Suggested Reply (COC Information):**",
  "**Suggested Reply (Document Request):**",
  "**AI Order Status Reply:**",
  "**AI COA Reply:**"
];

const isAISuggestionNote = (commentText: string | null): boolean => {
  return !!commentText && AI_SUGGESTION_MARKERS.some(marker => commentText.startsWith(marker));
};

const extractAISuggestionContent = (commentText: string | null): string => {
  if (!commentText) return '';
  for (const marker of AI_SUGGESTION_MARKERS) {
    if (commentText.startsWith(marker)) {
      const markerEndIndex = commentText.indexOf('\n', marker.length);
      if (markerEndIndex !== -1) {
        return commentText.substring(markerEndIndex + 1).trim();
      }
      return commentText.substring(marker.length).trim();
    }
  }
  return '';
};

const getAISuggestionTitle = (commentText: string | null): string => {
  if (!commentText) return "AI Suggestion";
  if (commentText.startsWith("**Order Status Found - Suggested Reply:**")) return "AI Order Status Reply";
  if (commentText.startsWith("**Suggested Reply (Request for Lot #):**")) return "AI COA/Lot# Reply";
  if (commentText.startsWith("**Suggested Reply (SDS Document):**")) return "AI SDS Reply";
  if (commentText.startsWith("**Suggested Reply (COC Information):**")) return "AI COC Reply";
  if (commentText.startsWith("**AI Suggested Reply:**")) return "AI General Reply";
  return "AI Suggestion";
};

const parseDate = (dateString: string | null): Date | null => {
  if (!dateString) return null;
  try {
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
};

export default function CommunicationHistory({
  comments,
  ticket,
  handleApproveAndSendDraft,
  isSubmittingComment = false
}: CommunicationHistoryProps) {
  if (comments.length === 0) {
    return (
      <div className="communication-empty text-center py-5">
        <div className="empty-state">
          <div className="empty-icon mb-3">
            <i className="fas fa-comments fa-3x text-muted opacity-25"></i>
          </div>
          <h5 className="text-muted">No messages yet</h5>
          <p className="text-muted mb-0">This conversation will appear here once messages are added.</p>
        </div>
      </div>
    );
  }

  // Sort comments chronologically (oldest first)
  const sortedComments = [...comments].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return (
    <div className="communication-history">
      <div className="messages-container">
        {sortedComments.map((comment, index) => {
          const isAIResponse = isAISuggestionNote(comment.commentText);
          const aiSuggestionContent = isAIResponse ? extractAISuggestionContent(comment.commentText) : '';
          const aiSuggestionTitle = isAIResponse ? getAISuggestionTitle(comment.commentText) : '';
          const commentDate = parseDate(comment.createdAt);
          const senderDisplayName = isAIResponse ? "AI Assistant" : 
                                    comment.commenter?.name || 
                                    (comment.isFromCustomer ? (ticket.senderName || ticket.senderEmail || 'Customer') : 'System/Agent');

          // Message styling based on type
          let messageClasses = 'message-bubble mb-4';
          let avatarColor = '';
          let iconClass = '';
          let messageType = '';
          let badgeContent: React.ReactNode = null;

          if (isAIResponse) {
            messageClasses += ' ai-message';
            avatarColor = 'bg-gradient-primary-to-info text-white';
            iconClass = 'fas fa-robot';
            messageType = 'AI Suggestion';
            badgeContent = (
              <span className="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25">
                <i className="fas fa-robot me-1"></i>AI Suggestion
              </span>
            );
          } else if (comment.isInternalNote) {
            messageClasses += ' internal-message';
            avatarColor = 'bg-gradient-warning-to-amber text-dark';
            iconClass = 'fas fa-lock';
            messageType = 'Internal Note';
            badgeContent = (
              <span className="badge bg-warning bg-opacity-10 text-warning border border-warning border-opacity-25">
                <i className="fas fa-lock me-1"></i>Internal Note
              </span>
            );
          } else if (comment.isOutgoingReply) {
            messageClasses += ' outgoing-message';
            avatarColor = 'bg-gradient-info-to-cyan text-white';
            iconClass = 'fas fa-paper-plane';
            messageType = 'Sent';
            badgeContent = (
              <span className="badge bg-info bg-opacity-10 text-info border border-info border-opacity-25">
                <i className="fas fa-paper-plane me-1"></i>Sent
              </span>
            );
          } else if (comment.isFromCustomer) {
            messageClasses += ' incoming-message';
            avatarColor = 'bg-gradient-success-to-teal text-white';
            iconClass = 'fas fa-envelope';
            messageType = 'Received';
            badgeContent = (
              <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25">
                <i className="fas fa-envelope me-1"></i>Received
              </span>
            );
          } else {
            messageClasses += ' system-message';
            avatarColor = 'bg-gradient-secondary-to-gray text-white';
            iconClass = 'fas fa-user-edit';
            messageType = 'System';
          }

          return (
            <div key={comment.id} className={messageClasses}>
              <div className="message-container d-flex">
                {/* Avatar */}
                <div className="message-avatar me-3 flex-shrink-0">
                  <div 
                    className={`avatar-circle d-flex align-items-center justify-content-center ${avatarColor}`}
                    style={{ width: '40px', height: '40px' }}
                  >
                    <i className={`${iconClass} fa-sm`}></i>
                  </div>
                </div>

                {/* Message Content */}
                <div className="message-content flex-grow-1 min-w-0">
                  {/* Message Header */}
                  <div className="message-header d-flex align-items-center justify-content-between mb-2">
                    <div className="sender-info d-flex align-items-center flex-wrap gap-2">
                      <span className="sender-name fw-semibold text-dark">{senderDisplayName}</span>
                      {badgeContent}
                    </div>
                    <div className="message-timestamp">
                      <small className="text-muted">
                        {commentDate ? format(commentDate, 'MMM d, h:mm a') : 'Unknown time'}
                      </small>
                    </div>
                  </div>

                  {/* Message Body */}
                  <div className="message-body">
                    {isAIResponse ? (
                      <div className="ai-suggestion-card border border-primary border-opacity-25 rounded bg-primary bg-opacity-5 p-3">
                        <div className="ai-suggestion-header mb-3">
                          <h6 className="text-primary fw-bold mb-1 d-flex align-items-center">
                            <i className="fas fa-lightbulb me-2"></i>
                            {aiSuggestionTitle}
                          </h6>
                          <small className="text-muted">AI has analyzed this ticket and suggests the following response:</small>
                        </div>
                        
                        <div className="ai-suggestion-content mb-3">
                          <div 
                            className="suggested-text p-3 bg-white rounded border border-primary border-opacity-10"
                            style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
                          >
                            {aiSuggestionContent}
                          </div>
                        </div>
                        
                        <div className="ai-suggestion-actions d-flex gap-2 flex-wrap">
                          <button 
                            className="btn btn-sm btn-outline-primary" 
                            onClick={() => navigator.clipboard.writeText(aiSuggestionContent)} 
                            disabled={isSubmittingComment}
                          >
                            <i className="fas fa-copy me-1"></i>Copy Text
                          </button>
                          <button 
                            className="btn btn-sm btn-primary" 
                            onClick={() => handleApproveAndSendDraft(aiSuggestionContent)} 
                            disabled={isSubmittingComment}
                          >
                            {isSubmittingComment ? (
                              <>
                                <span className="spinner-border spinner-border-sm me-1"></span>
                                Sending...
                              </>
                            ) : (
                              <>
                                <i className="fas fa-paper-plane me-1"></i>
                                Approve & Send
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="message-text">
                        <div 
                          className="text-content"
                          style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
                          dangerouslySetInnerHTML={{ 
                            __html: comment.commentText ? 
                              DOMPurify.sanitize(comment.commentText) : 
                              '<span class="text-muted fst-italic">(No content)</span>' 
                          }}
                        />
                      </div>
                    )}

                    {/* Attachments */}
                    {comment.attachments && comment.attachments.length > 0 && (
                      <AttachmentListDisplay attachments={comment.attachments} />
                    )}
                  </div>
                </div>
              </div>
              
              {/* Message separator line */}
              {index < sortedComments.length - 1 && (
                <div className="message-separator mt-3">
                  <hr className="border-0 bg-light" style={{ height: '1px' }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}