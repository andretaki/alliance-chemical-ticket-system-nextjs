import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import 'isomorphic-fetch';
import { db } from '@/db';
import { ticketComments } from '@/db/schema';
import { headers } from 'next/headers';
import * as graphService from '@/lib/graphService';

// Microsoft Graph Authentication
const getGraphClient = () => {
  // Create an authentication provider
  const credential = new ClientSecretCredential(
    process.env.MICROSOFT_GRAPH_TENANT_ID!,
    process.env.MICROSOFT_GRAPH_CLIENT_ID!,
    process.env.MICROSOFT_GRAPH_CLIENT_SECRET!
  );

  // Create a Graph client
  const graphClient = Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => {
        const response = await credential.getToken(["https://graph.microsoft.com/.default"]);
        return response.token;
      }
    }
  });

  return graphClient;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { draftOrderId, recipientEmail } = body;

    if (!draftOrderId || !recipientEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Extract the numeric ID from the Shopify GID
    const numericId = draftOrderId.split('/').pop();
    if (!numericId) {
      return NextResponse.json({ error: 'Invalid draft order ID format' }, { status: 400 });
    }

    // Get the host from the request headers
    const headersList = await headers();
    const host = headersList.get('host');
    const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    // 1. Get draft order details from Shopify (using existing API)
    const draftOrderResponse = await axios.get(`${baseUrl}/api/draft-orders/${numericId}`);
    const draftOrder = draftOrderResponse.data;

    if (!draftOrder) {
      return NextResponse.json({ error: 'Draft order not found' }, { status: 404 });
    }

    // 2. Generate PDF invoice
    const pdfBuffer = await generatePDF(draftOrder);

    // 3. Send email with PDF attachment using Microsoft Graph
    await sendEmailWithGraph(recipientEmail, draftOrder, pdfBuffer);

    // 4. Update ticket with email sent status if ticketId is provided
    if (draftOrder.ticketId) {
      // Add a comment to the ticket instead of a note
      await db.insert(ticketComments).values({
        ticketId: draftOrder.ticketId,
        commentText: `Invoice email sent to ${recipientEmail} for quote ${draftOrder.name}`,
        isInternalNote: true,
        commenterId: '1', // System user ID or default admin
        isFromCustomer: false,
        isOutgoingReply: false,
      });
    }

    return NextResponse.json({ message: 'Invoice email sent successfully' });
  } catch (error) {
    console.error('Error sending invoice email:', error);
    return NextResponse.json(
      { error: 'Failed to send invoice email' },
      { status: 500 }
    );
  }
}

