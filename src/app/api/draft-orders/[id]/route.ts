import { NextRequest, NextResponse } from 'next/server';
import { getDraftOrderById } from '@/agents/shopifyAgent/draftOrderAgent';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { shopifyService } from '@/services/shopify/ShopifyService';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Draft order ID is required' }, { status: 400 });
    }

    // Convert the numeric ID to a Shopify GID
    const draftOrderGid = `gid://shopify/DraftOrder/${id}`;
    
    // Get the draft order from Shopify
    const draftOrder = await shopifyService.getDraftOrderById(draftOrderGid);
    
    if (!draftOrder) {
      return NextResponse.json({ error: 'Draft order not found' }, { status: 404 });
    }

    return NextResponse.json(draftOrder);
  } catch (error) {
    console.error('Error fetching draft order:', error);
    return NextResponse.json(
      { error: 'Failed to fetch draft order' },
      { status: 500 }
    );
  }
} 