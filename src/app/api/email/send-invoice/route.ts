import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import 'isomorphic-fetch';
import { db, ticketComments, users } from '@/lib/db';
import { headers } from 'next/headers';
import * as graphService from '@/lib/graphService';
import { eq } from 'drizzle-orm';

interface Margins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

interface TextOptions {
  x?: number;
  y?: number;
  size?: number;
  font?: PDFFont;
  color?: any;
  maxWidth?: number;
  lineHeight?: number;
  align?: 'left' | 'right' | 'center';
}

interface LineOptions {
  startX?: number;
  endX?: number;
  thickness?: number;
  color?: any;
}

interface TableColumn {
  key: string;
  header: string;
  width?: number;
  align?: 'left' | 'right' | 'center';
}

interface TableOptions {
  headerBackgroundColor?: any;
  alternateRowColor?: any;
  borderColor?: any;
  fontSize?: number;
  headerFontSize?: number;
  rowHeight?: number;
  headerHeight?: number;
}

interface LogoOptions {
  x?: number;
  maxWidth?: number;
  maxHeight?: number;
}

class PDFGenerator {
  private doc: PDFDocument | null = null;
  private currentPage: PDFPage | null = null;
  public fonts: Partial<Fonts> = {};
  private _currentY: number = 0;
  public margins: Margins = { top: 50, bottom: 50, left: 50, right: 50 };
  private pageWidth: number = 595.28; // A4
  private pageHeight: number = 841.89;
  public contentWidth: number;

  constructor() {
    this.contentWidth = this.pageWidth - this.margins.left - this.margins.right;
  }

  get regularFont(): PDFFont | undefined {
    return this.fonts.regular;
  }

  get boldFont(): PDFFont | undefined {
    return this.fonts.bold;
  }

  get leftMargin(): number {
    return this.margins.left;
  }

  get pageContentWidth(): number {
    return this.contentWidth;
  }

  // Public getter and setter for currentY
  get currentY(): number {
    return this._currentY;
  }

  set currentY(y: number) {
    this._currentY = y;
  }

  get currentPosition(): number {
    return this._currentY;
  }

  set currentPosition(y: number) {
    this._currentY = y;
  }

  async initialize(): Promise<void> {
    this.doc = await PDFDocument.create();
    this.currentPage = this.doc.addPage([this.pageWidth, this.pageHeight]);
    this.fonts.regular = await this.doc.embedFont(StandardFonts.Helvetica);
    this.fonts.bold = await this.doc.embedFont(StandardFonts.HelveticaBold);
    this._currentY = this.pageHeight - this.margins.top;
  }

  newPage(): PDFPage {
    if (!this.doc) throw new Error('PDF not initialized');
    this.currentPage = this.doc.addPage([this.pageWidth, this.pageHeight]);
    this._currentY = this.pageHeight - this.margins.top;
    return this.currentPage;
  }

  checkPageSpace(requiredHeight: number): void {
    if (this._currentY - requiredHeight < this.margins.bottom) {
      this.newPage();
    }
  }

  // Improved text drawing with automatic wrapping
  drawText(text: string, options: TextOptions = {}): number {
    if (!this.currentPage || !this.fonts.regular) {
      throw new Error('PDF not properly initialized');
    }

    const {
      x = this.margins.left,
      y,
      size = 12,
      font = this.fonts.regular,
      color = rgb(0, 0, 0),
      maxWidth,
      lineHeight = size + 4,
      align = 'left'
    } = options;

    // Use provided y or current position
    const drawY = y !== undefined ? y : this._currentY;

    this.checkPageSpace(lineHeight);

    if (maxWidth) {
      const lines = this.wrapText(text, font, size, maxWidth);
      lines.forEach((line, index) => {
        let drawX = x;
        if (align === 'right') {
          drawX = x - font.widthOfTextAtSize(line, size);
        } else if (align === 'center') {
          drawX = x - font.widthOfTextAtSize(line, size) / 2;
        }

        this.currentPage!.drawText(line, {
          x: drawX,
          y: drawY - (index * lineHeight),
          size,
          font,
          color
        });
      });
    } else {
      let drawX = x;
      if (align === 'right') {
        drawX = x - font.widthOfTextAtSize(text, size);
      } else if (align === 'center') {
        drawX = x - font.widthOfTextAtSize(text, size) / 2;
      }

      this.currentPage.drawText(text, {
        x: drawX,
        y: drawY,
        size,
        font,
        color
      });
    }

    // Only update _currentY if y was not explicitly provided
    if (y === undefined) {
      this._currentY -= lineHeight;
    }
    
    return drawY;
  }

