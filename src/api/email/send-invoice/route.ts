import { NextResponse } from 'next/server';
import { ShopifyService } from '@/services/shopify/ShopifyService';
import { sendEmail } from '@/lib/graphService';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { db } from '@/lib/db';
import { ticketComments } from '@/db/schema';
import { getServerSession } from '@/lib/auth-helpers';

class PDFGenerator {
  static async generateInvoice(draftOrder: any): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // This is a simplified placeholder. A real implementation would be more detailed.
    page.drawText(`Invoice: ${draftOrder.name}`, { x: 50, y: height - 50, font: boldFont, size: 24 });
    page.drawText(`Customer: ${draftOrder.customer.displayName}`, { x: 50, y: height - 100, font, size: 12 });
    page.drawText(`Email: ${draftOrder.customer.email}`, { x: 50, y: height - 120, font, size: 12 });
    page.drawText(`Total: ${draftOrder.totalPriceSet.shopMoney.amount} ${draftOrder.totalPriceSet.shopMoney.currencyCode}`, { x: 50, y: height - 150, font: boldFont, size: 14 });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }
}

export async function POST(request: Request) {
  try {
    const { session, error } = await getServerSession();
        if (error) {
      return NextResponse.json({ error }, { status: 401 });
    }
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized: You must be logged in to send an invoice.' }, { status: 401 });
    }

    const body = await request.json();
    const { draftOrderId, recipientEmail, ticketId } = body;

    if (!draftOrderId || !recipientEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const shopifyService = new ShopifyService();
    const draftOrder = await shopifyService.getDraftOrderById(draftOrderId);

    if (!draftOrder) {
      return NextResponse.json({ error: 'Draft order not found' }, { status: 404 });
    }

    const pdfBuffer = await PDFGenerator.generateInvoice(draftOrder);

    const messageContent = `<p>Hello,</p><p>Please find your invoice for order ${draftOrder.name} attached.</p><p>Thank you for your business!</p>`;
    const subject = `Invoice for Order ${draftOrder.name}`;
    const attachments = [
      {
        name: `Invoice-${draftOrder.name}.pdf`,
        contentType: 'application/pdf',
        contentBytes: pdfBuffer.toString('base64'),
      },
    ];
    
    await sendEmail(recipientEmail, subject, messageContent, undefined, attachments, session.user.id);

    if (ticketId) {
      await db.insert(ticketComments).values({
        ticketId: ticketId,
        commentText: `Invoice email sent to ${recipientEmail} for quote ${draftOrder.name}`,
        isInternalNote: true,
        commenterId: session.user.id,
        isFromCustomer: false,
        isOutgoingReply: false,
      });
    }

    return NextResponse.json({ message: 'Invoice email sent successfully' });
  } catch (error: any) {
    console.error('[Send Invoice API] Error:', error);
    return NextResponse.json({ error: 'Failed to send invoice', details: error.message }, { status: 500 });
  }
} 