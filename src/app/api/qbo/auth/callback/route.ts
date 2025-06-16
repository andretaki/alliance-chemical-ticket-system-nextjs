import { NextRequest, NextResponse } from 'next/server';
import { handleCallback } from '@/lib/qboService';

export async function GET(request: NextRequest) {
    const fullUrl = request.url;

    if (!fullUrl) {
        return new Response('Error: URL not found in request.', { status: 400 });
    }
    
    try {
        await handleCallback(fullUrl);
        // On successful connection, redirect to the main page or a settings page
        const redirectUrl = new URL('/', request.nextUrl.origin);
        redirectUrl.searchParams.set('qbo_status', 'connected');
        return NextResponse.redirect(redirectUrl.toString());
    } catch (error) {
        console.error('QBO Callback Error:', error);
        // Redirect to an error page or show an error message
        const redirectUrl = new URL('/', request.nextUrl.origin);
        redirectUrl.searchParams.set('qbo_status', 'error');
        return NextResponse.redirect(redirectUrl.toString());
    }
} 