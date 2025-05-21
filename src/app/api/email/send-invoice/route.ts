import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import 'isomorphic-fetch';
import { db } from '@/lib/db';
import { ticketComments } from '@/db/schema';

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { draftOrderId, customerEmail, ticketId } = body;

    if (!draftOrderId || !customerEmail) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // 1. Get draft order details from Shopify (using existing API)
    const draftOrderResponse = await axios.get(`/api/draft-orders/${draftOrderId}`);
    const draftOrder = draftOrderResponse.data;

    if (!draftOrder) {
      return NextResponse.json({ error: 'Draft order not found' }, { status: 404 });
    }

    // 2. Generate PDF invoice
    const pdfBuffer = await generatePDF(draftOrder, ticketId);

    // 3. Send email with PDF attachment using Microsoft Graph
    await sendEmailWithGraph(customerEmail, draftOrder, pdfBuffer);

    // 4. Update ticket with email sent status if ticketId is provided
    if (ticketId) {
      // Add a comment to the ticket instead of a note
      await db.insert(ticketComments).values({
        ticketId: ticketId,
        commentText: `Invoice email sent to ${customerEmail} for quote ${draftOrder.name}`,
        isInternalNote: true,
        commenterId: '1', // System user ID or default admin
        isFromCustomer: false,
        isOutgoingReply: false,
      });
    }

    return NextResponse.json({ success: true, message: 'Invoice email sent successfully' });
  } catch (error: any) {
    console.error('Error sending invoice email:', error);
    return NextResponse.json({ error: error.message || 'Failed to send invoice email' }, { status: 500 });
  }
}

