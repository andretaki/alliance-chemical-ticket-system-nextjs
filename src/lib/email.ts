import * as graphService from '@/lib/graphService';
import { Message } from '@microsoft/microsoft-graph-types';
import { ticketAttachments } from '@/db/schema';
import { InferSelectModel } from 'drizzle-orm';
import fs from 'fs/promises'; // Import fs.promises for async file reading
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';

// Define the type based on the schema
type TicketAttachment = InferSelectModel<typeof ticketAttachments>;

interface TicketReplyEmailOptions {
  ticketId: number;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  message: string; // This should contain the HTML formatted message
  senderName: string;
  attachments?: TicketAttachment[];
  inReplyToId?: string;    // internetMessageId of the message being replied to
  referencesIds?: string[]; // List of internetMessageIds for the References header
  conversationId?: string; // Conversation ID from the thread
}

/**
 * Sends a reply email for a ticket, attempting to thread it correctly.
 * @param options The email options including threading info
 * @returns The sent message object or null if sending fails
 */
export async function sendTicketReplyEmail(options: TicketReplyEmailOptions): Promise<Message | null> {
  try {
    const {
      ticketId,
      recipientEmail, 
      recipientName, 
      subject, 
      message,
      senderName,
      attachments = [],
      inReplyToId,
      referencesIds,
      conversationId
    } = options;

    // Get the current user's session
    const session = await getServerSession(authOptions);
    const userEmail = session?.user?.email || 'sales@alliancechemical.com';

    // Create message object for threading
    const originalMessage: Message = {
      id: inReplyToId ? `msg-${inReplyToId}` : `ticket-${ticketId}-${Date.now()}`,
      internetMessageId: inReplyToId || `ticket-${ticketId}-${Date.now()}@ticket-system.local`,
      conversationId: conversationId || `ticket-${ticketId}`
    };

    // If we have references, add them as internetMessageHeaders
    if (referencesIds && referencesIds.length > 0) {
      originalMessage.internetMessageHeaders = [{
        name: 'References',
        value: referencesIds.join(' ')
      }];
    }

    // Add attachments if provided
    let processedAttachments: { name: string; contentType: string; contentBytes: string; }[] = [];
    if (attachments && attachments.length > 0) {      
      processedAttachments = await Promise.all(attachments.map(async (att) => {
        let contentBytes = '';
        if (att.storagePath) {
          const fileBuffer = await fs.readFile(att.storagePath);
          contentBytes = fileBuffer.toString('base64');
        }
        return {
          name: att.originalFilename,
          contentType: att.mimeType,
          contentBytes: contentBytes
        };
      }));
    }

    // Send the email using graphService with the user's email
    return await graphService.sendEmailReply(
      recipientEmail,
      subject,
      message, // Pass the raw AI message content for processing
      originalMessage,
      userEmail, // Pass the user's email as the sender
      processedAttachments, // Pass the processed attachments
      session?.user?.id // Pass the user ID for signature retrieval
    );
  } catch (error) {
    console.error('Email Service: Error sending ticket reply email:', error);
    throw error; // Let the caller handle the error
  }
} 

/**
 * Options for sending a notification email (not a reply, no threading).
 */
interface NotificationEmailOptions {
  recipientEmail: string;
  recipientName?: string; // Optional recipient name
  subject: string;
  htmlBody: string; // Expect pre-formatted HTML
  senderName?: string; // Optional sender name display
}

/**
 * Sends a generic notification email (NOT a reply, no threading).
 * @param options The email options.
 * @returns True if sending was initiated successfully, false otherwise.
 */
export async function sendNotificationEmail(options: NotificationEmailOptions): Promise<boolean> {
  try {
    const {
      recipientEmail,
      recipientName = 'User', // Default name if not provided
      subject,
      htmlBody,
      senderName = 'Ticket System' // Default sender name
    } = options;

    // Get the current user's session
    const session = await getServerSession(authOptions);
    const userEmail = session?.user?.email || 'sales@alliancechemical.com';

    // Prepare the email content with a simple wrapper
    const formattedHtml = `
      <div style="font-family: sans-serif; font-size: 14px;">
        ${htmlBody}
        <p>Regards,<br>${senderName}</p>
      </div>
    `;

    // Use the existing sendEmailReply function, but without threading information
    const result = await graphService.sendEmailReply(
      recipientEmail,
      subject,
      formattedHtml,
      {}, // Empty object for no threading info
      userEmail, // Pass the user's email as the sender
      [], // Pass an empty array for no attachments
      session?.user?.id // Pass the user ID for signature retrieval
    );

    console.log(`NotificationService: Notification email sent successfully to ${recipientEmail}.`);
    return result !== null;

  } catch (error) {
    console.error('NotificationService: Error sending notification email:', error);
    return false; // Indicate failure
  }
} 