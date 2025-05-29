import type { SimpleQuoteEmailData } from '@/types/quoteInterfaces';

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
    // Initialize email client
  }

  private async sendEmail(params: EmailParams): Promise<void> {
    const { to, subject, text, html, from = this.agentSenderEmail, headers } = params;
    
    console.log(`[NotificationService] Sending email to: ${to}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  From: ${from}`);
    console.log(`  Body Preview: ${text.substring(0, 200)}...`);

    // TODO: Implement actual email sending logic here
    // For now, we'll just log it
    // Example implementation:
    // await this.emailClient.send({
    //   to,
    //   from,
    //   subject,
    //   text,
    //   html,
    //   headers
    // });
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

    console.log(`[NotificationService] STUB: Sending Simple Quote Email to: ${recipientEmail}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Body Preview: ${body.substring(0, 200)}...`);

    // Actual email sending logic here:
    // await this.emailClient.send({
    //   to: recipientEmail,
    //   from: this.agentSenderEmail,
    //   subject,
    //   text: body,
    //   // html: this.generateHtmlQuoteEmail(quoteData) // Optional HTML version
    //   // headers: originalEmailIdToThread ? { 'In-Reply-To': `<${originalEmailIdToThread}>`, 'References': `<${originalEmailIdToThread}>` } : {}
    // });
    return true;
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
} 