  // Improved text wrapping
  wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const width = font.widthOfTextAtSize(testLine, size);
      
      if (width <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines.length > 0 ? lines : [''];
  }

  // Add space between elements
  addSpace(height: number = 15): void {
    this._currentY -= height;
  }

  // Draw a horizontal line
  drawLine(options: LineOptions = {}): void {
    if (!this.currentPage) {
      throw new Error('PDF not properly initialized');
    }

    const {
      startX = this.margins.left,
      endX = this.margins.left + this.contentWidth,
      thickness = 0.5,
      color = rgb(0.8, 0.8, 0.8)
    } = options;

    this.checkPageSpace(thickness + 10);

    this.currentPage.drawLine({
      start: { x: startX, y: this._currentY },
      end: { x: endX, y: this._currentY },
      thickness,
      color
    });

    this._currentY -= (thickness + 5);
  }

  // Improved table generation
  drawTable(data: any[], columns: TableColumn[], options: TableOptions = {}): void {
    if (!this.currentPage || !this.fonts.regular || !this.fonts.bold) {
      throw new Error('PDF not properly initialized');
    }

    const {
      headerBackgroundColor = rgb(0.95, 0.95, 0.95),
      alternateRowColor = rgb(0.98, 0.98, 0.98),
      borderColor = rgb(0.8, 0.8, 0.8),
      fontSize = 10,
      headerFontSize = 11,
      rowHeight = 25,
      headerHeight = 30
    } = options;

    // Calculate column widths
    const totalWeight = columns.reduce((sum, col) => sum + (col.width || 1), 0);
    const colWidths = columns.map(col => ((col.width || 1) / totalWeight) * this.contentWidth);
    const tableHeight = headerHeight + (data.length * rowHeight);
    
    this.checkPageSpace(tableHeight);

    const tableStartY = this._currentY;
    let currentX = this.margins.left;

    // Draw header background
    this.currentPage.drawRectangle({
      x: this.margins.left,
      y: this._currentY - headerHeight,
      width: this.contentWidth,
      height: headerHeight,
      color: headerBackgroundColor
    });

    // Draw header text
    columns.forEach((col, i) => {
      this.currentPage!.drawText(col.header, {
        x: currentX + 5,
        y: this._currentY - headerHeight/2 - headerFontSize/2,
        size: headerFontSize,
        font: this.fonts.bold!,
        color: rgb(0.2, 0.2, 0.2)
      });
      currentX += colWidths[i];
    });

    this._currentY -= headerHeight;

    // Draw data rows
    data.forEach((row, rowIndex) => {
      currentX = this.margins.left;

      // Alternate row background
      if (rowIndex % 2 === 1) {
        this.currentPage!.drawRectangle({
          x: this.margins.left,
          y: this._currentY - rowHeight,
          width: this.contentWidth,
          height: rowHeight,
          color: alternateRowColor
        });
      }

      // Draw row data
      columns.forEach((col, colIndex) => {
        const cellValue = row[col.key]?.toString() || '';
        let textX = currentX + 5;

        if (col.align === 'right') {
          textX = currentX + colWidths[colIndex] - 5 - this.fonts.regular!.widthOfTextAtSize(cellValue, fontSize);
        } else if (col.align === 'center') {
          textX = currentX + (colWidths[colIndex] - this.fonts.regular!.widthOfTextAtSize(cellValue, fontSize)) / 2;
        }

        this.currentPage!.drawText(cellValue, {
          x: textX,
          y: this._currentY - rowHeight/2 - fontSize/2,
          size: fontSize,
          font: this.fonts.regular!,
          color: rgb(0, 0, 0)
        });

        currentX += colWidths[colIndex];
      });

      this._currentY -= rowHeight;
    });

    // Draw table borders
    this.drawTableBorders(columns, colWidths, data.length, headerHeight, rowHeight, borderColor);
    
    // Add some space after table
    this._currentY -= 10;
  }

