import { NextRequest, NextResponse } from 'next/server';
import { getDraftOrderById } from '@/agents/shopifyAgent/draftOrderAgent';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check for authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const draftOrderId = params.id;
    if (!draftOrderId) {
      return NextResponse.json({ error: 'Draft order ID is required' }, { status: 400 });
    }

    const draftOrder = await getDraftOrderById(draftOrderId);
    if (!draftOrder) {
      return NextResponse.json({ error: 'Draft order not found' }, { status: 404 });
    }

    return NextResponse.json(draftOrder);
  } catch (error: any) {
    console.error('Error fetching draft order:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch draft order' },
      { status: 500 }
    );
  }
} 