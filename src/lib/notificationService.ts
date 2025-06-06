import * as graphService from '@/lib/graphService';
import { db, tickets } from '@/lib/db';
import { eq } from 'drizzle-orm';

interface ClosureNotificationParams {
  ticketId: number;
  recipientEmail: string;
  recipientName?: string;
  resolutionSummary: string;
  referenceNumber?: string;
  surveyLink?: string;
}

/**
 * Sends a notification to the customer that their ticket has been resolved and closed
 */
export async function sendTicketClosureNotification(params: ClosureNotificationParams): Promise<boolean> {
  try {
    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, params.ticketId),
      columns: {
        title: true,
        externalMessageId: true,
        conversationId: true
      }
    });
    
    if (!ticket) {
      console.error(`NotificationService: Ticket ${params.ticketId} not found`);
      return false;
    }
    
    const subject = `Resolved: ${ticket.title} [#${params.ticketId}]`;
    
    const body = `
      <p>Hello ${params.recipientName || 'Customer'},</p>
      
      <p>We're pleased to inform you that your support request has been successfully resolved:</p>
      
      <p><strong>Ticket:</strong> #${params.ticketId} - ${ticket.title}<br>
      ${params.referenceNumber ? `<strong>Reference:</strong> ${params.referenceNumber}<br>` : ''}
      <strong>Resolution:</strong> ${params.resolutionSummary}</p>
      
      <p>This ticket has been automatically closed as we believe your issue has been resolved. If you need further assistance or if your issue has not been fully resolved, please reply to this email and we'll reopen your ticket.</p>
      
      ${params.surveyLink ? `
      <p>We value your feedback! Please take a moment to rate your experience:<br>
      <a href="${params.surveyLink}">Rate your experience</a></p>
      ` : ''}
      
      <p>Thank you for choosing Alliance Chemical.</p>
      
      <p>Best regards,<br>
      Alliance Chemical Support Team</p>
    `;
    
    // Use existing message ids for threading if available
    const dummyMessage = {
      id: `notification-${Date.now()}`,
      internetMessageId: ticket.externalMessageId || `notification-${Date.now()}@alliance-chemical.com`,
      conversationId: ticket.conversationId
    };
    
    const result = await graphService.sendEmailReply(
      params.recipientEmail,
      subject,
      body,
      dummyMessage
    );
    
    return !!result;
  } catch (error) {
    console.error('NotificationService: Error sending closure notification:', error);
    return false;
  }
}

/**
 * Sends a follow-up question to the customer based on AI recommendation
 */
export async function sendFollowUpQuestion(
  ticketId: number,
  recipientEmail: string,
  followUpQuestion: string
): Promise<boolean> {
  try {
    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
      columns: {
        title: true,
        externalMessageId: true,
        conversationId: true,
        senderName: true
      }
    });
    
    if (!ticket) {
      console.error(`NotificationService: Ticket ${ticketId} not found for follow-up`);
      return false;
    }
    
    const subject = `Re: ${ticket.title} [#${ticketId}]`;
    
    const body = `
      <p>Hello ${ticket.senderName || 'Customer'},</p>
      
      <p>We're following up on your recent support request (Ticket #${ticketId}).</p>
      
      <p>${followUpQuestion}</p>
      
      <p>Your response will help us better assist you with this matter.</p>
      
      <p>Best regards,<br>
      Alliance Chemical Support Team</p>
    `;
    
    // Use existing message ids for threading
    const dummyMessage = {
      id: `followup-${Date.now()}`,
      internetMessageId: ticket.externalMessageId || `followup-${Date.now()}@alliance-chemical.com`,
      conversationId: ticket.conversationId
    };
    
    const result = await graphService.sendEmailReply(
      recipientEmail,
      subject,
      body,
      dummyMessage
    );
    
    return !!result;
  } catch (error) {
    console.error('NotificationService: Error sending follow-up question:', error);
    return false;
  }
} 