async function generatePDF(draftOrder: any) {
  // Create a new PDF document
  const pdfDoc = await PDFDocument.create();
  let pdfPage = pdfDoc.addPage([595.28, 841.89]); // A4 size
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Add company logo
  try {
    const logoPath = path.join(process.cwd(), 'public', 'WIDE - Color on Transparent _RGB-01.png');
    const logoImage = fs.readFileSync(logoPath);
    const logoImageBytes = new Uint8Array(logoImage);
    const logoImageEmbed = await pdfDoc.embedPng(logoImageBytes);
    
    // Calculate logo dimensions to maintain aspect ratio but not be too large
    const maxWidth = 200;
    const scale = maxWidth / logoImageEmbed.width;
    const width = logoImageEmbed.width * scale;
    const height = logoImageEmbed.height * scale;
    
    // Draw logo at top of page
    pdfPage.drawImage(logoImageEmbed, {
      x: 50,
      y: pdfPage.getHeight() - 100,
      width,
      height,
    });
  } catch (error) {
    console.error('Error adding logo to PDF:', error);
    // Continue without logo if there's an error
  }

  // Add header text
  const titleText = 'INVOICE / QUOTE';
  const titleWidth = boldFont.widthOfTextAtSize(titleText, 24);
  pdfPage.drawText(titleText, {
    x: pdfPage.getWidth() - titleWidth - 50,
    y: pdfPage.getHeight() - 80,
    size: 24,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.4),
  });

  // Add quote information
  pdfPage.drawText(`Quote #: ${draftOrder.name}`, {
    x: 50,
    y: pdfPage.getHeight() - 150,
    size: 12,
    font: boldFont,
  });

  pdfPage.drawText(`Date: ${new Date().toLocaleDateString()}`, {
    x: 50,
    y: pdfPage.getHeight() - 170,
    size: 12,
    font: font,
  });

  // Add customer information
  if (draftOrder.customer) {
    const customer = draftOrder.customer;
    pdfPage.drawText('Bill To:', {
      x: 50,
      y: pdfPage.getHeight() - 230,
      size: 12,
      font: boldFont,
    });
    
    pdfPage.drawText(`${customer.firstName || ''} ${customer.lastName || ''}`.trim(), {
      x: 50,
      y: pdfPage.getHeight() - 250,
      size: 11,
      font: font,
    });
    
    if (customer.company) {
      pdfPage.drawText(customer.company, {
        x: 50,
        y: pdfPage.getHeight() - 265,
        size: 11,
        font: font,
      });
    }
    
    pdfPage.drawText(customer.email || '', {
      x: 50,
      y: pdfPage.getHeight() - 280,
      size: 11,
      font: font,
    });
  }

  // Shipping information
  if (draftOrder.shippingAddress) {
    const address = draftOrder.shippingAddress;
    pdfPage.drawText('Ship To:', {
      x: 300, 
      y: pdfPage.getHeight() - 230,
      size: 12,
      font: boldFont,
    });
    
    pdfPage.drawText(`${address.firstName || ''} ${address.lastName || ''}`.trim(), {
      x: 300,
      y: pdfPage.getHeight() - 250,
      size: 11,
      font: font,
    });
    
    if (address.company) {
      pdfPage.drawText(address.company, {
        x: 300,
        y: pdfPage.getHeight() - 265,
        size: 11,
        font: font,
      });
    }
    
    pdfPage.drawText(address.address1 || '', {
      x: 300,
      y: pdfPage.getHeight() - 280,
      size: 11,
      font: font,
    });
    
    pdfPage.drawText(`${address.city || ''}, ${address.province || ''} ${address.zip || ''}`, {
      x: 300,
      y: pdfPage.getHeight() - 295,
      size: 11,
      font: font,
    });
    
    pdfPage.drawText(address.country || '', {
      x: 300,
      y: pdfPage.getHeight() - 310,
      size: 11,
      font: font,
    });
  }

  // Draw table header
  const tableY = pdfPage.getHeight() - 360;
  pdfPage.drawRectangle({
    x: 50,
    y: tableY - 20,
    width: pdfPage.getWidth() - 100,
    height: 20,
    color: rgb(0.9, 0.9, 0.9),
    borderColor: rgb(0.5, 0.5, 0.5),
    borderWidth: 1,
  });
  
  pdfPage.drawText('Description', {
    x: 60,
    y: tableY - 15,
    size: 11,
    font: boldFont,
  });
  
  pdfPage.drawText('Quantity', {
    x: 300,
    y: tableY - 15,
    size: 11,
    font: boldFont,
  });
  
  pdfPage.drawText('Unit Price', {
    x: 380,
    y: tableY - 15,
    size: 11,
    font: boldFont,
  });
  
  pdfPage.drawText('Total', {
    x: 480,
    y: tableY - 15,
    size: 11,
    font: boldFont,
  });

  // Draw line items
  let currentY = tableY - 40;
  
  if (draftOrder.lineItems && draftOrder.lineItems.length > 0) {
    for (let i = 0; i < draftOrder.lineItems.length; i++) {
      const item = draftOrder.lineItems[i];
      
      pdfPage.drawText(item.title || 'Product', {
        x: 60,
        y: currentY,
        size: 10,
        font: font,
        maxWidth: 220,
      });
      
      pdfPage.drawText(item.quantity.toString(), {
        x: 300,
        y: currentY,
        size: 10,
        font: font,
      });
      
      pdfPage.drawText(`$${item.price ? parseFloat(item.price).toFixed(2) : '0.00'}`, {
        x: 380,
        y: currentY,
        size: 10,
        font: font,
      });
      
      const lineTotal = (item.quantity || 0) * (parseFloat(item.price) || 0);
      pdfPage.drawText(`$${lineTotal.toFixed(2)}`, {
        x: 480,
        y: currentY,
        size: 10,
        font: font,
      });
      
      currentY -= 20;
      
      // Add a new page if we're running out of space
      if (currentY < 100) {
        pdfPage = pdfDoc.addPage([595.28, 841.89]);
        currentY = pdfPage.getHeight() - 50;
      }
    }
  }

  // Draw totals
  const totalsY = Math.max(currentY - 50, 100);
  pdfPage.drawLine({
    start: { x: 380, y: totalsY + 20 },
    end: { x: 545, y: totalsY + 20 },
    thickness: 1,
    color: rgb(0.5, 0.5, 0.5),
  });
  
  pdfPage.drawText('Subtotal:', {
    x: 380,
    y: totalsY,
    size: 11,
    font: boldFont,
  });
  
  const subtotalAmount = draftOrder.subtotalPrice ? parseFloat(draftOrder.subtotalPrice) : 0;
  pdfPage.drawText(`$${subtotalAmount.toFixed(2)}`, {
    x: 480,
    y: totalsY,
    size: 11,
    font: font,
  });
  
  pdfPage.drawText('Shipping:', {
    x: 380,
    y: totalsY - 20,
    size: 11,
    font: boldFont,
  });
  
  const shippingAmount = draftOrder.totalShippingPrice ? parseFloat(draftOrder.totalShippingPrice) : 0;
  pdfPage.drawText(`$${shippingAmount.toFixed(2)}`, {
    x: 480,
    y: totalsY - 20,
    size: 11,
    font: font,
  });
  
  pdfPage.drawText('Tax:', {
    x: 380,
    y: totalsY - 40,
    size: 11,
    font: boldFont,
  });
  
  const taxAmount = draftOrder.totalTax ? parseFloat(draftOrder.totalTax) : 0;
  pdfPage.drawText(`$${taxAmount.toFixed(2)}`, {
    x: 480,
    y: totalsY - 40,
    size: 11,
    font: font,
  });
  
  pdfPage.drawLine({
    start: { x: 380, y: totalsY - 50 },
    end: { x: 545, y: totalsY - 50 },
    thickness: 1,
    color: rgb(0.5, 0.5, 0.5),
  });
  
  pdfPage.drawText('Total:', {
    x: 380,
    y: totalsY - 70,
    size: 12,
    font: boldFont,
  });
  
  const totalAmount = draftOrder.totalPrice ? parseFloat(draftOrder.totalPrice) : 0;
  pdfPage.drawText(`$${totalAmount.toFixed(2)} ${draftOrder.currencyCode || 'USD'}`, {
    x: 480,
    y: totalsY - 70,
    size: 12,
    font: boldFont,
  });

  // Add footer
  pdfPage.drawText('Thank you for your business!', {
    x: 50,
    y: 50,
    size: 12,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.4),
  });
  
  pdfPage.drawText('This is a quote - Not an invoice. Please contact us to finalize your order.', {
    x: 50,
    y: 30,
    size: 10,
    font: font,
  });

  // Serialize the PDF to bytes
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

async function sendEmailWithGraph(to: string, draftOrder: any, pdfBuffer: Buffer) {
  const subject = `Invoice for Quote ${draftOrder.name}`;
  const messageContent = `
    <p>Dear ${draftOrder.customer?.firstName || 'Customer'},</p>
    <p>Please find attached the invoice for quote ${draftOrder.name}.</p>
    <p>Thank you for your business.</p>
    <p>Best regards,<br/>Alliance Chemical</p>
  `;

  const attachment = {
    name: `Invoice-${draftOrder.name}.pdf`,
    contentType: 'application/pdf',
    contentBytes: pdfBuffer.toString('base64')
  };

  await graphService.sendEmailReply(
    to,
    subject,
    messageContent,
    { conversationId: draftOrder.ticketId?.toString() },
    process.env.SHARED_MAILBOX_ADDRESS || '',
    [attachment]
  );
} 