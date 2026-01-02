import type { SimpleQuoteEmailData } from '@/types/quoteInterfaces';
import { sendNotificationEmail } from '@/lib/email';
import { db, tickets } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { env } from '@/lib/env';

// =============================================================================
// Interfaces
// =============================================================================

interface EmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

interface TicketClosureParams {
  ticketId: number;
  recipientEmail: string;
  recipientName?: string;
  resolutionSummary: string;
  referenceNumber?: string;
  surveyLink?: string;
}

// =============================================================================
// NotificationService - Unified Email Notification Service
// =============================================================================

export class NotificationService {
  private readonly salesTeamEmail = env.SALES_TEAM_EMAIL;

  /**
   * Core email sending method using Microsoft Graph via lib/email
   */
  private async sendEmail(params: EmailParams): Promise<boolean> {
    const { to, subject, text, html } = params;

    console.log(`[NotificationService] Sending email to: ${to}`);
    console.log(`  Subject: ${subject}`);

    try {
      const success = await sendNotificationEmail({
        recipientEmail: to,
        subject,
        htmlBody: html || text.replace(/\n/g, '<br>'),
        senderName: 'Alliance Chemical'
      });

      if (!success) {
        console.error(`[NotificationService] Failed to send email to ${to}`);
        return false;
      }

      console.log(`[NotificationService] Email sent successfully to: ${to}`);
      return true;
    } catch (error) {
      console.error(`[NotificationService] Error sending email to ${to}:`, error);
      return false;
    }
  }

  // ===========================================================================
  // Ticket Notifications
  // ===========================================================================

