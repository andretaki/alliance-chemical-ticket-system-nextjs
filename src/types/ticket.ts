export interface AttachmentData {
  id: number;
  filename: string; // Internal storage filename, can be same as original if not renaming
  originalFilename: string;
  mimeType: string;
  fileSize: number; // in bytes
  uploadedAt: string; // ISO string
  commentId?: number | null;
  ticketId?: number | null;
  // url can be constructed: `/api/attachments/${id}/download`
}

// User type that will be used for reporter, assignee, commenter
export interface TicketUser {
  id: string; // User ID (UUID string from your schema)
  name: string | null;
  email: string | null;
}

export interface TicketComment {
  id: number;
  commentText: string | null;
  createdAt: string; // ISO string
  commenter: TicketUser | null; // User who made the comment. Null for system-generated notes.
  isInternalNote: boolean;
  isFromCustomer: boolean;    // True if the comment was from the original ticket sender/customer.
  isOutgoingReply: boolean;   // True if this comment was sent as an email reply from an agent.
  attachments?: AttachmentData[];
  externalMessageId?: string | null; // Original email message ID if this comment came from an email
}

export interface Ticket {
  id: number;
  title: string;
  description: string | null; // Initial description of the ticket
  status: 'new' | 'open' | 'in_progress' | 'pending_customer' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  type: string | null; // e.g., "Quote Request", "General Inquiry"
  createdAt: string; // ISO string
  updatedAt: string; // ISO string

  reporter: TicketUser | null; // User who reported/created the ticket.
  assignee: TicketUser | null; // User currently assigned to the ticket.

  // Customer-specific info if the ticket originated from an external email
  senderEmail: string | null;
  senderName: string | null;
  senderPhone?: string | null;

  // Email processing related fields
  externalMessageId: string | null; // InternetMessageId of the original email that created this ticket
  conversationId: string | null;    // Conversation-ID from email headers

  // AI related fields (optional)
  sentiment?: 'positive' | 'neutral' | 'negative' | null;
  ai_summary?: string | null;
  ai_suggested_assignee_id?: string | null;
  aiSuggestedAction?: 'CREATE_QUOTE' | 'CHECK_ORDER_STATUS' | 'DOCUMENT_REQUEST' | 'GENERAL_REPLY' | null;
  aiSuggestedAssignee?: TicketUser | null;

  // SLA related fields (optional)
  slaPolicyId?: number | null;
  firstResponseDueAt?: string | null;
  resolutionDueAt?: string | null;
  slaBreached?: boolean;

  // Relational data
  comments: TicketComment[];
  attachments?: AttachmentData[]; // Attachments linked directly to the ticket

  // UI/Helper flags (can be derived or set by backend)
  lastCommenterIsCustomer?: boolean;

  // Other common fields
  tags?: string[];
  customFields?: Record<string, any>;
  orderNumber?: string | null;
  trackingNumber?: string | null;
} 