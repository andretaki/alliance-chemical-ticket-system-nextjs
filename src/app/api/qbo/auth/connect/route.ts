import { NextResponse } from 'next/server';
import { getAuthUri } from '@/lib/qboService';
import { isQboConfigured } from '@/config/qboConfig';
import { apiError } from '@/lib/apiResponse';

export async function GET() {
    if (!isQboConfigured()) {
        return apiError('configuration_error', 'QuickBooks integration is not configured.', null, { status: 500 });
    }

    try {
        const authUri = getAuthUri();
        return NextResponse.redirect(authUri);
    } catch (error) {
        console.error('Error getting QBO auth URI:', error);
        return apiError('internal_error', 'Failed to initiate QuickBooks connection.', null, { status: 500 });
    }
} 