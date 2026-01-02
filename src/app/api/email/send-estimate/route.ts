import type { NextRequest } from 'next/server';
import { getServerSession } from '@/lib/auth-helpers';
import { sendNotificationEmail } from '@/lib/email';
import { apiSuccess, apiError } from '@/lib/apiResponse';

/**
 * Send QuickBooks Estimate to Customer
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const { session, error } = await getServerSession();
    if (error) {
      return apiError('unauthorized', error, null, { status: 401 });
    }

    const body = await request.json();
    const {
      customerEmail,
      estimateId,
      estimateNumber,
      totalAmount,
      products,
      pdfUrl
    } = body;

    console.log('[Email Estimate] Sending estimate to:', customerEmail);

    // Generate professional email content
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="color: #333; margin-top: 0;">Your Estimate from Alliance Chemical</h2>
          <p style="color: #666; margin-bottom: 0;">
            Estimate #${estimateNumber}
          </p>
        </div>
        
        <p>Dear Valued Customer,</p>
        
        <p>Thank you for your inquiry. We're pleased to provide you with the following estimate:</p>
        
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">Estimate Summary</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background-color: #e9ecef;">
                <th style="padding: 10px; text-align: left; border-bottom: 1px solid #dee2e6;">Product</th>
                <th style="padding: 10px; text-align: right; border-bottom: 1px solid #dee2e6;">Quantity</th>
                <th style="padding: 10px; text-align: right; border-bottom: 1px solid #dee2e6;">Unit Price</th>
                <th style="padding: 10px; text-align: right; border-bottom: 1px solid #dee2e6;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${products.map((product: any) => `
                <tr>
                  <td style="padding: 10px; border-bottom: 1px solid #eee;">
                    <strong>${product.name}</strong><br>
                    <small style="color: #666;">SKU: ${product.sku}</small>
                  </td>
                  <td style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;">
                    ${product.quantity}
                  </td>
                  <td style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;">
                    $${product.unitPrice.toFixed(2)}
                  </td>
                  <td style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;">
                    <strong>$${product.totalPrice.toFixed(2)}</strong>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div style="text-align: right; margin-top: 15px; padding-top: 15px; border-top: 2px solid #0066cc;">
            <h3 style="margin: 0; color: #0066cc;">
              Total Estimate: $${totalAmount.toFixed(2)}
            </h3>
          </div>
        </div>
        
        <div style="background-color: #e7f3ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #0066cc;">Next Steps:</h4>
          <ul style="margin: 0; padding-left: 20px;">
            <li>Review the estimate details above</li>
            <li>Contact us with any questions or modifications needed</li>
            <li>We can convert this estimate to an order when you're ready</li>
            <li>Terms and conditions apply as per our standard agreement</li>
          </ul>
        </div>
        
        <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ffc107;">
          <h4 style="margin-top: 0; color: #856404;">Important Notes:</h4>
          <ul style="margin: 0; padding-left: 20px; color: #856404;">
            <li>This estimate is valid for 30 days from the date issued</li>
            <li>Prices are subject to change based on market conditions</li>
            <li>Shipping costs will be calculated separately</li>
            <li>All chemical products require proper handling and storage</li>
          </ul>
        </div>
        
        <p>If you have any questions about this estimate or need any modifications, please don't hesitate to contact us. We appreciate your business and look forward to serving you.</p>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="margin: 0;">Best regards,</p>
          <p style="margin: 0; font-weight: bold;">Alliance Chemical Sales Team</p>
          <p style="margin: 5px 0 0 0; color: #666;">
            Email: sales@alliancechemical.com | Phone: (555) 123-4567
          </p>
        </div>
        
        ${pdfUrl ? `
          <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-radius: 5px; text-align: center;">
            <p style="margin: 0; color: #666;">
              <strong>PDF Version:</strong> A downloadable PDF copy of this estimate is attached to this email.
            </p>
          </div>
        ` : ''}
      </div>
    `;

    // Send the email
    const emailSent = await sendNotificationEmail({
      recipientEmail: customerEmail,
      subject: `Your Estimate from Alliance Chemical - #${estimateNumber}`,
      htmlBody: htmlContent,
      senderName: 'Alliance Chemical Sales Team'
    });

    if (emailSent) {
      console.log('[Email Estimate] Successfully sent to:', customerEmail);
      return apiSuccess({
        message: 'Estimate email sent successfully'
      });
    } else {
      throw new Error('Failed to send email');
    }

  } catch (error) {
    console.error('[Email Estimate] Error:', error);
    return apiError('email_error', 'Failed to send estimate email', { details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}