import type { SimpleQuoteEmailData } from '@/types/quoteInterfaces';
import { sendNotificationEmail } from '@/lib/email';

interface EmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
  headers?: Record<string, string>;
}

export class NotificationService {
  private readonly salesTeamEmail = process.env.SALES_TEAM_EMAIL || 'sales@alliancechemical.com';
  private readonly agentSenderEmail = process.env.AGENT_SENDER_EMAIL || 'quotes@alliancechemical.com';

  constructor() {
    // Email client is handled by the Microsoft Graph integration
  }

  private async sendEmail(params: EmailParams): Promise<void> {
    const { to, subject, text, html } = params;
    
    console.log(`[NotificationService] Sending email via Microsoft Graph to: ${to}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Body Preview: ${text.substring(0, 200)}...`);

    try {
      // Use the Microsoft Graph email infrastructure
      const success = await sendNotificationEmail({
        recipientEmail: to,
        subject,
        htmlBody: html || text.replace(/\n/g, '<br>'),
        senderName: 'Alliance Chemical'
      });

      if (!success) {
        throw new Error('Failed to send email via Microsoft Graph');
      }

      console.log(`[NotificationService] Email sent successfully via Microsoft Graph to: ${to}`);
    } catch (error) {
      console.error(`[NotificationService] Failed to send email via Microsoft Graph to ${to}:`, error);
      throw error;
    }
  }

  /**
   * Sends an email with a simple, AI-generated quote.
   */
  public async sendSimpleQuoteEmail(
    recipientEmail: string,
    quoteData: SimpleQuoteEmailData,
    originalEmailIdToThread?: string // For threading replies
  ): Promise<boolean> {
    const subject = `Your Quote from Alliance Chemical - Ref: ${quoteData.quoteId || originalEmailIdToThread || Date.now()}`;
    let body = `Dear ${quoteData.customer.name || 'Valued Customer'},\n\n`;
    body += `Thank you for your inquiry. Here is the quote you requested:\n\n`;

    quoteData.items.forEach(item => {
      body += `Product: ${item.productName} ${item.sku ? `(SKU: ${item.sku})` : ''}\n`;
      body += `Quantity: ${item.quantity} ${item.unit}\n`;
      body += `Unit Price: ${item.currency} ${item.unitPrice.toFixed(2)}\n`;
      body += `Total Price: ${item.currency} ${item.totalPrice.toFixed(2)}\n`;
      if (item.pageUrl) {
        body += `Product Link: ${item.pageUrl}\n`;
      }
      body += `------------------------------------\n`;
    });

    if (quoteData.items.length > 1 || quoteData.subtotal !== quoteData.grandTotal) { // Only show subtotal if different or multiple items
      body += `Subtotal: ${quoteData.currency} ${quoteData.subtotal.toFixed(2)}\n`;
    }
    if (quoteData.shippingInfo) {
      body += `Shipping: ${quoteData.shippingInfo}\n`;
    }
    body += `Grand Total: ${quoteData.currency} ${quoteData.grandTotal.toFixed(2)}\n\n`;
    body += `${quoteData.validityMessage}\n\n`;
    body += `${quoteData.nextStepsMessage}\n\n`;
    body += `If you have any questions, please reply to this email or contact us at ${this.salesTeamEmail}.\n\n`;
    body += `Sincerely,\nAlliance Chemical Automated Quoting Assistant`;

    console.log(`[NotificationService] Sending Simple Quote Email to: ${recipientEmail}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Body Preview: ${body.substring(0, 200)}...`);

    try {
      // Generate HTML version of the quote
      const htmlBody = this.generateHtmlQuoteEmail(quoteData);
      
      await this.sendEmail({
        to: recipientEmail,
        subject,
        text: body,
        html: htmlBody,
        headers: originalEmailIdToThread ? { 
          'In-Reply-To': `<${originalEmailIdToThread}>`, 
          'References': `<${originalEmailIdToThread}>` 
        } : {}
      });
      
      return true;
    } catch (error) {
      console.error(`[NotificationService] Failed to send simple quote email to ${recipientEmail}:`, error);
      return false;
    }
  }

  /**
   * Sends an acknowledgment email for complex quotes that are ticketed.
   */
  public async sendComplexQuoteAcknowledgement(
    recipientEmail: string,
    ticketId: string,
    originalEmailIdToThread?: string
  ): Promise<boolean> {
    const subject = `We've Received Your Quote Request - Ref: ${ticketId}`;
    const body = `Dear Valued Customer,\n\n` +
                 `Thank you for your quote request. We have received it and a member of our sales team is reviewing your requirements.\n\n` +
                 `Your reference number is: ${ticketId}\n\n` +
                 `We aim to respond within 1-2 business days. If your request is urgent, please contact us directly at ${this.salesTeamEmail} and reference your ticket number.\n\n` +
                 `Sincerely,\nAlliance Chemical Support`;

    try {
      await this.sendEmail({
        to: recipientEmail,
        subject,
        text: body,
        html: body.replace(/\n/g, '<br>'),
        headers: originalEmailIdToThread ? {
          'In-Reply-To': `<${originalEmailIdToThread}>`,
          'References': `<${originalEmailIdToThread}>`
        } : undefined
      });
      return true;
    } catch (error) {
      console.error(`Failed to send complex quote acknowledgement to ${recipientEmail}:`, error);
      return false;
    }
  }

  private async sendCreditApplicationEmail(to: string, customerName?: string): Promise<void> {
    const subject = "Alliance Chemical - Credit Application Form";
    const creditApplicationUrl = process.env.CREDIT_APPLICATION_URL || "https://apply.alliancechemical.com";
    
    const emailContent = `
Dear ${customerName || 'Valued Customer'},

Thank you for your interest in establishing credit terms with Alliance Chemical. To proceed with your credit application, please use the following link:

${creditApplicationUrl}

This secure form will guide you through the application process. Once submitted, our credit department will review your application and contact you with the results.

If you have any questions during the application process, please don't hesitate to contact us.

Best regards,

Alliance Chemical Credit Department
    `;

    try {
      await this.sendEmail({
        to,
        subject,
        text: emailContent,
        html: emailContent.replace(/\n/g, '<br>')
      });
    } catch (error) {
      console.error(`Failed to send credit application email to ${to}:`, error);
      throw error;
    }
  }

  public async handleCreditApplicationRequest(email: string, customerName?: string): Promise<void> {
    await this.sendCreditApplicationEmail(email, customerName);
  }

  /**
   * Generates HTML version of quote email for better formatting
   */
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