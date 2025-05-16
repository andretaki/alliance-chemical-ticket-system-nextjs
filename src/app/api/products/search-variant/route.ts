import { NextRequest, NextResponse } from 'next/server';
import { ProductService } from '@/services/productService';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import type { ProductVariantData } from '@/agents/quoteAssistant/quoteInterfaces';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');

    if (!query || query.length < 2) {
      return NextResponse.json({ error: 'Search query must be at least 2 characters' }, { status: 400 });
    }

    const productService = new ProductService();

    // First try to find by SKU
    const skuResult = await productService.findVariantBySku(query);
    if (skuResult) {
      return NextResponse.json({ results: [skuResult] });
    }

    // If no SKU match, search by name
    const nameResults = await productService.findVariantByName(query);
    return NextResponse.json({ results: nameResults });

  } catch (error) {
    console.error('Error in search-variant API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 