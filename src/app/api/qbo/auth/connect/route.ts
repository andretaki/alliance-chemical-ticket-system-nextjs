import { NextRequest, NextResponse } from 'next/server';
import { getAuthUri } from '@/lib/qboService';
import { isQboConfigured } from '@/config/qboConfig';

export async function GET(request: NextRequest) {
    if (!isQboConfigured()) {
        return NextResponse.json({ error: 'QuickBooks integration is not configured.' }, { status: 500 });
    }

    try {
        const authUri = getAuthUri();
        return NextResponse.redirect(authUri);
    } catch (error) {
        console.error('Error getting QBO auth URI:', error);
        return NextResponse.json({ error: 'Failed to initiate QuickBooks connection.' }, { status: 500 });
    }
} 