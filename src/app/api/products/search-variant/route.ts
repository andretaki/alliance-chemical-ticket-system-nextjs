import { NextRequest, NextResponse } from 'next/server';
import { ProductService } from '@/services/productService';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
// import type { ProductVariantData } from '@/agents/quoteAssistant/quoteInterfaces'; // Not needed with new logic

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');

    console.log('[API /api/products/search-variant] Received query:', query);

    if (!query || query.length < 2) {
      // Allow single character search if it's likely part of a SKU/ID
      if (!query || (query.length < 1 && !/^[a-zA-Z0-9]$/.test(query))) {
         return NextResponse.json({ results: [] }); // Return empty for too short query
      }
    }

    const productService = new ProductService();
    // Use the new comprehensive search method
    const results = await productService.searchProductsAndVariants(query);

    console.log('[API /api/products/search-variant] Results from ProductService:', results);

    return NextResponse.json({ results: results });

  } catch (error) {
    console.error('Error in search-variant API:', error);
    return NextResponse.json(
      { error: 'Internal server error', results: [] }, // Ensure results is always an array
      { status: 500 }
    );
  }
} 