  drawTableBorders(columns: TableColumn[], colWidths: number[], rowCount: number, headerHeight: number, rowHeight: number, borderColor: any): void {
    if (!this.currentPage) return;
    
    const tableHeight = headerHeight + ((rowCount - 1) * rowHeight);
    const startY = this.currentY + tableHeight;

    // Horizontal lines
    for (let i = 0; i <= rowCount; i++) {
      const y = startY - (i === 0 ? headerHeight : headerHeight + ((i - 1) * rowHeight));
      this.currentPage.drawLine({
        start: { x: this.margins.left, y },
        end: { x: this.margins.left + this.contentWidth, y },
        thickness: i === 0 || i === 1 ? 1 : 0.5,
        color: borderColor
      });
    }

    // Vertical lines
    let currentX = this.margins.left;
    for (let i = 0; i <= columns.length; i++) {
      this.currentPage.drawLine({
        start: { x: currentX, y: startY },
        end: { x: currentX, y: startY - tableHeight },
        thickness: 0.5,
        color: borderColor
      });
      if (i < columns.length) {
        currentX += colWidths[i];
      }
    }
  }

  async addLogo(logoPath: string, options: LogoOptions = {}): Promise<{ width: number; height: number; y: number } | null> {
    if (!this.currentPage || !this.doc) {
      throw new Error('PDF not properly initialized');
    }

    try {
      const {
        x = this.margins.left,
        maxWidth = 180,
        maxHeight = 80
      } = options;

      const logoBuffer = fs.readFileSync(logoPath);
      const logoImage = await this.doc.embedPng(logoBuffer);
      
      // Calculate size maintaining aspect ratio
      const scale = Math.min(maxWidth / logoImage.width, maxHeight / logoImage.height);
      const width = logoImage.width * scale;
      const height = logoImage.height * scale;
      
      const logoY = this._currentY - height;
      
      this.currentPage.drawImage(logoImage, {
        x,
        y: logoY,
        width,
        height
      });
      
      // Don't update currentY for logo as it's typically positioned absolutely
      return { width, height, y: logoY };
    } catch (error) {
      console.error('Error adding logo:', error);
      return null;
    }
  }

  async generatePDF(): Promise<Uint8Array> {
    if (!this.doc) throw new Error('PDF not initialized');
    return await this.doc.save();
  }
}

