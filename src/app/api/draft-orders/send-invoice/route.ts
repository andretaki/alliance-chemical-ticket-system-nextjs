import type { NextRequest } from 'next/server';
import { getServerSession } from '@/lib/auth-helpers';
import { ShopifyService } from '@/services/shopify/ShopifyService';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/apiResponse';

const sendInvoiceSchema = z.object({
  draftOrderId: z.string().startsWith('gid://shopify/DraftOrder/'),
});

export async function POST(request: NextRequest) {
  try {
    const { session, error } = await getServerSession();
    if (error) {
      return apiError('unauthorized', error, null, { status: 401 });
    }
    if (!session?.user?.id || (session.user.role !== 'admin' && session.user.role !== 'manager')) {
      return apiError('unauthorized', 'Unauthorized', null, { status: 401 });
    }

    const body = await request.json();
    const validation = sendInvoiceSchema.safeParse(body);
    if (!validation.success) {
      return apiError('validation_error', 'Invalid request body', validation.error.format(), { status: 400 });
    }

    const { draftOrderId } = validation.data;

    const shopifyService = new ShopifyService();
    const result = await shopifyService.sendDraftOrderInvoice(draftOrderId);

    if (result.success) {
      return apiSuccess({
        message: `Invoice for draft order sent successfully.`,
        ...result
      });
    } else {
      console.error(`[API /api/draft-orders/send-invoice] Shopify error:`, result.error);
      return apiError('shopify_error', result.error || 'Failed to send invoice from Shopify', null, { status: 500 });
    }

  } catch (error: any) {
    console.error(`[API /api/draft-orders/send-invoice] Error:`, error);
    return apiError('internal_error', error.message || 'Internal Server Error', null, { status: 500 });
  }
} 