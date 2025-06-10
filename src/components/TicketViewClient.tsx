// src/components/TicketViewClient.tsx
'use client';

import React, { useState, useEffect, useCallback, useRef, ChangeEvent, FormEvent } from 'react';
import axios, { AxiosError } from 'axios';
import { format, formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { ticketPriorityEnum, ticketStatusEnum, users as usersSchema } from '@/db/schema';
import { InferSelectModel } from 'drizzle-orm';
import toast from 'react-hot-toast';

// Import our new components
import TicketHeaderBar from './ticket-view/TicketHeaderBar';
import TicketDescription from './ticket-view/TicketDescription';
import CommunicationHistory from './ticket-view/CommunicationHistory';
import ReplyForm from './ticket-view/ReplyForm';
import TicketDetailsSidebar from './ticket-view/TicketDetailsSidebar';
import ShippingInfoSidebar from './ticket-view/ShippingInfoSidebar';
import type { ShopifyDraftOrderGQLResponse } from '@/agents/quoteAssistant/quoteInterfaces';

// --- Type Definitions ---
type BaseUser = {
  id: string;
  name: string | null;
  email: string | null;
};

type User = InferSelectModel<typeof usersSchema>;

export interface AttachmentData {
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
  title: string;
  description: string | null;
  status: string;
  priority: string;
  type: string | null;
  assignee: BaseUser | null;
  reporter: BaseUser | null;
  createdAt: string;
  updatedAt: string;
  orderNumber: string | null;
  trackingNumber: string | null;
  senderEmail: string | null;
  senderName: string | null;
  senderPhone?: string | null;
  externalMessageId: string | null;
  conversationId: string | null;
  comments: CommentData[];
  attachments?: AttachmentData[];
}

interface TicketViewClientProps {
  initialTicket: TicketData;
  relatedQuote?: ShopifyDraftOrderGQLResponse | null;
  quoteAdminUrl?: string | null;
}

// --- Helper Functions ---
const extractFirstName = (fullName: string | null | undefined): string => {
  if (!fullName) return 'Customer';
  
  if (fullName.includes(',')) {
    const parts = fullName.split(',');
    if (parts.length > 1) return parts[1].trim();
  }
  
  const words = fullName.trim().split(/\s+/);
  return words[0];
};

const getStatusConfig = (status: string | null) => {
  switch (status?.toLowerCase()) {
    case 'new':
      return { 
        class: 'status-new', 
        icon: 'fas fa-star',
        label: 'New'
      };
    case 'open':
      return { 
        class: 'status-open', 
        icon: 'fas fa-folder-open',
        label: 'Open'
      };
    case 'in_progress':
      return { 
        class: 'status-progress', 
        icon: 'fas fa-cog fa-spin',
        label: 'In Progress'
      };
    case 'pending_customer':
      return { 
        class: 'status-pending', 
        icon: 'fas fa-clock',
        label: 'Pending Customer'
      };
    case 'closed':
      return { 
        class: 'status-closed', 
        icon: 'fas fa-check-circle',
        label: 'Closed'
      };
    default:
      return { 
        class: 'status-unknown', 
        icon: 'fas fa-question-circle',
        label: status || 'Unknown'
      };
  }
};

const getPriorityConfig = (priority: string | null) => {
  switch (priority?.toLowerCase()) {
    case 'low':
      return { class: 'priority-low', label: 'Low', icon: 'fas fa-flag' };
    case 'medium':
      return { class: 'priority-medium', label: 'Medium', icon: 'fas fa-flag' };
    case 'high':
      return { class: 'priority-high', label: 'High', icon: 'fas fa-flag' };
    case 'urgent':
      return { class: 'priority-urgent', label: 'Urgent', icon: 'fas fa-exclamation-triangle' };
    default:
      return { class: 'priority-none', label: priority || 'None', icon: 'fas fa-flag' };
  }
};

const formatFileSize = (bytes?: number): string => {
    if (bytes === undefined || bytes === null || bytes < 0) return '';
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

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

// Attachment List Component
const AttachmentListDisplay: React.FC<{ attachments?: AttachmentData[], title?: string }> = ({ attachments, title }) => {
    if (!attachments || attachments.length === 0) return null;
    return (
      <div className="attachment-list">
        {title && (
          <div className="attachment-header">
            <i className="fas fa-paperclip"></i>
            <span>{title} ({attachments.length})</span>
          </div>
        )}
        <div className="attachment-grid">
          {attachments.map(att => (
            <a
              key={att.id}
              href={`/api/attachments/${att.id}/download`}
              target="_blank"
              rel="noopener noreferrer"
              className="attachment-item"
              title={`Download ${att.originalFilename}`}
            >
              <div className="attachment-icon">
                <i className={`fas ${getFileIconClass(att.mimeType)}`}></i>
              </div>
              <div className="attachment-info">
                <span className="attachment-name">{att.originalFilename}</span>
                <span className="attachment-size">{formatFileSize(att.fileSize)}</span>
              </div>
              <div className="attachment-download">
                <i className="fas fa-download"></i>
              </div>
            </a>
          ))}
        </div>
      </div>
    );
};

// --- Main Component ---
export default function TicketViewClient({ initialTicket, relatedQuote, quoteAdminUrl }: TicketViewClientProps) {
  const [ticket, setTicket] = useState<TicketData>(initialTicket);
  const [users, setUsers] = useState<BaseUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUsersLoading, setIsUsersLoading] = useState(true);
  const [isUpdatingAssignee, setIsUpdatingAssignee] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Comment form state
  const [newComment, setNewComment] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [sendAsEmail, setSendAsEmail] = useState(false);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parsed ShipStation info state
  const [extractedStatus, setExtractedStatus] = useState<string | null>(null);
  const [extractedCarrier, setExtractedCarrier] = useState<string | null>(null);
  const [extractedTracking, setExtractedTracking] = useState<string | null>(null);
  const [extractedShipDate, setExtractedShipDate] = useState<string | null>(null);
  const [extractedOrderDate, setExtractedOrderDate] = useState<string | null>(null);

  // Order Status Draft state
  const [isLoadingOrderStatusDraft, setIsLoadingOrderStatusDraft] = useState(false);
  const [orderStatusDraft, setOrderStatusDraft] = useState<string | null>(null);
  const [orderStatusDraftError, setOrderStatusDraftError] = useState<string | null>(null);

  // Live ShipStation Data State
  const [liveShipStationData, setLiveShipStationData] = useState<any>(null);
  const [isLoadingLiveData, setIsLoadingLiveData] = useState(false);
  const [liveDataFetchedAt, setLiveDataFetchedAt] = useState<string | null>(null);
  const [liveDataError, setLiveDataError] = useState<string | null>(null);

  // Resend Invoice State
  const [isResendingInvoice, setIsResendingInvoice] = useState(false);
  const [invoiceInfo, setInvoiceInfo] = useState<{
    quoteName: string;
    recipientEmail: string;
    draftOrderId: string;
  } | null>(null);
  const [isResendingShopifyInvoice, setIsResendingShopifyInvoice] = useState(false);
  const [isResendingPdf, setIsResendingPdf] = useState(false);

  const parseDate = (dateString: string | Date | null | undefined): Date | null => {
      if (!dateString) return null;
      if (dateString instanceof Date) return dateString;
      try {
          const date = new Date(dateString);
          return isNaN(date.getTime()) ? null : date;
      } catch {
          return null;
      }
  };

  // --- Effects ---
  useEffect(() => {
    const fetchUsers = async () => {
      setIsUsersLoading(true);
      try {
        const res = await axios.get<BaseUser[]>('/api/users');
        setUsers(res.data);
      } catch (err) {
        console.error("Failed to fetch users:", err);
        setError("Could not load assignable users.");
      } finally {
        setIsUsersLoading(false);
      }
    };
    fetchUsers();
  }, []);

  // Parse ShipStation Info from Comments - DISABLED: Now using live data instead
  useEffect(() => {
    console.log('[TicketViewClient] ShipStation comment parsing DISABLED - using live data instead');
    setExtractedStatus(null); 
    setExtractedOrderDate(null); 
    setExtractedCarrier(null);
    setExtractedTracking(null); 
    setExtractedShipDate(null);
  }, [ticket.comments]);

  // Checkbox mutual exclusivity
  useEffect(() => { if (isInternalNote && sendAsEmail) setSendAsEmail(false); }, [isInternalNote, sendAsEmail]);
  useEffect(() => { if (sendAsEmail && isInternalNote) setIsInternalNote(false); }, [sendAsEmail, isInternalNote]);

  // --- Data Fetching & Updating Functions ---
  const refreshTicket = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await axios.get<TicketData>(`/api/tickets/${initialTicket.id}`);
      setTicket(response.data);
    } catch (err) {
      console.error('Failed to refresh ticket data:', err);
      setError('Could not refresh ticket data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [initialTicket.id]);

  const handleAssigneeChange = useCallback(async (e: ChangeEvent<HTMLSelectElement>) => {
    const selectedAssigneeId = e.target.value || null;
    if (selectedAssigneeId === (ticket.assignee?.id || null)) return;

    setIsUpdatingAssignee(true);
    setError(null);
    const originalAssignee = ticket.assignee;

    try {
      await axios.put(`/api/tickets/${ticket.id}`, { assigneeId: selectedAssigneeId });
      await refreshTicket();
    } catch (err) {
      console.error('Error updating assignee:', err);
      setError(axios.isAxiosError(err) ? err.response?.data?.error || 'Failed to update assignee.' : 'Failed to update assignee.');
      setTicket(prev => ({ ...prev, assignee: originalAssignee }));
      setTimeout(() => setError(null), 6000);
    } finally {
      setIsUpdatingAssignee(false);
    }
  }, [ticket.id, ticket.assignee, refreshTicket]);

  const handleStatusSelectChange = useCallback(async (e: ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value as typeof ticketStatusEnum.enumValues[number];
    if (newStatus === ticket.status) return;

    setIsUpdatingStatus(true);
    setError(null);
    const originalStatus = ticket.status;

    try {
      await axios.put(`/api/tickets/${ticket.id}`, { status: newStatus });
      await refreshTicket();
    } catch (err) {
      console.error('Error updating status:', err);
      setError(axios.isAxiosError(err) ? err.response?.data?.error || 'Failed to update status.' : 'Failed to update status.');
      setTicket(prev => ({ ...prev, status: originalStatus }));
      setTimeout(() => setError(null), 6000);
    } finally {
      setIsUpdatingStatus(false);
    }
  }, [ticket.id, ticket.status, refreshTicket]);

  // Order Status Draft Handler
  const handleGetOrderStatusDraft = useCallback(async () => {
    if (!ticket?.id) return;

    setIsLoadingOrderStatusDraft(true);
    setOrderStatusDraft('');
    setOrderStatusDraftError(null);
    try {
      const response = await axios.post(`/api/tickets/${ticket.id}/draft-order-status-reply`);
      if (response.data && response.data.draft) {
        setOrderStatusDraft(response.data.draft);
        toast.success("AI-drafted reply for order status is ready!");
      } else {
        const errorMsg = "Couldn't generate a draft. The order might not exist or there was an issue.";
        setOrderStatusDraftError(errorMsg);
        setError(errorMsg);
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || "Failed to get order status draft.";
      setOrderStatusDraftError(errorMsg);
      toast.error(errorMsg);
      console.error("Order Status Draft Error:", err);
    } finally {
      setIsLoadingOrderStatusDraft(false);
    }
  }, [ticket?.id]);

  // Live ShipStation Data Handler
  const fetchLiveShipStationData = useCallback(async () => {
    if (!ticket?.id) return;

    setIsLoadingLiveData(true);
    setLiveDataError(null);

    try {
      console.log(`🔄 [TicketViewClient] Fetching live ShipStation data for ticket #${ticket.id}`);
      const response = await axios.get(`/api/tickets/${ticket.id}/shipstation-live`);
      
      if (response.data) {
        setLiveShipStationData(response.data.shipstationData);
        setLiveDataFetchedAt(response.data.fetchedAt);
        console.log(`✅ [TicketViewClient] Live ShipStation data received:`, response.data.shipstationData);
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || "Failed to fetch live ShipStation data.";
      setLiveDataError(errorMsg);
      console.error("Live ShipStation Data Error:", err);
    } finally {
      setIsLoadingLiveData(false);
    }
  }, [ticket?.id]);

  // Effect to fetch live data when ticket loads
  useEffect(() => {
    if (ticket?.orderNumber) {
      console.log(`🚀 [TicketViewClient] Ticket loaded with order number ${ticket.orderNumber}, fetching live ShipStation data...`);
      fetchLiveShipStationData();
    }
  }, [ticket?.orderNumber, fetchLiveShipStationData]);

  // Extract invoice information from comments
  useEffect(() => {
    const extractInvoiceInfo = () => {
      const invoiceComment = ticket.comments.find(comment => 
        comment.commentText?.includes('Invoice email sent') && 
        comment.commentText?.includes('for quote')
      );
      
      if (invoiceComment && invoiceComment.commentText) {
        const emailMatch = invoiceComment.commentText.match(/Invoice email sent to ([^\s]+)/);
        const quoteMatch = invoiceComment.commentText.match(/for quote ([^\s]+)/);
        
        if (emailMatch && quoteMatch) {
          const recipientEmail = emailMatch[1];
          const quoteName = quoteMatch[1];
          
          setInvoiceInfo({
            quoteName,
            recipientEmail,
            draftOrderId: '',
          });
        }
      }
    };
    
    extractInvoiceInfo();
  }, [ticket.comments]);

  // Resend Invoice Function
  const handleResendInvoice = async () => {
    if (!invoiceInfo) return;
    
    setIsResendingInvoice(true);
    setError(null);
    
    try {
      const response = await axios.get(`/api/draft-orders/search?name=${encodeURIComponent(invoiceInfo.quoteName)}`);
      const draftOrder = response.data;
      
      if (!draftOrder || !draftOrder.id) {
        throw new Error('Could not find the draft order for this quote');
      }
      
      await axios.post('/api/email/send-invoice', {
        draftOrderId: draftOrder.id,
        recipientEmail: invoiceInfo.recipientEmail,
        ticketId: ticket.id
      });
      
      toast.success(`Invoice successfully resent to ${invoiceInfo.recipientEmail}`);
      await refreshTicket();
      
    } catch (error) {
      console.error('Error resending invoice:', error);
      const errorMessage = axios.isAxiosError(error) 
        ? error.response?.data?.error || 'Failed to resend invoice'
        : 'Failed to resend invoice';
      setError(errorMessage);
    } finally {
      setIsResendingInvoice(false);
    }
  };

  const handleResendShopifyInvoice = async () => {
    if (!relatedQuote?.id) {
      toast.error('No related quote found to resend invoice.');
      return;
    }
    setIsResendingShopifyInvoice(true);
    toast.loading('Resending Shopify invoice...');

    try {
      await axios.post('/api/draft-orders/send-invoice', {
        draftOrderId: relatedQuote.id,
      });
      toast.dismiss();
      toast.success('Shopify invoice has been resent.');
    } catch (error) {
      console.error('Error resending Shopify invoice:', error);
      toast.dismiss();

      let errorMessage = 'Failed to resend Shopify invoice.';
      if (axios.isAxiosError(error)) {
        errorMessage = error.response?.data?.error || errorMessage;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage);
    } finally {
      setIsResendingShopifyInvoice(false);
    }
  };

  const handleResendPdfInvoice = async () => {
    if (!relatedQuote?.legacyResourceId || !relatedQuote.customer?.email) {
        toast.error('Quote details or customer email are missing.');
        return;
    }
    setIsResendingPdf(true);
    toast.loading('Resending PDF invoice via email...');

    try {
        await axios.post('/api/email/send-invoice', {
            draftOrderId: relatedQuote.legacyResourceId,
            recipientEmail: relatedQuote.customer.email
        });
        toast.dismiss();
        toast.success('PDF invoice has been resent via email.');
    } catch (error) {
        console.error('Error resending PDF invoice:', error);
        toast.dismiss();

        let errorMessage = 'Failed to resend PDF invoice.';
        if (axios.isAxiosError(error)) {
            errorMessage = error.response?.data?.error || errorMessage;
        } else if (error instanceof Error) {
            errorMessage = error.message;
        }
        
        toast.error(errorMessage);
    } finally {
        setIsResendingPdf(false);
    }
  };

  // Reopen ticket handler
  const handleReopenTicket = async () => {
    if (ticket.status !== 'closed') return;
    const toastId = toast.loading('Reopening ticket...');
    try {
      await axios.post(`/api/admin/tickets/${ticket.id}/reopen`);
      await refreshTicket();
      toast.success('Ticket has been reopened!', { id: toastId });
    } catch (err) {
      console.error('Error reopening ticket:', err);
      const errorMessage = axios.isAxiosError(err)
        ? err.response?.data?.error || 'Failed to reopen ticket.'
        : 'Failed to reopen ticket.';
      toast.error(errorMessage, { id: toastId });
    }
  };

  // --- Comment & Attachment Functions ---
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const currentFiles = files.length;
      const newFiles = Array.from(e.target.files);
      if (currentFiles + newFiles.length > 5) {
         setError("Maximum 5 attachments allowed per comment.");
         if (fileInputRef.current) fileInputRef.current.value = '';
         return;
      }
      setFiles(prevFiles => [...prevFiles, ...newFiles]);
    }
  };

  const removeFile = (indexToRemove: number) => {
    setFiles(prevFiles => prevFiles.filter((_, index) => index !== indexToRemove));
    if (files.length === 1 && fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCommentSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() && files.length === 0) {
        setError("Please enter a comment or attach a file.");
        return;
    }

    setIsSubmittingComment(true);
    setError(null);
    let uploadedAttachmentIds: number[] = [];

    try {
      if (files.length > 0) {
        const formData = new FormData();
        files.forEach(file => formData.append('files', file));
        try {
          const attachmentResponse = await axios.post<AttachmentData[]>(`/api/tickets/${ticket.id}/attachments`, formData);
          uploadedAttachmentIds = attachmentResponse.data.map(att => att.id);
        } catch (uploadError) {
           console.error("Attachment upload failed:", uploadError);
           setError("Failed to upload attachments. Comment not saved.");
           setIsSubmittingComment(false);
           return;
        }
      }

      await axios.post(`/api/tickets/${ticket.id}/reply`, {
        content: newComment.trim() || null,
        isInternalNote,
        sendAsEmail,
        attachmentIds: uploadedAttachmentIds,
      });

      setNewComment('');
      setIsInternalNote(false);
      setSendAsEmail(false);
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await refreshTicket();

    } catch (err) {
      console.error('Error posting comment/reply:', err);
      setError(axios.isAxiosError(err) ? err.response?.data?.error || 'Failed to post comment/reply.' : 'Failed to post comment/reply.');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // Improved handleApproveAndSendDraft function
  const handleApproveAndSendDraft = useCallback(async (draftText: string) => {
    if (!ticket?.senderEmail) {
        setError("Cannot send email: Original sender email not found for this ticket.");
        return;
    }
    
    setNewComment(draftText);
    setSendAsEmail(true);
    setIsInternalNote(false);
    setFiles([]);

    setIsSubmittingComment(true); 
    setError(null);
    
    try {
      await axios.post(`/api/tickets/${ticket.id}/reply`, {
        content: draftText.trim(),
        isInternalNote: false, 
        sendAsEmail: true, 
        attachmentIds: [],
      });
      
      setNewComment(''); 
      setIsInternalNote(false); 
      setSendAsEmail(false); 
      setFiles([]);
      
      await refreshTicket();
    } catch (err) {
      console.error('Error sending AI suggested reply:', err);
      setError(axios.isAxiosError(err) ? err.response?.data?.error || 'Failed to send the email reply.' : 'Failed to send the email reply.');
    } finally {
      setIsSubmittingComment(false);
    }
  }, [ticket?.senderEmail, ticket?.id, refreshTicket]);

  const insertSuggestedResponse = useCallback(() => {
    setError(null);
    const customerName = extractFirstName(ticket.senderName || ticket.reporter?.name);
    const orderNum = ticket.orderNumber;
    if (!orderNum) { setError("Cannot generate reply: Ticket is missing the Order Number."); return; }

    let suggestedReply = '';
    const signature = "\n\nBest regards,\nAlliance Chemical Shipping Team";

    switch (extractedStatus) {
      case 'shipped':
        if (!extractedOrderDate || !extractedShipDate || !extractedTracking || !extractedCarrier) {
          setError("Could not find necessary details (Order Date, Ship Date, Tracking, or Carrier) in the internal note to generate reply.");
          return;
        }
        suggestedReply = `Hi ${customerName},\n\nThank you for reaching out about order #${orderNum} (placed on **${extractedOrderDate}**).\n\nOur records show this order shipped on **${extractedShipDate}** via **${extractedCarrier}** with tracking number **${extractedTracking}**.\n\nPlease note that tracking information might no longer be available on the carrier's website for older shipments. Packages typically arrive shortly after their ship date.\n\nCould you confirm if this is the correct order number and date you were inquiring about? If you meant a different, more recent order, please provide that number.\n\nLet us know how we can further assist you.${signature}`;
        break;
      case 'awaiting_shipment':
      case 'processing':
        suggestedReply = `Hi ${customerName},\n\nThank you for contacting us about order #${orderNum}.\n\nThis order is currently processing in our warehouse queue ${extractedOrderDate ? `(placed on ${extractedOrderDate}) ` : ''}and is awaiting shipment. Orders typically ship within 1-3 business days from the order date.\n\nYou will receive a separate email with tracking information as soon as it leaves our facility.\n\nPlease let us know if you have any other questions in the meantime.${signature}`;
        break;
      default:
        setError(`Cannot generate automated reply for status "${extractedStatus || 'Unknown'}".`); return;
    }

    setNewComment(suggestedReply);
    if (ticket.senderEmail) { setSendAsEmail(true); setIsInternalNote(false); }
  }, [ticket.senderName, ticket.reporter, ticket.orderNumber, ticket.senderEmail, extractedStatus, extractedOrderDate, extractedShipDate, extractedTracking, extractedCarrier]);

  // --- Render Logic ---
  if (isUsersLoading) {
     return (
       <div className="glass-container">
         <div className="glass-card loading-state">
           <div className="loading-spinner"></div>
           <p>Loading ticket details...</p>
         </div>
       </div>
     );
  }

  if (!ticket && !isLoading) {
      return <div className="glass-alert glass-alert-danger">Ticket not found or could not be loaded.</div>;
  }

  const createdAtDate = parseDate(ticket.createdAt);
  const updatedAtDate = parseDate(ticket.updatedAt);
  const statusConfig = getStatusConfig(ticket.status);
  const priorityConfig = getPriorityConfig(ticket.priority);

  return (
    <div className="ticket-view-container">
      {/* Error Alert */}
      {error && (
        <div className="glass-alert glass-alert-danger">
          <div className="alert-content">
            <i className="fas fa-exclamation-triangle"></i>
            <span>{error}</span>
            <button onClick={() => setError(null)} className="alert-close">
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>
      )}
      
      {/* Premium Header */}
      <div className="glass-card ticket-header">
        <div className="header-main">
          <div className="ticket-identity">
            <div className="ticket-icon gradient-icon">
              <i className="fas fa-ticket-alt"></i>
            </div>
            <div className="ticket-meta">
              <div className="ticket-title-row">
                <span className="ticket-id">#{ticket.id}</span>
                <h1 className="ticket-title">{ticket.title}</h1>
              </div>
              <div className="status-row">
                <span className={`status-badge ${statusConfig.class}`}>
                  <i className={statusConfig.icon}></i>
                  <span>{statusConfig.label}</span>
                </span>
                <span className={`priority-badge ${priorityConfig.class}`}>
                  <i className={priorityConfig.icon}></i>
                  <span>{priorityConfig.label}</span>
                </span>
                {ticket.comments.some(c => isAISuggestionNote(c.commentText)) && (
                  <span className="ai-indicator">
                    <i className="fas fa-robot"></i>
                    <span>AI Suggestion Available</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="header-controls">
            <div className="control-group">
              <label className="control-label">Status</label>
              <div className="glass-select-wrapper">
                <select 
                  className="glass-select" 
                  value={ticket.status} 
                  onChange={handleStatusSelectChange} 
                  disabled={isUpdatingStatus}
                >
                  {ticketStatusEnum.enumValues.map(s => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </option>
                  ))}
                </select>
                {isUpdatingStatus && <div className="loading-overlay"><div className="spinner"></div></div>}
              </div>
            </div>
            
            <div className="control-group">
              <label className="control-label">Assignee</label>
              <div className="glass-select-wrapper">
                <select 
                  className="glass-select" 
                  value={ticket.assignee?.id || ''} 
                  onChange={handleAssigneeChange} 
                  disabled={isUpdatingAssignee}
                >
                  <option value="">Unassigned</option>
                  {users.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.name || user.email}
                    </option>
                  ))}
                </select>
                {isUpdatingAssignee && <div className="loading-overlay"><div className="spinner"></div></div>}
              </div>
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="action-bar">
          <div className="action-group-left">
            {ticket.orderNumber && (
              <button
                type="button"
                className="glass-btn glass-btn-info"
                onClick={handleGetOrderStatusDraft}
                disabled={isLoadingOrderStatusDraft}
              >
                {isLoadingOrderStatusDraft ? (
                  <>
                    <div className="spinner"></div>
                    <span>Fetching Status...</span>
                  </>
                ) : (
                  <>
                    <i className="fas fa-truck"></i>
                    <span>Get Order Status</span>
                  </>
                )}
              </button>
            )}

            {invoiceInfo && (
              <button
                type="button"
                className="glass-btn glass-btn-warning"
                onClick={handleResendInvoice}
                disabled={isResendingInvoice}
              >
                {isResendingInvoice ? (
                  <>
                    <div className="spinner"></div>
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <i className="fas fa-envelope"></i>
                    <span>Resend Invoice</span>
                  </>
                )}
              </button>
            )}

            {ticket.status === 'closed' && (
              <button onClick={handleReopenTicket} className="glass-btn glass-btn-warning">
                <i className="fas fa-folder-open"></i>
                <span>Reopen Ticket</span>
              </button>
            )}
          </div>
          
          <div className="action-group-right">
            <Link href={`/tickets/${ticket.id}/create-quote`} className="glass-btn glass-btn-success">
              <i className="fas fa-file-invoice-dollar"></i>
              <span>Create Quote</span>
            </Link>

            <button 
              className="glass-btn glass-btn-secondary" 
              onClick={() => {
                const url = `${window.location.origin}/tickets/${ticket.id}`;
                navigator.clipboard.writeText(url);
                toast.success('Link copied to clipboard!');
              }}
              title="Copy ticket link"
            >
              <i className="fas fa-link"></i>
              <span>Copy Link</span>
            </button>

            <Link href={`/tickets/${ticket.id}/edit`} className="glass-btn glass-btn-secondary">
              <i className="fas fa-edit"></i>
              <span>Edit</span>
            </Link>
            
            <Link href="/tickets" className="glass-btn glass-btn-secondary">
              <i className="fas fa-arrow-left"></i>
              <span>Back to List</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="content-layout">
        {/* Main Column */}
        <div className="main-content">
          {/* Original Description */}
          <div className="glass-card communication-card">
            <div className="card-header gradient-header">
              <div className="header-icon">
                <i className="fas fa-ticket-alt"></i>
              </div>
              <div className="header-content">
                <h3>Original Request</h3>
                <span className="timestamp">
                  {createdAtDate ? format(createdAtDate, 'PPp') : 'Unknown'}
                </span>
              </div>
            </div>
            <div className="card-content">
              <div className="message-content">
                {ticket.description || <span className="empty-state">No description provided.</span>}
              </div>
              {ticket.attachments && ticket.attachments.length > 0 && (
                <AttachmentListDisplay attachments={ticket.attachments} title="Attachments" />
              )}
            </div>
          </div>

          {/* Communication History */}
          <div className="communications-section">
            {ticket.comments.map((comment, index) => {
              const isAIResponse = isAISuggestionNote(comment.commentText);
              const aiSuggestionContent = isAIResponse ? extractAISuggestionContent(comment.commentText) : '';
              const aiSuggestionTitle = isAIResponse ? getAISuggestionTitle(comment.commentText) : '';
              const commentDate = parseDate(comment.createdAt);
              const senderDisplayName = isAIResponse ? "AI Assistant" : 
                                        comment.commenter?.name || 
                                        (comment.isFromCustomer ? (ticket.senderName || ticket.senderEmail || 'Customer') : 'System/Agent');

              let cardClasses = 'glass-card communication-card';
              let headerIcon = 'fas fa-user-edit';

              if (isAIResponse) {
                cardClasses += ' ai-suggestion';
                headerIcon = 'fas fa-robot';
              } else if (comment.isInternalNote) {
                cardClasses += ' internal-note';
                headerIcon = 'fas fa-lock';
              } else if (comment.isOutgoingReply) {
                cardClasses += ' outgoing-reply';
                headerIcon = 'fas fa-paper-plane';
              } else if (comment.isFromCustomer) {
                cardClasses += ' incoming-message';
                headerIcon = 'fas fa-envelope';
              }

              return (
                <div key={comment.id} className={cardClasses}>
                  <div className="card-header">
                    <div className="commenter-avatar">
                      <i className={headerIcon}></i>
                    </div>
                    <div className="header-content">
                      <h4>{senderDisplayName}</h4>
                      <span className="timestamp">
                        {commentDate ? format(commentDate, 'PPp') : 'Unknown time'}
                      </span>
                    </div>
                    <div className="message-badges">
                      {isAIResponse && <span className="badge badge-ai">AI Suggestion</span>}
                      {comment.isInternalNote && !isAIResponse && <span className="badge badge-internal">Internal</span>}
                      {comment.isOutgoingReply && <span className="badge badge-sent">Sent</span>}
                      {comment.isFromCustomer && <span className="badge badge-received">Received</span>}
                    </div>
                  </div>
                  <div className="card-content">
                    {isAIResponse ? (
                      <div className="ai-suggestion-wrapper">
                        <div className="ai-suggestion-header">
                          <h6>
                            <i className="fas fa-lightbulb"></i>
                            {aiSuggestionTitle}
                          </h6>
                          <p>AI has analyzed this ticket and suggests the following response:</p>
                        </div>
                        
                        <div className="suggested-content">
                          {aiSuggestionContent}
                        </div>
                        
                        <div className="ai-suggestion-actions">
                          <button 
                            className="glass-btn glass-btn-sm glass-btn-secondary" 
                            onClick={() => navigator.clipboard.writeText(aiSuggestionContent)} 
                            disabled={isSubmittingComment}
                          >
                            <i className="fas fa-copy"></i>
                            <span>Copy Text</span>
                          </button>
                          <button 
                            className="glass-btn glass-btn-sm glass-btn-primary" 
                            onClick={() => handleApproveAndSendDraft(aiSuggestionContent)} 
                            disabled={isSubmittingComment}
                          >
                            {isSubmittingComment ? (
                              <>
                                <div className="spinner"></div>
                                <span>Sending...</span>
                              </>
                            ) : (
                              <>
                                <i className="fas fa-paper-plane"></i>
                                <span>Approve & Send</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="message-content">
                        {comment.commentText || <span className="empty-state">No content</span>}
                      </div>
                    )}

                    {comment.attachments && comment.attachments.length > 0 && (
                      <AttachmentListDisplay attachments={comment.attachments} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Reply Form */}
          <div className="glass-card reply-form-card">
            <div className="card-header gradient-header">
              <div className="header-icon">
                <i className="fas fa-reply"></i>
              </div>
              <h3>Add Reply</h3>
            </div>
            <form onSubmit={handleCommentSubmit} className="reply-form">
              <div className="form-content">
                <div className="textarea-wrapper">
                  <textarea
                    className="glass-textarea"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Type your response here..."
                    rows={4}
                    disabled={isSubmittingComment}
                  />
                </div>

                {/* File Upload Section */}
                <div className="file-section">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="file-input-hidden"
                    multiple
                    disabled={isSubmittingComment}
                    id="fileInput"
                  />
                  <label htmlFor="fileInput" className="file-input-label">
                    <i className="fas fa-paperclip"></i>
                    <span>Attach Files</span>
                  </label>
                  <span className="file-input-hint">Drop files anywhere or click to browse (max 5 files)</span>
                  
                  {files.length > 0 && (
                    <div className="selected-files">
                      <div className="files-header">
                        <i className="fas fa-paperclip"></i>
                        <span>Attached Files ({files.length})</span>
                      </div>
                      <div className="files-grid">
                        {files.map((file, index) => (
                          <div key={index} className="file-item">
                            <div className="file-icon">
                              <i className={`fas ${getFileIconClass(file.type)}`}></i>
                            </div>
                            <div className="file-info">
                              <span className="file-name">{file.name}</span>
                              <span className="file-size">{formatFileSize(file.size)}</span>
                            </div>
                            <button 
                              type="button" 
                              className="file-remove" 
                              onClick={() => removeFile(index)}
                              disabled={isSubmittingComment}
                            >
                              <i className="fas fa-times"></i>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="form-actions">
                  <div className="form-options">
                    <label className="glass-checkbox">
                      <input
                        type="checkbox"
                        checked={isInternalNote}
                        onChange={e => {
                          const checked = e.target.checked;
                          setIsInternalNote(checked);
                          if (checked) setSendAsEmail(false);
                        }}
                        disabled={isSubmittingComment}
                      />
                      <span className="checkmark"></span>
                      <span className="label-text">
                        <i className="fas fa-lock"></i>
                        Internal Note
                      </span>
                    </label>
                    
                    <label className="glass-checkbox">
                      <input
                        type="checkbox"
                        checked={sendAsEmail}
                        onChange={e => {
                          const checked = e.target.checked;
                          setSendAsEmail(checked);
                          if (checked) setIsInternalNote(false);
                        }}
                        disabled={isInternalNote || !ticket.senderEmail || isSubmittingComment}
                      />
                      <span className="checkmark"></span>
                      <span className="label-text">
                        <i className="fas fa-paper-plane"></i>
                        Send as Email
                      </span>
                    </label>

                    {!ticket.senderEmail && (
                      <span className="email-disabled-hint">
                        <i className="fas fa-info-circle"></i>
                        Email option disabled - no customer email
                      </span>
                    )}
                  </div>
                  
                  <button 
                    type="submit" 
                    className="glass-btn glass-btn-primary glass-btn-large"
                    disabled={(!newComment?.trim() && files.length === 0) || isSubmittingComment}
                  >
                    {isSubmittingComment ? (
                      <>
                        <div className="spinner"></div>
                        <span>Submitting...</span>
                      </>
                    ) : (
                      <>
                        <i className={`fas ${isInternalNote ? 'fa-lock' : sendAsEmail ? 'fa-paper-plane' : 'fa-comment'}`}></i>
                        <span>{isInternalNote ? 'Save Note' : sendAsEmail ? 'Send Email' : 'Add Comment'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>

        {/* Sidebar */}
        <div className="sidebar-content">
          {/* Ticket Details */}
          <div className="glass-card details-card">
            <div className="card-header gradient-header">
              <div className="header-icon">
                <i className="fas fa-info-circle"></i>
              </div>
              <h3>Ticket Details</h3>
            </div>
            <div className="details-grid">
              <div className="detail-item">
                <span className="label">Priority</span>
                <span className={`priority-badge ${priorityConfig.class}`}>
                  {priorityConfig.label}
                </span>
              </div>
              {ticket.type && (
                <div className="detail-item">
                  <span className="label">Type</span>
                  <span className="value">{ticket.type}</span>
                </div>
              )}
              <div className="detail-item">
                <span className="label">Created</span>
                <span className="value">
                  {createdAtDate ? formatDistanceToNow(createdAtDate, { addSuffix: true }) : 'N/A'}
                </span>
              </div>
              <div className="detail-item">
                <span className="label">Updated</span>
                <span className="value">
                  {updatedAtDate ? formatDistanceToNow(updatedAtDate, { addSuffix: true }) : 'N/A'}
                </span>
              </div>
            </div>
          </div>

          {/* Customer Info */}
          <div className="glass-card customer-card">
            <div className="card-header gradient-header">
              <div className="header-icon">
                <i className="fas fa-user-circle"></i>
              </div>
              <h3>Customer Information</h3>
            </div>
            <div className="customer-info">
              <div className="customer-item">
                <i className="fas fa-user"></i>
                <span>{ticket.senderName || ticket.reporter?.name || 'Not Provided'}</span>
              </div>
              {(ticket.senderEmail || ticket.reporter?.email) && (
                <div className="customer-item">
                  <i className="fas fa-envelope"></i>
                  <span>{ticket.senderEmail || ticket.reporter?.email}</span>
                </div>
              )}
              {ticket.senderPhone && (
                <div className="customer-item">
                  <i className="fas fa-phone"></i>
                  <span>{ticket.senderPhone}</span>
                </div>
              )}
              {ticket.orderNumber && (
                <div className="customer-item">
                  <i className="fas fa-shopping-cart"></i>
                  <span>Order #{ticket.orderNumber}</span>
                </div>
              )}
            </div>
          </div>

          {/* Related Quote */}
          {relatedQuote && (
            <div className="glass-card quote-card">
              <div className="card-header gradient-header">
                <div className="header-icon">
                  <i className="fas fa-file-invoice-dollar"></i>
                </div>
                <h3>Related Quote</h3>
                <a 
                  href={quoteAdminUrl || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="glass-btn glass-btn-sm glass-btn-secondary"
                >
                  <i className="fas fa-external-link-alt"></i>
                  <span>View in Shopify</span>
                </a>
              </div>
              <div className="quote-details">
                <div className="detail-row">
                  <span className="label">Quote #</span>
                  <span className="value">{relatedQuote.name}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Status</span>
                  <span className="status-badge status-open">{relatedQuote.status.replace('_', ' ')}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Total</span>
                  <span className="value price">
                    ${parseFloat(relatedQuote.totalPriceSet.shopMoney.amount).toFixed(2)} {relatedQuote.totalPriceSet.shopMoney.currencyCode}
                  </span>
                </div>
              </div>
              <div className="quote-actions">
                <button 
                  className="glass-btn glass-btn-sm glass-btn-secondary"
                  onClick={handleResendShopifyInvoice}
                  disabled={isResendingShopifyInvoice || !relatedQuote?.id}
                >
                  {isResendingShopifyInvoice ? (
                    <div className="spinner"></div>
                  ) : (
                    <><i className="fas fa-file-invoice"></i> Resend Shopify Invoice</>
                  )}
                </button>
                <button 
                  className="glass-btn glass-btn-sm glass-btn-secondary"
                  onClick={handleResendPdfInvoice}
                  disabled={isResendingPdf || !relatedQuote?.legacyResourceId}
                >
                  {isResendingPdf ? (
                    <div className="spinner"></div>
                  ) : (
                    <><i className="fas fa-file-pdf"></i> Resend PDF via Email</>
                  )}
                </button>
              </div>
            </div>
          )}
          
          {/* Live ShipStation Data Section */}
          {ticket.orderNumber && (
            <div className="glass-card shipping-card">
              <div className="card-header gradient-header">
                <div className="header-icon">
                  <i className={`fas ${isLoadingLiveData ? 'fa-spinner fa-spin' : 'fa-satellite-dish'}`}></i>
                </div>
                <h3>
                  Live Shipping Status
                  {liveDataFetchedAt && (
                    <span className="fetch-time">
                      ({format(new Date(liveDataFetchedAt), 'MMM d, h:mm a')})
                    </span>
                  )}
                </h3>
                <button 
                  className="glass-btn glass-btn-sm glass-btn-secondary"
                  onClick={fetchLiveShipStationData}
                  disabled={isLoadingLiveData}
                  title="Refresh live data"
                >
                  <i className={`fas fa-sync-alt ${isLoadingLiveData ? 'fa-spin' : ''}`}></i>
                </button>
              </div>
              <div className="shipping-content">
                {isLoadingLiveData && (
                  <div className="loading-state">
                    <div className="spinner"></div>
                    <span>Fetching latest data...</span>
                  </div>
                )}
                
                {liveDataError && !isLoadingLiveData && (
                  <div className="error-state">
                    <i className="fas fa-exclamation-triangle"></i>
                    <span>{liveDataError}</span>
                  </div>
                )}
                
                {!isLoadingLiveData && !liveDataError && !liveShipStationData && (
                   <div className="empty-state">
                    <i className="fas fa-search-location"></i>
                    <p>No live data found for order <strong>{ticket.orderNumber}</strong>. This is normal for older orders or if the order number is incorrect.</p>
                  </div>
                )}

                {liveShipStationData && (
                  <div className="shipping-details">
                    <div className="detail-row">
                      <span className="label">Status</span>
                      <span className="value">{liveShipStationData.shipmentStatus?.replace(/_/g, ' ') || 'N/A'}</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Carrier</span>
                      <span className="value">{liveShipStationData.carrier || 'N/A'}</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Ship Date</span>
                      <span className="value">
                        {liveShipStationData.shipDate ? format(new Date(liveShipStationData.shipDate), 'MMM d, yyyy') : 'N/A'}
                      </span>
                    </div>
                    {liveShipStationData.trackingNumber && (
                      <div className="detail-row">
                        <span className="label">Tracking #</span>
                        <a href={liveShipStationData.trackingUrl || '#'} target="_blank" rel="noopener noreferrer" className="tracking-link">
                          {liveShipStationData.trackingNumber} <i className="fas fa-external-link-alt"></i>
                        </a>
                      </div>
                    )}
                    {liveShipStationData.lastEvent && (
                      <div className="last-event">
                         <h6>Latest Update:</h6>
                         <p>
                           <strong>{liveShipStationData.lastEvent.event}</strong><br/>
                           <span className="event-details">
                             {liveShipStationData.lastEvent.location} - {format(new Date(liveShipStationData.lastEvent.timestamp), 'MMM d, h:mm a')}
                           </span>
                         </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}