async function generatePDF(draftOrder: any, ticketId: number | null) {
  // Create a new PDF document
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([595.28, 841.89]); // A4 size - changed from const to let to fix linter error
  
  // Load fonts
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
    page.drawImage(logoImageEmbed, {
      x: 50,
      y: page.getHeight() - 100,
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
  page.drawText(titleText, {
    x: page.getWidth() - titleWidth - 50,
    y: page.getHeight() - 80,
    size: 24,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.4),
  });

  // Add quote information
  page.drawText(`Quote #: ${draftOrder.name}`, {
    x: 50,
    y: page.getHeight() - 150,
    size: 12,
    font: boldFont,
  });

  page.drawText(`Date: ${new Date().toLocaleDateString()}`, {
    x: 50,
    y: page.getHeight() - 170,
    size: 12,
    font: font,
  });

  if (ticketId) {
    page.drawText(`Reference: Ticket #${ticketId}`, {
      x: 50,
      y: page.getHeight() - 190,
      size: 12,
      font: font,
    });
  }

  // Add customer information
  if (draftOrder.customer) {
    const customer = draftOrder.customer;
    page.drawText('Bill To:', {
      x: 50, 
      y: page.getHeight() - 230,
      size: 12,
      font: boldFont,
    });
    
    page.drawText(`${customer.firstName || ''} ${customer.lastName || ''}`.trim(), {
      x: 50,
      y: page.getHeight() - 250,
      size: 11,
      font: font,
    });
    
    if (customer.company) {
      page.drawText(customer.company, {
        x: 50,
        y: page.getHeight() - 265,
        size: 11,
        font: font,
      });
    }
    
    page.drawText(customer.email || '', {
      x: 50,
      y: page.getHeight() - 280,
      size: 11,
      font: font,
    });
  }

  // Shipping information
  if (draftOrder.shippingAddress) {
    const address = draftOrder.shippingAddress;
    page.drawText('Ship To:', {
      x: 300, 
      y: page.getHeight() - 230,
      size: 12,
      font: boldFont,
    });
    
    page.drawText(`${address.firstName || ''} ${address.lastName || ''}`.trim(), {
      x: 300,
      y: page.getHeight() - 250,
      size: 11,
      font: font,
    });
    
    if (address.company) {
      page.drawText(address.company, {
        x: 300,
        y: page.getHeight() - 265,
        size: 11,
        font: font,
      });
    }
    
    page.drawText(address.address1 || '', {
      x: 300,
      y: page.getHeight() - 280,
      size: 11,
      font: font,
    });
    
    page.drawText(`${address.city || ''}, ${address.province || ''} ${address.zip || ''}`, {
      x: 300,
      y: page.getHeight() - 295,
      size: 11,
      font: font,
    });
    
    page.drawText(address.country || '', {
      x: 300,
      y: page.getHeight() - 310,
      size: 11,
      font: font,
    });
  }

  // Draw table header
  const tableY = page.getHeight() - 360;
  page.drawRectangle({
    x: 50,
    y: tableY - 20,
    width: page.getWidth() - 100,
    height: 20,
    color: rgb(0.9, 0.9, 0.9),
    borderColor: rgb(0.5, 0.5, 0.5),
    borderWidth: 1,
  });
  
  page.drawText('Description', {
    x: 60,
    y: tableY - 15,
    size: 11,
    font: boldFont,
  });
  
  page.drawText('Quantity', {
    x: 300,
    y: tableY - 15,
    size: 11,
    font: boldFont,
  });
  
  page.drawText('Unit Price', {
    x: 380,
    y: tableY - 15,
    size: 11,
    font: boldFont,
  });
  
  page.drawText('Total', {
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
      
      page.drawText(item.title || 'Product', {
        x: 60,
        y: currentY,
        size: 10,
        font: font,
        maxWidth: 220,
      });
      
      page.drawText(item.quantity.toString(), {
        x: 300,
        y: currentY,
        size: 10,
        font: font,
      });
      
      page.drawText(`$${item.price ? parseFloat(item.price).toFixed(2) : '0.00'}`, {
        x: 380,
        y: currentY,
        size: 10,
        font: font,
      });
      
      const lineTotal = (item.quantity || 0) * (parseFloat(item.price) || 0);
      page.drawText(`$${lineTotal.toFixed(2)}`, {
        x: 480,
        y: currentY,
        size: 10,
        font: font,
      });
      
      currentY -= 20;
      
      // Add a new page if we're running out of space
      if (currentY < 100) {
        page = pdfDoc.addPage([595.28, 841.89]);
        currentY = page.getHeight() - 50;
      }
    }
  }

  // Draw totals
  const totalsY = Math.max(currentY - 50, 100);
  page.drawLine({
    start: { x: 380, y: totalsY + 20 },
    end: { x: 545, y: totalsY + 20 },
    thickness: 1,
    color: rgb(0.5, 0.5, 0.5),
  });
  
  page.drawText('Subtotal:', {
    x: 380,
    y: totalsY,
    size: 11,
    font: boldFont,
  });
  
  const subtotalAmount = draftOrder.subtotalPrice ? parseFloat(draftOrder.subtotalPrice) : 0;
  page.drawText(`$${subtotalAmount.toFixed(2)}`, {
    x: 480,
    y: totalsY,
    size: 11,
    font: font,
  });
  
  page.drawText('Shipping:', {
    x: 380,
    y: totalsY - 20,
    size: 11,
    font: boldFont,
  });
  
  const shippingAmount = draftOrder.totalShippingPrice ? parseFloat(draftOrder.totalShippingPrice) : 0;
  page.drawText(`$${shippingAmount.toFixed(2)}`, {
    x: 480,
    y: totalsY - 20,
    size: 11,
    font: font,
  });
  
  page.drawText('Tax:', {
    x: 380,
    y: totalsY - 40,
    size: 11,
    font: boldFont,
  });
  
  const taxAmount = draftOrder.totalTax ? parseFloat(draftOrder.totalTax) : 0;
  page.drawText(`$${taxAmount.toFixed(2)}`, {
    x: 480,
    y: totalsY - 40,
    size: 11,
    font: font,
  });
  
  page.drawLine({
    start: { x: 380, y: totalsY - 50 },
    end: { x: 545, y: totalsY - 50 },
    thickness: 1,
    color: rgb(0.5, 0.5, 0.5),
  });
  
  page.drawText('Total:', {
    x: 380,
    y: totalsY - 70,
    size: 12,
    font: boldFont,
  });
  
  const totalAmount = draftOrder.totalPrice ? parseFloat(draftOrder.totalPrice) : 0;
  page.drawText(`$${totalAmount.toFixed(2)} ${draftOrder.currencyCode || 'USD'}`, {
    x: 480,
    y: totalsY - 70,
    size: 12,
    font: boldFont,
  });

  // Add footer
  page.drawText('Thank you for your business!', {
    x: 50,
    y: 50,
    size: 12,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.4),
  });
  
  page.drawText('This is a quote - Not an invoice. Please contact us to finalize your order.', {
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
  try {
    const graphClient = getGraphClient();
    const logoPath = path.join(process.cwd(), 'public', 'WIDE - Color on Transparent _RGB-01.png');
    const logoData = fs.readFileSync(logoPath);
    const logoBase64 = logoData.toString('base64');
    
    // Prepare the email message
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f0f0f0; padding: 20px; text-align: center;">
          <img src="cid:company-logo" alt="Alliance Chemical" style="max-width: 200px;">
        </div>
        
        <div style="padding: 20px; border: 1px solid #e0e0e0; border-top: none;">
          <h2 style="color: #333;">Your Quote #${draftOrder.name}</h2>
          
          <p>Thank you for your interest in Alliance Chemical products!</p>
          
          <p>Please find attached your quote details as a PDF.</p>
          
          <p>To complete your order or if you have any questions, please:</p>
          <ul>
            <li>Reply to this email</li>
            <li>Call us at ${process.env.COMPANY_PHONE || '(555) 123-4567'}</li>
            <li>Visit our website at ${process.env.COMPANY_WEBSITE || 'https://example.com'}</li>
          </ul>
          
          <p>If you've already received a Shopify invoice link, you can also complete your purchase there.</p>
          
          <p style="margin-top: 30px;">Thank you for choosing Alliance Chemical.</p>
        </div>
        
        <div style="background-color: #333; color: white; padding: 15px; text-align: center; font-size: 0.8em;">
          &copy; ${new Date().getFullYear()} Alliance Chemical. All rights reserved.
        </div>
      </div>
    `;
    
    const textContent = `
      Thank you for your interest in Alliance Chemical products!

      Please find attached your quote #${draftOrder.name}.
      
      To complete your order or if you have any questions, please:
      - Reply to this email
      - Call us at ${process.env.COMPANY_PHONE || '(555) 123-4567'}
      - Visit our website at ${process.env.COMPANY_WEBSITE || 'https://example.com'}

      If you've already received a Shopify invoice link, you can also complete your purchase there.

      Thank you for choosing Alliance Chemical.
    `;

    // Create message with PDF attachment
    const message = {
      subject: `Your Quote #${draftOrder.name} from Alliance Chemical`,
      body: {
        contentType: 'HTML',
        content: htmlContent
      },
      toRecipients: [
        {
          emailAddress: {
            address: to
          }
        }
      ],
      attachments: [
        {
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: `Quote-${draftOrder.name}.pdf`,
          contentType: 'application/pdf',
          contentBytes: pdfBuffer.toString('base64')
        },
        {
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: 'logo.png',
          contentType: 'image/png',
          contentBytes: logoBase64,
          contentId: 'company-logo',
          isInline: true
        }
      ]
    };

    // Send the email from the shared mailbox if configured, or from the authenticated user
    if (process.env.SHARED_MAILBOX_ADDRESS) {
      await graphClient.api(`/users/${process.env.SHARED_MAILBOX_ADDRESS}/sendMail`)
        .post({
          message,
          saveToSentItems: true
        });
    } else {
      await graphClient.api('/me/sendMail')
        .post({
          message,
          saveToSentItems: true
        });
    }

    console.log(`Email sent to ${to} for quote #${draftOrder.name}`);
  } catch (error) {
    console.error('Error sending email through Graph API:', error);
    throw error;
  }
} 