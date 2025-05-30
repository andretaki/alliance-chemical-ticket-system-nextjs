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

  // Determine quote type from tags or custom attributes
  const quoteType = draftOrder.customAttributes?.find((attr: any) => attr.key === 'quoteType')?.value || 
                   (draftOrder.tags?.some((tag: any) => tag.includes('MaterialOnly')) ? 'material_only' : 'full_service');
  
  // Add header text with quote type
  let titleText = 'QUOTE';
  if (quoteType === 'material_only') {
    titleText = 'MATERIAL QUOTE';
  } else if (quoteType === 'consultation') {
    titleText = 'CONSULTATION QUOTE';
  } else {
    titleText = 'FULL SERVICE QUOTE';
  }
  
  const titleWidth = boldFont.widthOfTextAtSize(titleText, 22);
  pdfPage.drawText(titleText, {
    x: pdfPage.getWidth() - titleWidth - 50,
    y: pdfPage.getHeight() - 70,
    size: 22,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.4),
  });

  // Add quote type indicator
  if (quoteType === 'material_only') {
    pdfPage.drawText('Materials Only - Shipping/Installation Not Included', {
      x: pdfPage.getWidth() - titleWidth - 50,
      y: pdfPage.getHeight() - 90,
      size: 10,
      font: font,
      color: rgb(0.8, 0.2, 0.2),
    });
  }

  // Add quote information
  pdfPage.drawText(`Quote #: ${draftOrder.name}`, {
    x: 50,
    y: pdfPage.getHeight() - 140,
    size: 12,
    font: boldFont,
  });

  pdfPage.drawText(`Date: ${new Date().toLocaleDateString()}`, {
    x: 50,
    y: pdfPage.getHeight() - 160,
    size: 12,
    font: font,
  });

  // Valid until date (30 days from now)
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 30);
  pdfPage.drawText(`Valid Until: ${validUntil.toLocaleDateString()}`, {
    x: 50,
    y: pdfPage.getHeight() - 180,
    size: 12,
    font: font,
  });

  // Customer and address information section
  let customerSectionY = pdfPage.getHeight() - 240;
  
  // Bill To section
  if (draftOrder.customer) {
    const customer = draftOrder.customer;
    pdfPage.drawText('Bill To:', {
      x: 50,
      y: customerSectionY,
      size: 12,
      font: boldFont,
    });
    
    pdfPage.drawText(`${customer.firstName || ''} ${customer.lastName || ''}`.trim(), {
      x: 50,
      y: customerSectionY - 20,
      size: 11,
      font: font,
    });
    
    if (customer.company) {
      pdfPage.drawText(customer.company, {
        x: 50,
        y: customerSectionY - 35,
        size: 11,
        font: font,
      });
    }
    
    pdfPage.drawText(customer.email || '', {
      x: 50,
      y: customerSectionY - 50,
      size: 11,
      font: font,
    });

    // Add billing address if different from shipping
    if (draftOrder.billingAddress) {
      const billing = draftOrder.billingAddress;
      pdfPage.drawText(billing.address1 || '', {
        x: 50,
        y: customerSectionY - 65,
        size: 10,
        font: font,
      });
      
      pdfPage.drawText(`${billing.city || ''}, ${billing.province || ''} ${billing.zip || ''}`, {
        x: 50,
        y: customerSectionY - 80,
        size: 10,
        font: font,
      });
      
      pdfPage.drawText(billing.country || '', {
        x: 50,
        y: customerSectionY - 95,
        size: 10,
        font: font,
      });
    }
  }

  // Ship To section (only if not material-only or if different from billing)
  if (draftOrder.shippingAddress && quoteType !== 'material_only') {
    const address = draftOrder.shippingAddress;
    pdfPage.drawText('Ship To:', {
      x: 300, 
      y: customerSectionY,
      size: 12,
      font: boldFont,
    });
    
    pdfPage.drawText(`${address.firstName || ''} ${address.lastName || ''}`.trim(), {
      x: 300,
      y: customerSectionY - 20,
      size: 11,
      font: font,
    });
    
    if (address.company) {
      pdfPage.drawText(address.company, {
        x: 300,
        y: customerSectionY - 35,
        size: 11,
        font: font,
      });
    }
    
    pdfPage.drawText(address.address1 || '', {
      x: 300,
      y: customerSectionY - 50,
      size: 11,
      font: font,
    });
    
    pdfPage.drawText(`${address.city || ''}, ${address.province || ''} ${address.zip || ''}`, {
      x: 300,
      y: customerSectionY - 65,
      size: 11,
      font: font,
    });
    
    pdfPage.drawText(address.country || '', {
      x: 300,
      y: customerSectionY - 80,
      size: 11,
      font: font,
    });
  } else if (quoteType === 'material_only') {
    // For material-only quotes, show delivery terms instead
    pdfPage.drawText('Delivery Terms:', {
      x: 300, 
      y: customerSectionY,
      size: 12,
      font: boldFont,
    });
    
    const deliveryTerms = draftOrder.customAttributes?.find((attr: any) => attr.key === 'deliveryTerms')?.value || 'Customer arranges pickup';
    pdfPage.drawText(deliveryTerms, {
      x: 300,
      y: customerSectionY - 20,
      size: 11,
      font: font,
      maxWidth: 245,
    });
  }

  // Draw table header
  const tableY = customerSectionY - 140;
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
      if (currentY < 150) {
        pdfPage = pdfDoc.addPage([595.28, 841.89]);
        currentY = pdfPage.getHeight() - 50;
      }
    }
  }

  // Draw totals
  const totalsY = Math.max(currentY - 50, 150);
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
  
  // Only show shipping if not material-only
  if (quoteType !== 'material_only') {
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
  }
  
  pdfPage.drawText('Tax:', {
    x: 380,
    y: quoteType === 'material_only' ? totalsY - 20 : totalsY - 40,
    size: 11,
    font: boldFont,
  });
  
  const taxAmount = draftOrder.totalTax ? parseFloat(draftOrder.totalTax) : 0;
  pdfPage.drawText(`$${taxAmount.toFixed(2)}`, {
    x: 480,
    y: quoteType === 'material_only' ? totalsY - 20 : totalsY - 40,
    size: 11,
    font: font,
  });
  
  const totalLineY = quoteType === 'material_only' ? totalsY - 30 : totalsY - 50;
  pdfPage.drawLine({
    start: { x: 380, y: totalLineY },
    end: { x: 545, y: totalLineY },
    thickness: 1,
    color: rgb(0.5, 0.5, 0.5),
  });
  
  pdfPage.drawText('Total:', {
    x: 380,
    y: totalLineY - 20,
    size: 12,
    font: boldFont,
  });
  
  const totalAmount = draftOrder.totalPrice ? parseFloat(draftOrder.totalPrice) : 0;
  pdfPage.drawText(`$${totalAmount.toFixed(2)} ${draftOrder.currencyCode || 'USD'}`, {
    x: 480,
    y: totalLineY - 20,
    size: 12,
    font: boldFont,
  });

  // Add quote-type specific disclaimers
  let disclaimerY = totalLineY - 60;
  
  if (quoteType === 'material_only') {
    pdfPage.drawText('MATERIAL ONLY QUOTE DISCLAIMER:', {
      x: 50,
      y: disclaimerY,
      size: 11,
      font: boldFont,
      color: rgb(0.8, 0.2, 0.2),
    });
    
    const disclaimer = draftOrder.customAttributes?.find((attr: any) => attr.key === 'materialOnlyDisclaimer')?.value || 
      'This quote includes materials only. Shipping, installation, and setup services are not included. Customer is responsible for arranging transportation and installation.';
    
    // Split disclaimer into lines to fit
    const disclaimerLines = [];
    const maxWidth = 495;
    let currentLine = '';
    const words = disclaimer.split(' ');
    
    for (const word of words) {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const testWidth = font.widthOfTextAtSize(testLine, 10);
      if (testWidth <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) disclaimerLines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) disclaimerLines.push(currentLine);
    
    disclaimerLines.forEach((line, index) => {
      pdfPage.drawText(line, {
        x: 50,
        y: disclaimerY - 20 - (index * 15),
        size: 10,
        font: font,
      });
    });
    
    disclaimerY -= 20 + (disclaimerLines.length * 15);
  }

  // Add footer
  pdfPage.drawText('Thank you for your business!', {
    x: 50,
    y: Math.max(disclaimerY - 20, 70),
    size: 12,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.4),
  });
  
  pdfPage.drawText('This is a quote - Not an invoice. Please contact us to finalize your order.', {
    x: 50,
    y: Math.max(disclaimerY - 40, 50),
    size: 10,
    font: font,
  });

  // Serialize the PDF to bytes
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

