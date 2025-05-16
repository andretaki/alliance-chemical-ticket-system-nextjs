import { NextRequest, NextResponse } from 'next/server';
import { RagQueryService, RagFilters } from '@/services/ragQueryService';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';

export async function POST(request: NextRequest) {
    // Ensure only POST requests
    if (request.method !== 'POST') {
        return NextResponse.json({ message: 'Method Not Allowed' }, { status: 405 });
    }

    // Authenticate the request
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { query, filters, customerContext } = body;

        // Validate required fields
        if (!query || typeof query !== 'string') {
            return NextResponse.json({ message: 'Query string is required' }, { status: 400 });
        }

        // Validate filters if provided
        let validFilters: RagFilters = {};
        if (filters) {
            if (Array.isArray(filters.source_type_in)) {
                validFilters.source_type_in = filters.source_type_in;
            }
            
            if (typeof filters.customer_email_exact === 'string') {
                validFilters.customer_email_exact = filters.customer_email_exact;
            }
            
            if (typeof filters.order_id_exact === 'string') {
                validFilters.order_id_exact = filters.order_id_exact;
            }
            
            if (Array.isArray(filters.sku_in)) {
                validFilters.sku_in = filters.sku_in;
            }
            
            if (typeof filters.tracking_number_exact === 'string') {
                validFilters.tracking_number_exact = filters.tracking_number_exact;
            }
        }

        // Initialize RAG service and perform search
        const ragQueryService = new RagQueryService();
        const results = await ragQueryService.queryWithRag(
            query,
            customerContext,
            validFilters
        );

        return NextResponse.json(results);
    } catch (error: any) {
        console.error('[API RAG Search] Error:', error);
        return NextResponse.json({ 
            message: 'Error performing RAG search', 
            error: error.message 
        }, { status: 500 });
    }
} 