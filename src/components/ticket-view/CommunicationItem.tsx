'use client';

import React from 'react';
import { format } from 'date-fns';
import DOMPurify from 'dompurify';
import { AttachmentData } from '@/components/TicketViewClient'; // Ensure AttachmentData is exported or defined here

// Helper function for formatting file size
const formatFileSize = (bytes?: number): string => {
  if (bytes === undefined || bytes === null || bytes < 0) return '';
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Helper function for determining file icon
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

const AttachmentListDisplay: React.FC<{ attachments?: AttachmentData[], title?: string }> = ({ attachments, title }) => {
  if (!attachments || attachments.length === 0) return null;
  return (
    <div className="attachment-list mt-2">
      {title && <div className="attachment-header mb-1 text-muted small"><i className="fas fa-paperclip me-1"></i>{title} ({attachments.length})</div>}
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

interface CommunicationItemProps {
  id: string | number;
  fromName: string;
  fromEmail?: string | null;
  sentDate: string; // ISO Date string
  subject?: string; // Only for the initial ticket description
  body: string | null;
  attachments?: AttachmentData[];
  isInternalNote?: boolean;
  isOutgoingReply?: boolean;
  isFromCustomer?: boolean;
  isInitialDescription?: boolean; // To distinguish the first "email" from comments
  isDraftReply?: boolean; // Flag for AI suggested replies
  draftContent?: string; // Content of the draft reply
  onApproveAndSendDraft?: (draftText: string) => Promise<void>; // Action for draft
  isSubmittingComment?: boolean;
}

const CommunicationItem: React.FC<CommunicationItemProps> = ({
  id,
  fromName,
  fromEmail,
  sentDate,
  subject,
  body,
  attachments,
  isInternalNote = false,
  isOutgoingReply = false,
  isFromCustomer = false,
  isInitialDescription = false,
  isDraftReply = false,
  draftContent = '',
  onApproveAndSendDraft,
  isSubmittingComment = false
}) => {
  let itemClasses = `communication-item mb-3 border rounded shadow-sm overflow-hidden`;
  let headerClasses = `message-header px-3 py-2 d-flex justify-content-between align-items-center`;
  let avatarBg = 'bg-secondary';
  let avatarIcon = 'fas fa-user-edit';
  let badge;

  if (isInternalNote) {
    itemClasses += ' bg-warning-subtle border-warning';
    headerClasses += ' bg-warning bg-opacity-10 border-bottom border-warning border-opacity-25';
    avatarBg = 'bg-warning text-dark';
    avatarIcon = 'fas fa-lock';
    badge = <span className="badge bg-warning text-dark ms-2">Internal Note</span>;
  } else if (isDraftReply) {
    itemClasses += ' bg-primary-subtle border-primary';
    headerClasses += ' bg-primary bg-opacity-10 border-bottom border-primary border-opacity-25';
    avatarBg = 'bg-primary text-white';
    avatarIcon = 'fas fa-robot';
    badge = <span className="badge bg-primary ms-2">AI Suggested Reply</span>;
  } else if (isOutgoingReply) {
    itemClasses += ' bg-info-subtle border-info';
    headerClasses += ' bg-info bg-opacity-10 border-bottom border-info border-opacity-25';
    avatarBg = 'bg-info text-white';
    avatarIcon = 'fas fa-paper-plane';
    badge = <span className="badge bg-info text-dark ms-2" title="Sent as email">Sent</span>;
  } else if (isFromCustomer || isInitialDescription) {
    itemClasses += ' bg-success-subtle border-success';
    headerClasses += ' bg-success bg-opacity-10 border-bottom border-success border-opacity-25';
    avatarBg = 'bg-success text-white';
    avatarIcon = 'fas fa-envelope';
    badge = <span className="badge bg-success ms-2" title="Received via Email">Received</span>;
  } else {
    itemClasses += ' bg-light border-light-subtle';
    headerClasses += ' bg-light bg-opacity-50 border-bottom';
  }

  const displayBody = isDraftReply ? draftContent : body;
  const parsedDate = new Date(sentDate);

  return (
    <div key={id} className={itemClasses}>
      <div className={headerClasses}>
        <div className="d-flex align-items-center">
          <div className={`avatar-icon rounded-circle d-flex align-items-center justify-content-center me-2 ${avatarBg}`} style={{ width: '32px', height: '32px', fontSize: '0.9rem' }}>
            <i className={avatarIcon}></i>
          </div>
          <div>
            <strong className="d-block text-dark">{fromName}</strong>
            {fromEmail && <small className="text-muted d-block">{fromEmail}</small>}
          </div>
          {badge}
        </div>
        <small className="text-muted ms-2" title={format(parsedDate, 'PPpp')}>
          {format(parsedDate, 'MMM d, yyyy, h:mm a')}
        </small>
      </div>
      {subject && (
        <div className="message-subject px-3 pt-2 pb-1 border-bottom">
          <strong className="text-muted small me-1">Subject:</strong> {subject}
        </div>
      )}
      <div className="message-body p-3">
        {displayBody ? (
            isHtmlContent(displayBody) ? (
              <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(displayBody) }} />
            ) : (
              <div style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>{displayBody}</div>
            )
          ) : (
            <p className="text-muted fst-italic">(No message content)</p>
          )
        }
        <AttachmentListDisplay attachments={attachments} />
        {isDraftReply && onApproveAndSendDraft && (
          <div className="draft-actions mt-3 d-flex gap-2">
            <button 
              className="btn btn-sm btn-outline-secondary" 
              onClick={() => navigator.clipboard.writeText(draftContent)} 
              title="Copy reply text"
            >
              <i className="fas fa-copy"></i> Copy
            </button>
            <button 
              className="btn btn-sm btn-primary" 
              onClick={() => onApproveAndSendDraft(draftContent)} 
              disabled={isSubmittingComment} 
              title="Send this reply as an email"
            >
              <i className="fas fa-paper-plane me-1"></i> Approve & Send Email
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Helper function to detect if content appears to be HTML
const isHtmlContent = (content: string): boolean => {
  return /<[a-z][\s\S]*>/i.test(content);
};

export default CommunicationItem; 