  /**
   * Sends a notification to the customer that their ticket has been resolved and closed
   */
  public async sendTicketClosureNotification(params: TicketClosureParams): Promise<boolean> {
    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, params.ticketId),
      columns: { title: true }
    });

    if (!ticket) {
      console.error(`[NotificationService] Ticket ${params.ticketId} not found`);
      return false;
    }

    const subject = `Resolved: ${ticket.title} [#${params.ticketId}]`;

    const html = `
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

    return this.sendEmail({
      to: params.recipientEmail,
      subject,
      text: `Hello ${params.recipientName || 'Customer'}, your ticket #${params.ticketId} has been resolved.`,
      html
    });
  }

  /**
   * Sends a follow-up question to the customer based on AI recommendation
   */
  public async sendFollowUpQuestion(
    ticketId: number,
    recipientEmail: string,
    followUpQuestion: string
  ): Promise<boolean> {
    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
      columns: { title: true, senderName: true }
    });

    if (!ticket) {
      console.error(`[NotificationService] Ticket ${ticketId} not found for follow-up`);
      return false;
    }

    const subject = `Re: ${ticket.title} [#${ticketId}]`;

    const html = `
      <p>Hello ${ticket.senderName || 'Customer'},</p>

      <p>We're following up on your recent support request (Ticket #${ticketId}).</p>

      <p>${followUpQuestion}</p>

      <p>Your response will help us better assist you with this matter.</p>

      <p>Best regards,<br>
      Alliance Chemical Support Team</p>
    `;

    return this.sendEmail({
      to: recipientEmail,
      subject,
      text: `Hello, we're following up on ticket #${ticketId}. ${followUpQuestion}`,
      html
    });
  }

  // ===========================================================================
  // Quote Notifications
  // ===========================================================================

  /**
   * Sends an email with a simple, AI-generated quote.
   */
  public async sendSimpleQuoteEmail(
    recipientEmail: string,
    quoteData: SimpleQuoteEmailData,
    _originalEmailIdToThread?: string
  ): Promise<boolean> {
    const subject = `Your Quote from Alliance Chemical - Ref: ${quoteData.quoteId || Date.now()}`;

    let textBody = `Dear ${quoteData.customer.name || 'Valued Customer'},\n\n`;
    textBody += `Thank you for your inquiry. Here is the quote you requested:\n\n`;

    quoteData.items.forEach(item => {
      textBody += `Product: ${item.productName} ${item.sku ? `(SKU: ${item.sku})` : ''}\n`;
      textBody += `Quantity: ${item.quantity} ${item.unit}\n`;
      textBody += `Unit Price: ${item.currency} ${item.unitPrice.toFixed(2)}\n`;
      textBody += `Total Price: ${item.currency} ${item.totalPrice.toFixed(2)}\n`;
      if (item.pageUrl) {
        textBody += `Product Link: ${item.pageUrl}\n`;
      }
      textBody += `------------------------------------\n`;
    });

    if (quoteData.items.length > 1 || quoteData.subtotal !== quoteData.grandTotal) {
      textBody += `Subtotal: ${quoteData.currency} ${quoteData.subtotal.toFixed(2)}\n`;
    }
    if (quoteData.shippingInfo) {
      textBody += `Shipping: ${quoteData.shippingInfo}\n`;
    }
    textBody += `Grand Total: ${quoteData.currency} ${quoteData.grandTotal.toFixed(2)}\n\n`;
    textBody += `${quoteData.validityMessage}\n\n`;
    textBody += `${quoteData.nextStepsMessage}\n\n`;
    textBody += `If you have any questions, please reply to this email or contact us at ${this.salesTeamEmail}.\n\n`;
    textBody += `Sincerely,\nAlliance Chemical Automated Quoting Assistant`;

    console.log(`[NotificationService] Sending Quote Email to: ${recipientEmail}`);

    return this.sendEmail({
      to: recipientEmail,
      subject,
      text: textBody,
      html: this.generateHtmlQuoteEmail(quoteData)
    });
  }

  /**
   * Sends an acknowledgment email for complex quotes that are ticketed.
   */
  public async sendComplexQuoteAcknowledgement(
    recipientEmail: string,
    ticketId: string,
    _originalEmailIdToThread?: string
  ): Promise<boolean> {
    const subject = `We've Received Your Quote Request - Ref: ${ticketId}`;
    const body = `Dear Valued Customer,\n\n` +
                 `Thank you for your quote request. We have received it and a member of our sales team is reviewing your requirements.\n\n` +
                 `Your reference number is: ${ticketId}\n\n` +
                 `We aim to respond within 1-2 business days. If your request is urgent, please contact us directly at ${this.salesTeamEmail} and reference your ticket number.\n\n` +
                 `Sincerely,\nAlliance Chemical Support`;

    return this.sendEmail({
      to: recipientEmail,
      subject,
      text: body,
      html: body.replace(/\n/g, '<br>')
    });
  }

  // ===========================================================================
  // Credit Application
  // ===========================================================================

  /**
   * Sends credit application form link to customer
   */
  public async handleCreditApplicationRequest(email: string, customerName?: string): Promise<void> {
    const subject = "Alliance Chemical - Credit Application Form";
    const creditApplicationUrl = env.CREDIT_APPLICATION_URL || "https://apply.alliancechemical.com";

    const textContent = `
Dear ${customerName || 'Valued Customer'},

Thank you for your interest in establishing credit terms with Alliance Chemical. To proceed with your credit application, please use the following link:

${creditApplicationUrl}

This secure form will guide you through the application process. Once submitted, our credit department will review your application and contact you with the results.

If you have any questions during the application process, please don't hesitate to contact us.

Best regards,

Alliance Chemical Credit Department
    `.trim();

    const success = await this.sendEmail({
      to: email,
      subject,
      text: textContent,
      html: textContent.replace(/\n/g, '<br>')
    });

    if (!success) {
      throw new Error(`Failed to send credit application email to ${email}`);
    }
  }

  // ===========================================================================
  // HTML Template Helpers
  // ===========================================================================

  private generateHtmlQuoteEmail(quoteData: SimpleQuoteEmailData): string {
    const items = quoteData.items.map(item => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">
          <strong>${item.productName}</strong>
          ${item.sku ? `<br><small>SKU: ${item.sku}</small>` : ''}
          ${item.pageUrl ? `<br><a href="${item.pageUrl}" style="color: #0066cc;">View Product</a>` : ''}
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">
          ${item.quantity} ${item.unit}
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">
          ${item.currency} ${item.unitPrice.toFixed(2)}
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">
          <strong>${item.currency} ${item.totalPrice.toFixed(2)}</strong>
        </td>
      </tr>
    `).join('');

    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="color: #333; margin-top: 0;">Your Quote from Alliance Chemical</h2>
          <p style="color: #666; margin-bottom: 0;">
            Reference: ${quoteData.quoteId || Date.now()}
          </p>
        </div>

        <p>Dear ${quoteData.customer.name || 'Valued Customer'},</p>
        <p>Thank you for your inquiry. Here is the quote you requested:</p>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background-color: #f8f9fa;">
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6;">Product</th>
              <th style="padding: 12px; text-align: center; border-bottom: 2px solid #dee2e6;">Quantity</th>
              <th style="padding: 12px; text-align: right; border-bottom: 2px solid #dee2e6;">Unit Price</th>
              <th style="padding: 12px; text-align: right; border-bottom: 2px solid #dee2e6;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${items}
          </tbody>
        </table>

        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          ${quoteData.items.length > 1 || quoteData.subtotal !== quoteData.grandTotal ?
            `<div style="margin-bottom: 10px;">Subtotal: <strong>${quoteData.currency} ${quoteData.subtotal.toFixed(2)}</strong></div>` : ''}
          ${quoteData.shippingInfo ?
            `<div style="margin-bottom: 10px;">Shipping: <strong>${quoteData.shippingInfo}</strong></div>` : ''}
          <div style="font-size: 18px; color: #0066cc;">
            <strong>Grand Total: ${quoteData.currency} ${quoteData.grandTotal.toFixed(2)}</strong>
          </div>
        </div>

        <div style="background-color: #e7f3ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0;"><strong>Quote Validity:</strong></p>
          <p style="margin: 0 0 15px 0;">${quoteData.validityMessage}</p>
          <p style="margin: 0;"><strong>Next Steps:</strong></p>
          <p style="margin: 0;">${quoteData.nextStepsMessage}</p>
        </div>

        <p>If you have any questions, please reply to this email or contact us at
          <a href="mailto:${this.salesTeamEmail}" style="color: #0066cc;">${this.salesTeamEmail}</a>
        </p>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="margin: 0;">Sincerely,</p>
          <p style="margin: 0; font-weight: bold;">Alliance Chemical Automated Quoting Assistant</p>
        </div>
      </div>
    `;
  }
}

// =============================================================================
// Singleton Instance & Standalone Functions (for backwards compatibility)
// =============================================================================

const notificationServiceInstance = new NotificationService();

/**
 * Sends a notification to the customer that their ticket has been resolved and closed.
 * @deprecated Use NotificationService class directly
 */
export async function sendTicketClosureNotification(params: TicketClosureParams): Promise<boolean> {
  return notificationServiceInstance.sendTicketClosureNotification(params);
}

/**
 * Sends a follow-up question to the customer based on AI recommendation.
 * @deprecated Use NotificationService class directly
 */
export async function sendFollowUpQuestion(
  ticketId: number,
  recipientEmail: string,
  followUpQuestion: string
): Promise<boolean> {
  return notificationServiceInstance.sendFollowUpQuestion(ticketId, recipientEmail, followUpQuestion);
}
