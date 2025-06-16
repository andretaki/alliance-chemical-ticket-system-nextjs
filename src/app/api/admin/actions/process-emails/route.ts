import { NextResponse, NextRequest } from 'next/server';
import { processUnreadEmails } from '@/lib/emailProcessor';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/lib/authOptions';

// Helper to verify admin permissions
async function verifyAdmin() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        throw new Error('Unauthorized: Authentication required');
    }
    
    // Check if the user has admin role
    if (session.user.role !== 'admin') {
        throw new Error('Forbidden: Admin permissions required');
    }
    
    return session.user;
}

export async function POST(request: NextRequest) {
    // --- Security Check ---
    let authorized = false;
    const apiKey = request.headers.get('x-api-key');
    const expectedKey = process.env.EMAIL_PROCESSING_SECRET_KEY;

    if (expectedKey && apiKey === expectedKey) {
        authorized = true;
        console.log("API: Authorized via X-API-Key header.");
    } else {
        // If secret is not provided or incorrect, check for authenticated session
        try {
            await verifyAdmin();
            authorized = true;
            console.log("API: Authorized via admin session.");
        } catch (error: any) {
            console.warn("API: Unauthorized email processing attempt:", error.message);
            return NextResponse.json({ error: error.message }, { 
                status: error.message.includes('Unauthorized') ? 401 : 403 
            });
        }
    }

    if (!authorized) {
        console.warn("API: Unauthorized email processing attempt");
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // --- End Security Check ---

    try {
        console.log('API Route: Starting email processing via POST...');
        const result = await processUnreadEmails(); // Call the batch processor
        console.log('API Route: Email processing completed.', result);
        return NextResponse.json(result); // Return the detailed result object

    } catch (error: any) {
        console.error('API Route Error processing emails:', error);
        return NextResponse.json({
            success: false,
            error: 'Failed to process emails',
            message: error?.message || 'Unknown error',
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
} 