// Remove export - this should be internal to the route
async function generateImprovedPDF(draftOrder: any): Promise<Buffer> {
  const generator = new PDFGenerator();
  await generator.initialize();

  // Add logo positioned higher and more to the left for better alignment
  const logoPath = path.join(process.cwd(), 'public', 'WIDE - Color on Transparent _RGB-01.png');
  
  // Save current position and move up for logo placement
  const originalY = generator.currentY;
  generator.currentY += 15; // Move up from the current position
  
  const logoResult = await generator.addLogo(logoPath, { 
    x: generator.margins.left - 10, // Move more to the left
    maxWidth: 170,  // Slightly larger since we have more space
    maxHeight: 65   // Slightly taller
  });

  // Reset to original position for title
  generator.currentY = originalY;

  // Calculate title position to align nicely with logo
  const titleText = 'CHEMICAL QUOTE';
  const titleSize = 24;
  const titleWidth = generator.fonts.bold!.widthOfTextAtSize(titleText, titleSize);
  
  // Position title on the right side, slightly higher to align with logo
  const titleX = generator.margins.left + generator.contentWidth - titleWidth;
  const titleY = generator.currentY + 10; // Move title up slightly
  
  generator.drawText(titleText, {
    x: titleX,
    y: titleY,
    size: titleSize,
    font: generator.fonts.bold,
    color: rgb(0.1, 0.1, 0.4)
  });

  // Reserve space for logo height plus some padding
  const actualLogoHeight = logoResult?.height || 65;
  generator.currentY -= Math.max(actualLogoHeight + 15, 50); // Slightly less padding since logo is higher

  // Quote info - now positioned below both logo and title
  generator.drawText(`Quote #: ${draftOrder.name}`, {
    size: 14,
    font: generator.fonts.bold
  });

  generator.drawText(`Date: ${new Date().toLocaleDateString()}`);
  
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 30);
  generator.drawText(`Valid Until: ${validUntil.toLocaleDateString()}`);

  generator.addSpace(20);
  generator.drawLine();
  generator.addSpace(20);

  // Customer and shipping addresses - side by side layout
  if (draftOrder.customer) {
    const addressStartY = generator.currentY;
    const leftColumnX = generator.margins.left;
    const rightColumnX = generator.margins.left + (generator.contentWidth / 2) + 20;
    
    // Bill To section (left side)
    generator.drawText('Bill To:', {
      x: leftColumnX,
      y: addressStartY,
      font: generator.fonts.bold,
      color: rgb(0.2, 0.2, 0.2),
      size: 12
    });
    
    let billToY = addressStartY - 20;
    
    // Use billingAddress if available, otherwise fall back to customer data
    const billToData = draftOrder.billingAddress || draftOrder.customer;
    // Ensure we have customer info even if billingAddress exists but lacks names
    if (!billToData.firstName && draftOrder.customer.firstName) billToData.firstName = draftOrder.customer.firstName;
    if (!billToData.lastName && draftOrder.customer.lastName) billToData.lastName = draftOrder.customer.lastName;
    if (!billToData.company && draftOrder.customer.company) billToData.company = draftOrder.customer.company;
    if (!billToData.email && draftOrder.customer.email) billToData.email = draftOrder.customer.email;
    
    const customerName = `${billToData.firstName || ''} ${billToData.lastName || ''}`.trim();
    if (customerName) {
      generator.drawText(customerName, { x: leftColumnX, y: billToY, font: generator.fonts.bold, size: 11 });
      billToY -= 15;
    }
    if (billToData.company) {
      generator.drawText(billToData.company, { x: leftColumnX, y: billToY, size: 11 });
      billToY -= 15;
    }
    if (billToData.email) {
      generator.drawText(billToData.email, { x: leftColumnX, y: billToY, size: 11 });
      billToY -= 15;
    }
    if (billToData.address1) {
      generator.drawText(billToData.address1, { x: leftColumnX, y: billToY, size: 10 });
      billToY -= 13;
    }
    if (billToData.address2) {
      generator.drawText(billToData.address2, { x: leftColumnX, y: billToY, size: 10 });
      billToY -= 13;
    }
    
    const cityStateZip = `${billToData.city || ''}${billToData.city && (billToData.provinceCode || billToData.province) ? ', ' : ''}${billToData.provinceCode || billToData.province || ''} ${billToData.zip || ''}`.trim();
    if (cityStateZip !== ' ' && cityStateZip !== ',') {
      generator.drawText(cityStateZip, { x: leftColumnX, y: billToY, size: 10 });
      billToY -= 13;
    }
    
    const countryDisplay = billToData.countryCode === 'US' ? '' : (billToData.countryCode || billToData.country || '');
    if (countryDisplay) {
      generator.drawText(countryDisplay, { x: leftColumnX, y: billToY, size: 10 });
      billToY -= 13;
    }
    if (billToData.phone) {
      generator.drawText(`Phone: ${billToData.phone}`, { x: leftColumnX, y: billToY, size: 10 });
      billToY -= 13;
    }
    
    // Ship To section (right side)
    let shipToY = addressStartY - 20;
    let shipToHeight = 0;
    
    if (draftOrder.shippingAddress) {
      generator.drawText('Ship To:', {
        x: rightColumnX,
        y: addressStartY,
        font: generator.fonts.bold,
        color: rgb(0.2, 0.2, 0.2),
        size: 12
      });
      
      const shipToData = draftOrder.shippingAddress;
      const shipToName = `${shipToData.firstName || ''} ${shipToData.lastName || ''}`.trim();
      
      if (shipToName) {
        generator.drawText(shipToName, { x: rightColumnX, y: shipToY, font: generator.fonts.bold, size: 11 });
        shipToY -= 15;
      }
      if (shipToData.company) {
        generator.drawText(shipToData.company, { x: rightColumnX, y: shipToY, size: 11 });
        shipToY -= 15;
      }
      if (shipToData.address1) {
        generator.drawText(shipToData.address1, { x: rightColumnX, y: shipToY, size: 10 });
        shipToY -= 13;
      }
      if (shipToData.address2) {
        generator.drawText(shipToData.address2, { x: rightColumnX, y: shipToY, size: 10 });
        shipToY -= 13;
      }
      
      const shipCityStateZip = `${shipToData.city || ''}${shipToData.city && (shipToData.provinceCode || shipToData.province) ? ', ' : ''}${shipToData.provinceCode || shipToData.province || ''} ${shipToData.zip || ''}`.trim();
      if (shipCityStateZip !== ' ' && shipCityStateZip !== ',') {
        generator.drawText(shipCityStateZip, { x: rightColumnX, y: shipToY, size: 10 });
        shipToY -= 13;
      }
      
      const shipCountryDisplay = shipToData.countryCode === 'US' ? '' : (shipToData.countryCode || shipToData.country || '');
      if (shipCountryDisplay) {
        generator.drawText(shipCountryDisplay, { x: rightColumnX, y: shipToY, size: 10 });
        shipToY -= 13;
      }
      if (shipToData.phone) {
        generator.drawText(`Phone: ${shipToData.phone}`, { x: rightColumnX, y: shipToY, size: 10 });
        shipToY -= 13;
      }
      
      shipToHeight = addressStartY - shipToY;
    }
    
    // Move current position down based on the tallest address block
    const billToHeight = addressStartY - billToY;
    generator.currentY -= Math.max(billToHeight, shipToHeight) + 20;
  }

  generator.addSpace(30);

  // Line items table
  if (draftOrder.lineItems?.edges?.length > 0) {
    const tableData = draftOrder.lineItems.edges.map((edge: any) => {
      const item = edge.node;
      const unitPrice = item.originalUnitPriceSet?.shopMoney?.amount ? 
        parseFloat(item.originalUnitPriceSet.shopMoney.amount) : 0;
      const total = item.quantity * unitPrice;

      // Get product title and variant information for complete description
      const productTitle = item.product?.title || item.title || 'Product';
      let variantTitle = item.variant?.title;
      
      // Clean up variant title - if it has a slash, take the part after the slash
      if (variantTitle && variantTitle.includes('/')) {
        variantTitle = variantTitle.split('/').pop()?.trim() || variantTitle;
      }
      
      // Create full display name with variant details if available
      let displayTitle = productTitle;
      if (variantTitle && variantTitle.trim() !== '') {
        displayTitle = `${productTitle} - ${variantTitle}`;
      }

      return {
        description: displayTitle,
        quantity: item.quantity.toString(),
        unitPrice: `$${unitPrice.toFixed(2)}`,
        total: `$${total.toFixed(2)}`
      };
    });

    const columns: TableColumn[] = [
      { key: 'description', header: 'Description', width: 0.5 },
      { key: 'quantity', header: 'Qty', width: 0.15, align: 'center' },
      { key: 'unitPrice', header: 'Unit Price', width: 0.175, align: 'right' },
      { key: 'total', header: 'Total', width: 0.175, align: 'right' }
    ];

    generator.drawTable(tableData, columns);
  }

  generator.addSpace(30);

  // Totals
  const subtotal = draftOrder.subtotalPriceSet?.shopMoney?.amount ? 
    parseFloat(draftOrder.subtotalPriceSet.shopMoney.amount) : 0;
  const tax = draftOrder.totalTaxSet?.shopMoney?.amount ? 
    parseFloat(draftOrder.totalTaxSet.shopMoney.amount) : 0;
  const total = draftOrder.totalPriceSet?.shopMoney?.amount ? 
    parseFloat(draftOrder.totalPriceSet.shopMoney.amount) : 0;

  // Totals section with better alignment
  const totalsX = generator.margins.left + generator.contentWidth * 0.6;
  const amountX = generator.margins.left + generator.contentWidth;

  // Draw subtotal on same line
  const subtotalY = generator.currentY;
  generator.drawText('Subtotal:', { x: totalsX, y: subtotalY, font: generator.fonts.bold });
  const subtotalAmount = `$${subtotal.toFixed(2)}`;
  const subtotalWidth = generator.fonts.regular!.widthOfTextAtSize(subtotalAmount, 12);
  generator.drawText(subtotalAmount, { 
    x: amountX - subtotalWidth,
    y: subtotalY,
    font: generator.fonts.regular
  });
  generator.currentY -= 20;

  // Add shipping if present
  const shipping = draftOrder.totalShippingPriceSet?.shopMoney?.amount ? 
    parseFloat(draftOrder.totalShippingPriceSet.shopMoney.amount) : 0;
  
  if (shipping > 0) {
    const shippingY = generator.currentY;
    generator.drawText('Shipping:', { x: totalsX, y: shippingY, font: generator.fonts.bold });
    const shippingAmount = `$${shipping.toFixed(2)}`;
    const shippingWidth = generator.fonts.regular!.widthOfTextAtSize(shippingAmount, 12);
    generator.drawText(shippingAmount, { 
      x: amountX - shippingWidth,
      y: shippingY,
      font: generator.fonts.regular
    });
    generator.currentY -= 20;
  }

  // Tax row
  const taxY = generator.currentY;
  generator.drawText('Tax:', { x: totalsX, y: taxY, font: generator.fonts.bold });
  const taxAmount = `$${tax.toFixed(2)}`;
  const taxWidth = generator.fonts.regular!.widthOfTextAtSize(taxAmount, 12);
  generator.drawText(taxAmount, { 
    x: amountX - taxWidth,
    y: taxY,
    font: generator.fonts.regular
  });
  generator.currentY -= 30;

  // Total row with line above
  generator.drawLine({ 
    startX: totalsX, 
    endX: amountX, 
    color: rgb(0.1, 0.1, 0.4), 
    thickness: 1.5 
  });
  generator.currentY -= 10;
  
  const totalY = generator.currentY;
  generator.drawText('Total:', { 
    x: totalsX, 
    y: totalY,
    font: generator.fonts.bold, 
    size: 14,
    color: rgb(0.1, 0.1, 0.4)
  });
  const totalText = `$${total.toFixed(2)} USD`;
  const totalWidth = generator.fonts.bold!.widthOfTextAtSize(totalText, 14);
  generator.drawText(totalText, { 
    x: amountX - totalWidth,
    y: totalY,
    font: generator.fonts.bold,
    size: 14,
    color: rgb(0.1, 0.1, 0.4)
  });

  generator.addSpace(40);

  // Footer
  generator.drawLine();
  generator.addSpace(15);
  
  generator.drawText('Thank you for your business!', {
    font: generator.fonts.bold,
    color: rgb(0.1, 0.1, 0.4)
  });

  generator.drawText('This is a quote - Not an invoice. Please contact us to finalize your order.');

  const pdfBytes = await generator.generatePDF();
  return Buffer.from(pdfBytes);
}

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

    // 2. Generate PDF invoice using the improved generator
    const pdfBuffer = await generateImprovedPDF(draftOrder);

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

