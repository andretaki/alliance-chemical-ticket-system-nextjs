import type { SimpleQuoteEmailData } from '@/types/quoteInterfaces';

export class NotificationService {
  private readonly salesTeamEmail = process.env.SALES_TEAM_EMAIL || 'sales@alliancechemical.com';
  private readonly agentSenderEmail = process.env.AGENT_SENDER_EMAIL || 'quotes@alliancechemical.com';

  constructor() {
    // Initialize email client
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

    console.log(`[NotificationService] STUB: Sending Complex Quote Acknowledgement to: ${recipientEmail}`);
    console.log(`  Subject: ${subject}`);
    // Actual email sending logic
    return true;
  }
} 