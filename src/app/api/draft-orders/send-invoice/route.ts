import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from '@/lib/auth-helpers';
import { ShopifyService } from '@/services/shopify/ShopifyService';
import { z } from 'zod';

const sendInvoiceSchema = z.object({
  draftOrderId: z.string().startsWith('gid://shopify/DraftOrder/'),
});

export async function POST(request: NextRequest) {
  try {
    const { session, error } = await getServerSession();
        if (error) {
      return NextResponse.json({ error }, { status: 401 });
    }
    if (!session?.user?.id || (session.user.role !== 'admin' && session.user.role !== 'manager')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = sendInvoiceSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid request body', details: validation.error.format() }, { status: 400 });
    }
    
    const { draftOrderId } = validation.data;

    const shopifyService = new ShopifyService();
    const result = await shopifyService.sendDraftOrderInvoice(draftOrderId);

    if (result.success) {
      return NextResponse.json({
        message: `Invoice for draft order sent successfully.`,
        ...result
      });
    } else {
      console.error(`[API /api/draft-orders/send-invoice] Shopify error:`, result.error);
      return NextResponse.json({ error: result.error || 'Failed to send invoice from Shopify' }, { status: 500 });
    }

  } catch (error: any) {
    console.error(`[API /api/draft-orders/send-invoice] Error:`, error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
} 