async function sendEmailWithGraph(to: string, draftOrder: any, pdfBuffer: Buffer) {
  // Check if the quote is empty (no line items or zero total)
  const hasLineItems = draftOrder.lineItems && draftOrder.lineItems.edges && draftOrder.lineItems.edges.length > 0;
  const totalAmount = draftOrder.totalPriceSet?.shopMoney?.amount ? parseFloat(draftOrder.totalPriceSet.shopMoney.amount) : 0;
  const isEmpty = !hasLineItems || totalAmount === 0;
  
  // Determine quote type
  const quoteType = draftOrder.customAttributes?.find((attr: any) => attr.key === 'quoteType')?.value || 
                   (draftOrder.tags?.some((tag: any) => tag.includes('MaterialOnly')) ? 'material_only' : 'material_and_delivery');
  
  let subject = `Quote ${draftOrder.name} from Alliance Chemical`;
  let messageContent = '';
  
  if (isEmpty) {
    // Handle empty quotes - likely incomplete or draft
    subject = `Draft Quote ${draftOrder.name} - Additional Information Needed`;
    messageContent = await generateSmartEmailContent(draftOrder, 'empty');
  } else if (quoteType === 'material_only') {
    subject = `Material Quote ${draftOrder.name} from Alliance Chemical`;
    messageContent = await generateSmartEmailContent(draftOrder, 'material_only');
  } else {
    subject = `Chemical Quote ${draftOrder.name} from Alliance Chemical`;
    messageContent = await generateSmartEmailContent(draftOrder, 'full_service');
  }

  const attachment = {
    name: `Quote-${draftOrder.name}.pdf`,
    contentType: 'application/pdf',
    contentBytes: pdfBuffer.toString('base64')
  };

  await graphService.sendEmail(
    to,
    subject,
    messageContent,
    process.env.SHARED_MAILBOX_ADDRESS || '',
    [attachment]
  );
}

