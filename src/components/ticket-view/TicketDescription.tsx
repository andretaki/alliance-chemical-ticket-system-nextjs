'use client';

import React from 'react';
import { format } from 'date-fns';
import DOMPurify from 'dompurify';

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

interface TicketDescriptionProps {
  ticket: {
    title: string;
    description: string | null;
    createdAt: string;
    attachments?: AttachmentData[];
  };
}

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

const parseDate = (dateString: string | null): Date | null => {
  if (!dateString) return null;
  try {
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
};

// Function to detect if content appears to be HTML
const isHtmlContent = (content: string): boolean => {
  return /<[a-z][\s\S]*>/i.test(content);
};

export default function TicketDescription({ ticket }: TicketDescriptionProps) {
  const createdAtDate = parseDate(ticket.createdAt);
  
  return (
    <div className="ticket-description mb-4 border rounded overflow-hidden">
      <div className="message-header d-flex justify-content-between align-items-center px-3 py-2 bg-light border-bottom">
        <div className="d-flex align-items-center">
          <div className="bg-primary rounded-circle d-flex align-items-center justify-content-center me-2" style={{ width: '32px', height: '32px' }}>
            <i className="fas fa-ticket-alt text-white"></i>
          </div>
          <strong>Original Request</strong>
        </div>
        {createdAtDate && (
          <span className="text-muted small">{format(createdAtDate, 'PPp')}</span>
        )}
      </div>
      
      <div className="message-content p-3">
        {/* Description Text */}
        {ticket.description ? (
          isHtmlContent(ticket.description) ? (
            <div 
              className="description-text" 
              dangerouslySetInnerHTML={{ 
                __html: DOMPurify.sanitize(ticket.description) 
              }}
            />
          ) : (
            <div className="description-text" style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
              {ticket.description}
            </div>
          )
        ) : (
          <span className="text-muted fst-italic">No description provided.</span>
        )}
        
        {/* Attachments */}
        {ticket.attachments && ticket.attachments.length > 0 && (
          <div className="mt-3 pt-3 border-top">
            <AttachmentListDisplay attachments={ticket.attachments} title="Attachments" />
          </div>
        )}
      </div>
    </div>
  );
} 