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

// --- Helper Functions ---
const getFileIconClass = (mimeType?: string | null): string => {
  if (!mimeType) return 'fa-file';
  const mt = mimeType.toLowerCase();
  if (mt.startsWith('image/')) return 'fa-file-image';
  if (mt === 'application/pdf') return 'fa-file-pdf';
  if (mt.includes('word') || mt === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'fa-file-word';
  if (mt.includes('excel') || mt === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'fa-file-excel';
  if (mt.includes('powerpoint') || mt === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'fa-file-powerpoint';
  if (mt.includes('zip') || mt.includes('compressed') || mt.includes('archive')) return 'fa-file-archive';
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

// Attachment List Component
const AttachmentListDisplay: React.FC<{ attachments?: AttachmentData[], title?: string }> = ({ attachments, title }) => {
  if (!attachments || attachments.length === 0) return null;
  return (
    <div className="attachment-list">
      {title && <div className="attachment-header mb-2 text-muted small"><i className="fas fa-paperclip me-1"></i>{title} ({attachments.length})</div>}
      <div className="list-group list-group-flush">
        {attachments.map(att => (
          <a
            key={att.id}
            href={`/api/attachments/${att.id}/download`}
            target="_blank"
            rel="noopener noreferrer"
            className="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-1 px-0 border-0 bg-transparent"
            title={`Download ${att.originalFilename}`}
          >
            <div className="d-flex align-items-center text-truncate me-2">
              <i className={`fas ${getFileIconClass(att.mimeType)} me-2 text-primary fa-fw`}></i>
              <span className="text-truncate small">{att.originalFilename}</span>
            </div>
            <span className="badge bg-light text-dark ms-2">{formatFileSize(att.fileSize)}</span>
          </a>
        ))}
      </div>
    </div>
  );
};

// --- NEW: Helper functions to identify and process AI suggestions ---
const AI_SUGGESTION_MARKERS = [
    "**AI Suggested Reply:**",
    "**Order Status Found - Suggested Reply:**", // Existing
    "**Suggested Reply (Request for Lot #):**", // Specific example
    "**Order Status Reply:**",
    "**Suggested Reply (SDS Document):**",
    "**Suggested Reply (COC Information):**",
    "**Suggested Reply (Document Request):**",
    "**AI Order Status Reply:**",
    "**AI COA Reply:**"
    // Add more specific markers as needed
];

const isAISuggestionNote = (commentText: string | null): boolean => {
  return !!commentText && AI_SUGGESTION_MARKERS.some(marker => commentText.startsWith(marker));
};

const extractAISuggestionContent = (commentText: string | null): string => {
  if (!commentText) return '';
  for (const marker of AI_SUGGESTION_MARKERS) {
    if (commentText.startsWith(marker)) {
      // Find the first newline after the marker to get the actual content
      const markerEndIndex = commentText.indexOf('\n', marker.length);
      if (markerEndIndex !== -1) {
        return commentText.substring(markerEndIndex + 1).trim();
      }
      // If no newline, might be a very short suggestion on the same line (less common)
      return commentText.substring(marker.length).trim(); 
    }
  }
  // Fallback for older/generic marker if necessary, though covered by AI_SUGGESTION_MARKERS
  const genericMarkerEnd = commentText.indexOf('**\n');
  if (genericMarkerEnd !== -1 && commentText.startsWith("**") && commentText.includes("Suggested Reply")) {
    return commentText.substring(genericMarkerEnd + 3).trim();
  }
  return ''; // Should not happen if isAISuggestionNote is true
};

const getAISuggestionTitle = (commentText: string | null): string => {
    if (!commentText) return "AI Suggestion";
    if (commentText.startsWith("**Order Status Found - Suggested Reply:**") || commentText.startsWith("**Order Status Reply:**")) return "AI Order Status Reply";
    if (commentText.startsWith("**Suggested Reply (Request for Lot #):**") || commentText.startsWith("**AI COA Reply:**")) return "AI COA/Lot# Reply";
    if (commentText.startsWith("**Suggested Reply (SDS Document):**")) return "AI SDS Reply";
    if (commentText.startsWith("**Suggested Reply (COC Information):**")) return "AI COC Reply";
    if (commentText.startsWith("**AI Suggested Reply:**")) return "AI General Reply";
    // Fallback for any other recognized AI note
    if (AI_SUGGESTION_MARKERS.some(marker => commentText.startsWith(marker))) return "AI Suggested Action";
    return "AI Suggestion"; // Default
}

// Draft Reply Extraction (keeping for backward compatibility)
const isDraftReplyNote = (commentText: string | null): boolean => {
  return !!commentText && commentText.includes('**Suggested Reply');
};

const checkIsOrderStatusDraft = (commentText: string | null): boolean => {
  return !!commentText && commentText.includes('**Order Status Found - Suggested Reply');
};

const extractDraftContent = (commentText: string | null): string => {
  if (!commentText) return '';
  const markerEnd = commentText.indexOf('**\n');
  return markerEnd !== -1 ? commentText.substring(markerEnd + 3).trim() : '';
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
        <div className="text-muted">
          <i className="fas fa-comments fa-3x mb-3 opacity-25"></i>
          <p>No messages in this conversation yet.</p>
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
      {sortedComments.map((comment) => {
        // Determine message styling and icons based on type
        let messageClasses = 'message-item mb-4';
        let headerClasses = 'message-header d-flex justify-content-between align-items-start mb-2 px-3 py-2';
        let contentClasses = 'message-content px-3 pb-3';
        let avatarClassNames = 'avatar-icon rounded-circle d-flex align-items-center justify-content-center me-2';
        let iconClass = 'fas fa-comment';
        let badge: React.ReactNode = null;
        let avatarColor = 'bg-secondary';
        
        const isAIResponse = isAISuggestionNote(comment.commentText);
        const aiSuggestionContent = isAIResponse ? extractAISuggestionContent(comment.commentText) : '';
        const aiSuggestionTitle = isAIResponse ? getAISuggestionTitle(comment.commentText) : '';

        if (isAIResponse) {
            messageClasses += ' border border-primary rounded bg-primary-subtle';
            headerClasses += ' bg-primary-subtle border-bottom border-primary';
            iconClass = 'fas fa-robot text-primary';
            badge = <span className="badge bg-primary ms-2">AI Suggestion</span>;
            avatarColor = 'bg-primary text-white';
        } else if (comment.isInternalNote) {
          messageClasses += ' border border-warning rounded bg-warning-subtle';
          headerClasses += ' bg-warning-subtle border-bottom border-warning';
          iconClass = 'fas fa-lock text-warning';
          badge = <span className="badge bg-warning text-dark ms-2">Internal Note</span>;
          avatarColor = 'bg-warning text-dark';
        } else if (comment.isOutgoingReply) {
          messageClasses += ' border border-info rounded bg-info-subtle';
          headerClasses += ' bg-info-subtle border-bottom border-info';
          iconClass = 'fas fa-paper-plane text-info';
          badge = <span className="badge bg-info text-dark ms-2" title="Sent as email">Sent</span>;
          avatarColor = 'bg-info text-white';
        } else if (comment.isFromCustomer) {
          messageClasses += ' border border-success rounded bg-success-subtle';
          headerClasses += ' bg-success-subtle border-bottom border-success';
          iconClass = 'fas fa-envelope text-success';
          badge = <span className="badge bg-success ms-2" title="Received via Email">Received</span>;
          avatarColor = 'bg-success text-white';
        } else {
          messageClasses += ' border rounded bg-light'; 
          headerClasses += ' bg-light border-bottom';
          iconClass = 'fas fa-user-edit text-secondary';
          avatarColor = 'bg-secondary text-white';
        }

        // Handle draft replies (backward compatibility)
        const isDraft = isDraftReplyNote(comment.commentText);
        const hasOrderStatus = checkIsOrderStatusDraft(comment.commentText);
        const draftContent = isDraft ? extractDraftContent(comment.commentText) : '';
        const commentDate = parseDate(comment.createdAt);
        
        const senderDisplayName = isAIResponse ? "AI Assistant" : 
                                  comment.commenter?.name || 
                                  (comment.isFromCustomer ? (ticket.senderName || ticket.senderEmail || 'Customer') : 'System/Agent');

        return (
          <div key={comment.id} className={messageClasses}>
            <div className={headerClasses}>
              <div className="sender-info d-flex align-items-center">
                {/* Avatar/Icon Circle */}
                <div className={`${avatarColor} ${avatarClassNames}`} style={{ width: '32px', height: '32px' }}>
                  <i className={iconClass}></i>
                </div>
                
                {/* Sender Name */}
                <div className="sender-details">
                  <div className="d-flex align-items-center">
                    <strong className="me-2">{senderDisplayName}</strong>
                    {badge}
                  </div>
                </div>
              </div>
              
              {/* Date */}
              <div className="message-date text-muted small">
                {commentDate ? format(commentDate, 'PPp') : 'Unknown date'}
              </div>
            </div>
            
            {/* Message Content */}
            <div className={contentClasses}>
              {isAIResponse ? (
                <div className="ai-suggestion-section mt-2">
                  <h6 className="text-primary fw-bold d-flex align-items-center">
                    <i className="fas fa-lightbulb me-2"></i> {aiSuggestionTitle}
                  </h6>
                  <div className="comment-text pt-1 mb-3" style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
                    {aiSuggestionContent}
                  </div>
                  <div className="d-flex gap-2">
                    <button 
                      className="btn btn-sm btn-outline-secondary" 
                      onClick={() => navigator.clipboard.writeText(aiSuggestionContent)} 
                      title="Copy reply text"
                      disabled={isSubmittingComment}
                    >
                      <i className="fas fa-copy"></i> Copy
                    </button>
                    <button 
                      className="btn btn-sm btn-primary" 
                      onClick={() => handleApproveAndSendDraft(aiSuggestionContent)} 
                      disabled={isSubmittingComment} 
                      title="Use this reply and send as email"
                    >
                      <i className="fas fa-paper-plane me-1"></i> Approve & Send Email
                    </button>
                  </div>
                </div>
              ) : (isDraft || hasOrderStatus) ? (
                <div className="draft-reply-section mt-2 p-3 border border-primary rounded bg-primary-subtle">
                  <h6 className="text-primary fw-bold d-flex align-items-center">
                    <i className={`fas ${hasOrderStatus ? 'fa-shipping-fast' : 'fa-robot'} me-2`}></i> 
                    {hasOrderStatus ? 'Order Status Response' : 'AI Suggested Reply'}
                  </h6>
                  <div className="comment-text pt-1 mb-3" style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
                    {hasOrderStatus 
                      ? extractDraftContent(comment.commentText) 
                      : draftContent}
                  </div>
                  <div className="d-flex gap-2">
                    <button 
                      className="btn btn-sm btn-outline-secondary" 
                      onClick={() => navigator.clipboard.writeText(hasOrderStatus 
                        ? extractDraftContent(comment.commentText) 
                        : draftContent)} 
                      title="Copy reply text"
                      disabled={isSubmittingComment}
                    >
                      <i className="fas fa-copy"></i> Copy
                    </button>
                    <button 
                      className="btn btn-sm btn-primary" 
                      onClick={() => handleApproveAndSendDraft(hasOrderStatus 
                        ? extractDraftContent(comment.commentText) 
                        : draftContent)} 
                      disabled={isSubmittingComment} 
                      title="Send this reply as an email"
                    >
                      <i className="fas fa-paper-plane me-1"></i> 
                      {hasOrderStatus ? 'Send Order Status' : 'Approve & Send Email'}
                    </button>
                  </div>
                </div>
              ) : (
                <div 
                  className="comment-text pt-1" 
                  style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
                  dangerouslySetInnerHTML={{ 
                    __html: comment.commentText ? 
                      DOMPurify.sanitize(comment.commentText) : 
                      '<span class="text-muted fst-italic">(No text content)</span>' 
                  }}
                />
              )}
              
              {/* Attachments */}
              {comment.attachments && comment.attachments.length > 0 && (
                <div className="mt-3 pt-3 border-top">
                  <AttachmentListDisplay attachments={comment.attachments} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
} 