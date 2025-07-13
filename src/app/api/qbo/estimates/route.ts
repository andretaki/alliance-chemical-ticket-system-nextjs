import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth-helpers';
import QuickBooks from 'node-quickbooks';

interface EstimateLineItem {
  Description: string;
  Qty: number;
  UnitPrice: number;
  Amount: number;
  DetailType: 'SalesItemLineDetail';
  SalesItemLineDetail: {
    UnitPrice: number;
    Qty: number;
  };
}

interface QuickBooksEstimate {
  Line: EstimateLineItem[];
  CustomerRef: {
    value: string;
    name?: string;
  };
  TotalAmt: number;
  PrivateNote?: string;
  CustomerMemo?: {
    value: string;
  };
}

/**
 * Create QuickBooks Online Estimate
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const { session, error } = await getServerSession();
    if (error) {
      return NextResponse.json({ error }, { status: 401 });
    }

    // TODO: Complete QuickBooks Online integration setup
    return NextResponse.json({
      error: 'QuickBooks Online integration is being set up. Please use Shopify Draft Orders for now.',
      message: 'QBO estimates feature is under development'
    }, { status: 501 });

    /* QuickBooks integration code - temporarily disabled for build

    const body = await request.json();
    const {
      customerEmail,
      customerData,
      products,
      totalValue,
      inquiryText,
      ticketId,
      intelligence
    } = body;

    console.log('[QBO Estimates] Creating estimate for:', customerEmail);

    // Initialize QuickBooks client
    const qbo = new QuickBooks(
      process.env.QBO_CONSUMER_KEY!,
      process.env.QBO_CONSUMER_SECRET!,
      process.env.QBO_ACCESS_TOKEN!,
      process.env.QBO_ACCESS_TOKEN_SECRET!,
      process.env.QBO_REALM_ID!,
      process.env.NODE_ENV !== 'production', // sandbox mode for development
      true, // enable debugging
      4, // minor version
      '2.0', // version 
      process.env.QBO_ACCESS_TOKEN! // refresh token
    );

    // Find or create customer in QuickBooks
    let qboCustomerId = null;
    
    try {
      // Search for existing customer by email
      const customerQuery = `SELECT * FROM Customer WHERE Active = true AND PrimaryEmailAddr = '${customerEmail}'`;
      
      const existingCustomers = await new Promise((resolve, reject) => {
        qbo.findCustomers(customerQuery, (err: any, customers: any) => {
          if (err) reject(err);
          else resolve(customers);
        });
      });

      if (existingCustomers && (existingCustomers as any).QueryResponse?.Customer?.length > 0) {
        qboCustomerId = (existingCustomers as any).QueryResponse.Customer[0].Id;
        console.log('[QBO Estimates] Found existing customer:', qboCustomerId);
      } else {
        // Create new customer
        const customerName = customerData?.name || customerEmail.split('@')[0];
        const newCustomer = {
          Name: customerName,
          CompanyName: customerData?.company || '',
          PrimaryEmailAddr: {
            Address: customerEmail
          },
          PrimaryPhone: customerData?.phone ? {
            FreeFormNumber: customerData.phone
          } : undefined,
          BillAddr: customerData?.address ? {
            Line1: customerData.address.line1,
            Line2: customerData.address.line2,
            City: customerData.address.city,
            CountrySubDivisionCode: customerData.address.state,
            PostalCode: customerData.address.postalCode,
            Country: customerData.address.country || 'US'
          } : undefined
        };

        const createdCustomer = await new Promise((resolve, reject) => {
          qbo.createCustomer(newCustomer, (err: any, customer: any) => {
            if (err) reject(err);
            else resolve(customer);
          });
        });

        qboCustomerId = (createdCustomer as any).Id;
        console.log('[QBO Estimates] Created new customer:', qboCustomerId);
      }
    } catch (customerError) {
      console.error('[QBO Estimates] Customer handling error:', customerError);
      return NextResponse.json(
        { error: 'Failed to handle customer in QuickBooks' },
        { status: 500 }
      );
    }

    // Create estimate line items
    const lineItems: EstimateLineItem[] = products.map((product: any, index: number) => ({
      Description: `${product.name} (SKU: ${product.sku})`,
      Qty: product.quantity,
      UnitPrice: product.unitPrice,
      Amount: product.totalPrice,
      DetailType: 'SalesItemLineDetail',
      SalesItemLineDetail: {
        UnitPrice: product.unitPrice,
        Qty: product.quantity
      }
    }));

    // Create the estimate object
    const estimate: QuickBooksEstimate = {
      Line: lineItems,
      CustomerRef: {
        value: qboCustomerId,
        name: customerData?.name || customerEmail
      },
      TotalAmt: totalValue,
      PrivateNote: `Generated from ticket #${ticketId || 'Direct'} - ${inquiryText.substring(0, 200)}`,
      CustomerMemo: {
        value: intelligence?.customerInsights?.specialRequirements?.join(', ') || 'Chemical products estimate from Alliance Chemical'
      }
    };

    // Create estimate in QuickBooks
    const qboEstimate = await new Promise((resolve, reject) => {
      qbo.createEstimate(estimate, (err: any, estimate: any) => {
        if (err) {
          console.error('[QBO Estimates] Creation error:', err);
          reject(err);
        } else {
          console.log('[QBO Estimates] Created successfully:', estimate.Id);
          resolve(estimate);
        }
      });
    });

    // Generate estimate PDF (if needed)
    let estimatePdfUrl = null;
    try {
      const pdfResponse = await new Promise((resolve, reject) => {
        qbo.getEstimatePdf((qboEstimate as any).Id, (err: any, pdf: any) => {
          if (err) reject(err);
          else resolve(pdf);
        });
      });
      
      // Note: In production, you'd save this PDF to your storage (Vercel Blob, S3, etc.)
      estimatePdfUrl = `data:application/pdf;base64,${(pdfResponse as any).toString('base64')}`;
    } catch (pdfError) {
      console.warn('[QBO Estimates] PDF generation failed:', pdfError);
    }

    // Send estimate to customer via email
    try {
      const emailResponse = await fetch('/api/email/send-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerEmail,
          estimateId: (qboEstimate as any).Id,
          estimateNumber: (qboEstimate as any).DocNumber,
          totalAmount: totalValue,
          products,
          pdfUrl: estimatePdfUrl
        })
      });

      if (!emailResponse.ok) {
        console.warn('[QBO Estimates] Email sending failed');
      }
    } catch (emailError) {
      console.warn('[QBO Estimates] Email error:', emailError);
    }

    // Update ticket with estimate information
    if (ticketId) {
      try {
        await fetch(`/api/tickets/${ticketId}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            commentText: `📋 QuickBooks Estimate Created\n\n**Estimate #${(qboEstimate as any).DocNumber}**\n- Total Value: $${totalValue.toFixed(2)}\n- Products: ${products.length} items\n- Status: Sent to customer\n\nEstimate ID: ${(qboEstimate as any).Id}`,
            isInternalNote: false,
            isOutgoingReply: true
          })
        });
      } catch (updateError) {
        console.warn('[QBO Estimates] Ticket update failed:', updateError);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        estimateId: (qboEstimate as any).Id,
        estimateNumber: (qboEstimate as any).DocNumber,
        totalAmount: totalValue,
        customerRef: qboCustomerId,
        status: 'created',
        pdfUrl: estimatePdfUrl,
        qboUrl: `https://qbo.intuit.com/app/estimate?txnId=${(qboEstimate as any).Id}`
      },
      message: 'QuickBooks estimate created successfully'
    });

  } catch (error) {
    console.error('[QBO Estimates] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create QuickBooks estimate',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
    */
  } catch (error) {
    console.error('[QBO Estimates] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create QuickBooks estimate',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}