async function sendEmailWithGraph(to: string, draftOrder: any, pdfBuffer: Buffer) {
  // Determine quote type
  const quoteType = draftOrder.customAttributes?.find((attr: any) => attr.key === 'quoteType')?.value || 
                   (draftOrder.tags?.some((tag: any) => tag.includes('MaterialOnly')) ? 'material_only' : 'full_service');
  
  // Customize subject and content based on quote type
  let subject = `Quote ${draftOrder.name} from Alliance Chemical`;
  let messageContent = '';
  
  if (quoteType === 'material_only') {
    subject = `Material Quote ${draftOrder.name} from Alliance Chemical`;
    messageContent = `
      <p>Dear ${draftOrder.customer?.firstName || 'Customer'},</p>
      <p>Thank you for your inquiry. Please find attached your <strong>material-only quote</strong> ${draftOrder.name}.</p>
      
      <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; margin: 10px 0; border-radius: 5px;">
        <strong>⚠️ Important Notice:</strong> This is a <strong>material-only quote</strong>. 
        Shipping, installation, and setup services are <strong>not included</strong>. 
        You will be responsible for arranging transportation and installation.
      </div>
      
      <p><strong>What's included:</strong></p>
      <ul>
        <li>All materials and products listed in the quote</li>
        <li>Product specifications and technical data</li>
        <li>Manufacturer warranties (where applicable)</li>
      </ul>
      
      <p><strong>What's NOT included:</strong></p>
      <ul>
        <li>Shipping or delivery services</li>
        <li>Installation or setup</li>
        <li>Training or support services</li>
      </ul>
      
      <p>The materials will be ready for pickup or you may arrange your own shipping. Please contact us to coordinate pickup or discuss delivery options.</p>
      
      <p>This quote is valid for 30 days from the date issued. If you have any questions or would like to proceed with this order, please reply to this email or contact us directly.</p>
      
      <p>Thank you for choosing Alliance Chemical!</p>
      <p>Best regards,<br/>Alliance Chemical Sales Team</p>
    `;
  } else if (quoteType === 'consultation') {
    subject = `Consultation Quote ${draftOrder.name} from Alliance Chemical`;
    messageContent = `
      <p>Dear ${draftOrder.customer?.firstName || 'Customer'},</p>
      <p>Thank you for your interest in our consultation services. Please find attached your consultation quote ${draftOrder.name}.</p>
      
      <p><strong>Consultation Services Include:</strong></p>
      <ul>
        <li>On-site assessment and evaluation</li>
        <li>Technical recommendations</li>
        <li>Written report with findings</li>
        <li>Follow-up support</li>
      </ul>
      
      <p>Our experienced team will work with you to understand your specific needs and provide tailored recommendations.</p>
      
      <p>This quote is valid for 30 days from the date issued. To schedule your consultation or if you have any questions, please reply to this email.</p>
      
      <p>Thank you for choosing Alliance Chemical!</p>
      <p>Best regards,<br/>Alliance Chemical Consultation Team</p>
    `;
  } else {
    // Full service quote
    subject = `Complete Service Quote ${draftOrder.name} from Alliance Chemical`;
    messageContent = `
      <p>Dear ${draftOrder.customer?.firstName || 'Customer'},</p>
      <p>Thank you for your inquiry. Please find attached your complete service quote ${draftOrder.name}.</p>
      
      <p><strong>This comprehensive quote includes:</strong></p>
      <ul>
        <li>All materials and products</li>
        <li>Delivery to your specified address</li>
        <li>Professional installation and setup</li>
        <li>Testing and commissioning</li>
        <li>Training and documentation</li>
        <li>Warranty and ongoing support</li>
      </ul>
      
      <p>Our experienced team will handle everything from delivery to final commissioning, ensuring your system is ready for operation.</p>
      
      <p>This quote is valid for 30 days from the date issued. If you have any questions or would like to proceed with this project, please reply to this email.</p>
      
      <p>Thank you for choosing Alliance Chemical!</p>
      <p>Best regards,<br/>Alliance Chemical Project Team</p>
    `;
  }

  const attachment = {
    name: `Quote-${draftOrder.name}.pdf`,
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