async function generateSmartEmailContent(draftOrder: any, quoteType: 'empty' | 'material_only' | 'full_service'): Promise<string> {
  const customerName = draftOrder.customer?.firstName || 'Valued Customer';
  const quoteName = draftOrder.name;
  const hasLineItems = draftOrder.lineItems && draftOrder.lineItems.edges && draftOrder.lineItems.edges.length > 0;
  const totalAmount = draftOrder.totalPriceSet?.shopMoney?.amount ? parseFloat(draftOrder.totalPriceSet.shopMoney.amount) : 0;
  
  // Get line items summary with cleaned variant titles
  const itemsSummary = hasLineItems ? 
    draftOrder.lineItems.edges.map((edge: any) => {
      const item = edge.node;
      const productTitle = item.product?.title || item.title || 'Product';
      let variantTitle = item.variant?.title;
      
      // Clean up variant title - if it has a slash, take the part after the slash
      if (variantTitle && variantTitle.includes('/')) {
        variantTitle = variantTitle.split('/').pop()?.trim() || variantTitle;
      }
      
      // Create full display name
      let displayName = productTitle;
      if (variantTitle && variantTitle.trim() !== '') {
        displayName = `${productTitle} - ${variantTitle}`;
      }
      
      return `${item.quantity}x ${displayName}`;
    }).join(', ') : 
    'No items specified';

  switch (quoteType) {
    case 'empty':
      return `
        <p>Dear ${customerName},</p>
        <p>Thank you for your interest in Alliance Chemical. We've prepared a preliminary quote framework ${quoteName} for your review.</p>
        
        <div style="background-color: #f8f9fa; border: 1px solid #dee2e6; padding: 15px; margin: 15px 0; border-radius: 5px;">
          <strong>📋 Next Steps Required:</strong><br/>
          To complete your quote, we need additional information about:
          <ul style="margin: 10px 0;">
            <li>Specific chemical products and quantities needed</li>
            <li>Preferred delivery timeline</li>
            <li>Any special handling or packaging requirements</li>
          </ul>
        </div>
        
        <p>Our team is ready to work with you to finalize the details and provide accurate pricing. Please reply to this email with your specific requirements, or call us directly to discuss your needs.</p>
        
        <p>We appreciate your business and look forward to serving your chemical supply needs.</p>
        
        <p>Best regards,<br/>Alliance Chemical Sales Team<br/>📞 Phone: [Your Phone]<br/>📧 Email: sales@alliancechemical.com</p>
      `;

    case 'material_only':
      return `
        <p>Dear ${customerName},</p>
        <p>Thank you for your inquiry. Please find attached your material quote ${quoteName} for pickup at our facility.</p>
        
        <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 15px 0; border-radius: 5px;">
          <strong>🚛 Pickup Quote Details:</strong><br/>
          This quote is for materials only - you'll arrange transportation and pickup directly.
        </div>
        
        <p><strong>Your quote includes:</strong></p>
        <ul>
          <li>All specified chemical products: ${itemsSummary}</li>
          <li>Professional packaging for safe transport</li>
          <li>Safety data sheets and product documentation</li>
          <li>Pickup coordination at our facility</li>
        </ul>
        
        <p><strong>You'll need to arrange:</strong></p>
        <ul>
          <li>Transportation and pickup scheduling</li>
          <li>Proper handling equipment if required</li>
          <li>Any special transport permits if needed</li>
        </ul>
        
        <p>Total value: <strong>$${totalAmount.toFixed(2)}</strong></p>
        <p>This quote is valid for 30 days. Ready to proceed? Simply reply to confirm your order and schedule pickup.</p>
        
        <p>Best regards,<br/>Alliance Chemical Team</p>
      `;

    case 'full_service':
      return `
        <p>Dear ${customerName},</p>
        <p>Thank you for choosing Alliance Chemical. Please find attached your comprehensive quote ${quoteName}.</p>
        
        <div style="background-color: #d4edda; border: 1px solid #c3e6cb; padding: 15px; margin: 15px 0; border-radius: 5px;">
          <strong>🚚 Full Service Quote:</strong><br/>
          Everything you need, delivered to your location with professional handling.
        </div>
        
        <p><strong>Your complete solution includes:</strong></p>
        <ul>
          <li>Premium chemical products: ${itemsSummary}</li>
          <li>Professional packaging and safety compliance</li>
          <li>Delivery to your specified address</li>
          <li>All required documentation and certifications</li>
        </ul>
        
        <p>Total investment: <strong>$${totalAmount.toFixed(2)}</strong></p>
        <p>This quote is valid for 30 days. Questions about the products or ready to place your order? Just reply to this email.</p>
        
        <p>We're here to support your success.</p>
        
        <p>Best regards,<br/>Alliance Chemical Team</p>
      `;

    default:
      return `
        <p>Dear ${customerName},</p>
        <p>Thank you for your inquiry. Please find attached quote ${quoteName}.</p>
        <p>If you have any questions, please don't hesitate to contact us.</p>
        <p>Best regards,<br/>Alliance Chemical Team</p>
      `;
  }
}