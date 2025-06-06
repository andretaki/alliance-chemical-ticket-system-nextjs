export const runtime = 'nodejs';

import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/lib/authOptions';
import { processUnreadEmails } from '@/lib/emailProcessor';

// --- POST Endpoint to Trigger Batch Processing ---
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
        const session = await getServerSession(authOptions);
        if (session?.user?.id) { // Check if any authenticated user session exists
            authorized = true;
            console.log(`API: Authorized via authenticated user session: ${session.user.email}`);
        }
    }

    if (!authorized) {
        console.warn("API: Unauthorized email processing attempt");
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // --- End Security Check ---

    console.log("API: Starting batch email processing...");
    try {
        // Call the batch processing function with a limit of 50 emails
        const result = await processUnreadEmails(50);
        
        console.log(`API: Batch processing complete. Success: ${result.success}, New Tickets: ${result.processed}, Comments: ${result.commentAdded}`);
        
        return NextResponse.json({
            message: result.message,
            processed: result.processed,
            commentAdded: result.commentAdded,
            errors: result.errors,
            skipped: result.skipped,
            discarded: result.discarded,
            quarantined: result.quarantined,
            automationAttempts: result.automationAttempts,
            automationSuccess: result.automationSuccess,
            errorDetails: result.errors > 0 ? result.results.filter((r: any) => !r.success).map((r: any) => r.message) : []
        });
    } catch (error: any) {
        console.error("API Error: Failed during batch processing:", error);
        return NextResponse.json({ 
            error: `Batch processing failed: ${error.message}`,
            processed: 0,
            commentAdded: 0,
            errors: 1,
            skipped: 0,
            discarded: 0,
            quarantined: 0,
            automationAttempts: 0,
            automationSuccess: 0,
            errorDetails: [`Critical error: ${error.message}`]
        }, { status: 500 });
    }
} 