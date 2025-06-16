import React from 'react';
import { format } from 'date-fns';
import { AttachmentData } from './TicketViewClient'; // Assuming AttachmentData type is exported or defined here
import AttachmentList from './AttachmentList'; // Import the AttachmentList component

interface CommunicationItemProps {
  id: number | string; // Ticket ID for description, Comment ID for comments
  fromName: string;
  fromEmail?: string | null;
  sentDate: string; // ISO Date string
  subject?: string; // Only for the initial ticket description
  toRecipients?: string[] | null; // Only for outgoing emails
  ccRecipients?: string[] | null; // If tracked in the future
  body: string | null;
  attachments?: AttachmentData[];
  isInternalNote?: boolean;
  isOutgoingReply?: boolean;
  isFromCustomer?: boolean;
  isInitialDescription?: boolean;
}

const CommunicationItem: React.FC<CommunicationItemProps> = ({
  id,
  fromName,
  fromEmail,
  sentDate,
  subject,
  toRecipients,
  ccRecipients,
  body,
  attachments,
  isInternalNote = false,
  isOutgoingReply = false,
  isFromCustomer = false,
  isInitialDescription = false,
}) => {
  // Determine background and border based on type
  let containerClasses = `communication-item mb-4 border rounded shadow-sm`; // Base styling
  let headerClasses = `communication-header p-3 border-bottom bg-light`; // Default header
  let badge = null;
  let iconClass = 'fas fa-envelope'; // Default icon

  if (isInternalNote) {
    containerClasses += ' border-warning bg-warning-subtle';
    headerClasses = `communication-header p-3 border-bottom bg-warning-subtle`; // Match container
    badge = <span className="badge bg-warning text-dark ms-2">Internal Note</span>;
    iconClass = 'fas fa-lock text-warning';
  } else if (isOutgoingReply) {
    containerClasses += ' border-info bg-info-subtle';
    headerClasses = `communication-header p-3 border-bottom bg-info-subtle`; // Match container
    badge = <span className="badge bg-info text-dark ms-2" title="Sent as email"><i className="fas fa-paper-plane"></i> Sent</span>;
    iconClass = 'fas fa-paper-plane text-info';
  } else if (isFromCustomer || isInitialDescription) {
    // Treat initial description like an incoming email
    containerClasses += ' border-success bg-success-subtle';
    headerClasses = `communication-header p-3 border-bottom bg-success-subtle`; // Match container
    badge = <span className="badge bg-success ms-2" title="Received via Email"><i className="fas fa-envelope"></i> Received</span>;
    iconClass = 'fas fa-envelope text-success';
  } else {
     // Standard manual comment by an agent
     containerClasses += ' border-light bg-white'; // Simple white background
     iconClass = 'fas fa-user-edit text-secondary';
  }

  const displayBody = body || (attachments && attachments.length > 0 ? '(No message body - see attachments)' : '(Empty Body)');

  return (
    <div key={id} className={containerClasses}>
      {/* --- Header Section --- */}
      <div className={headerClasses}>
        <div className="d-flex justify-content-between align-items-start mb-2 flex-wrap">
          <div>
            <strong className="d-block">From: {fromName} {fromEmail ? `<${fromEmail}>` : ''}</strong>
            {isOutgoingReply && toRecipients && toRecipients.length > 0 && (
              <span className="d-block text-muted small">To: {toRecipients.join(', ')}</span>
            )}
            {/* Add CC recipients if available */}
          </div>
          <div className="text-muted text-end ms-2">
             <small>{format(new Date(sentDate), 'PPp')}</small> {/* Date and Time */}
             <div className="mt-1">{badge}</div> {/* Badge below date */}
          </div>
        </div>
        {subject && (
          <div>
            <strong className="d-block">Subject: {subject}</strong>
          </div>
        )}
      </div>

      {/* --- Body Section --- */}
      <div className="communication-body p-3">
        <div style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', fontSize: '0.95rem' }}>
            {displayBody}
        </div>
      </div>

      {/* --- Attachments Section --- */}
      {attachments && attachments.length > 0 && (
        <div className="communication-attachments border-top p-3">
           <AttachmentList attachments={attachments} />
        </div>
      )}
    </div>
  );
};

export default CommunicationItem;

// Add helper types to TicketViewClient or a shared types file if needed
export type { AttachmentData }; // Exporting for use in TicketViewClient 