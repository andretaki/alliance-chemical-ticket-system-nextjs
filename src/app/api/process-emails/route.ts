export const runtime = 'nodejs';

import { NextResponse, NextRequest } from 'next/server';
import * as graphService from '@/lib/graphService';
import { db } from '@/lib/db';
import { users, tickets, ticketPriorityEnum, ticketStatusEnum, ticketTypeEcommerceEnum } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { Message } from '@microsoft/microsoft-graph-types';
import { analyzeEmailContent } from '@/lib/aiService'; // Import the AI service
import { getServerSession } from "next-auth/next"; // Add this
import { authOptions } from '@/lib/authOptions';   // Add this

// Configuration (Consider moving to a config file or ENV vars)
const PROCESSED_FOLDER_NAME = process.env.PROCESSED_FOLDER_NAME || "Processed";
const ERROR_FOLDER_NAME = process.env.ERROR_FOLDER_NAME || "Error";
const DEFAULT_PRIORITY = ticketPriorityEnum.enumValues[1]; // 'medium'
const DEFAULT_STATUS = ticketStatusEnum.enumValues[0]; // 'new'
const DEFAULT_TYPE = 'General Inquiry' as typeof ticketTypeEcommerceEnum.enumValues[number];
const INTERNAL_DOMAIN = "alliancechemical.com"; // Define your internal domain

// Helper to find or create a user based on email
async function findOrCreateUser(senderEmail: string, senderName?: string | null): Promise<string | null> {
    if (!senderEmail) {
        console.warn("Email processing: Sender email missing.");
        return null; // Cannot create a user without an email
    }

    try {
        let user = await db.query.users.findFirst({
            where: eq(users.email, senderEmail),
            columns: { id: true }
        });

        if (user) {
            return user.id;
        } else {
            // User doesn't exist, create a basic user record
            console.log(`Email processing: Creating new external user for ${senderEmail}`);
            const [newUser] = await db.insert(users).values({
                email: senderEmail,
                name: senderName || senderEmail.split('@')[0], // Use name part of email if no name provided
                password: null, // Password is now nullable for external users
                role: 'user', // Or a specific role for email reporters
                isExternal: true, // Mark as an externally created user
            }).returning({ id: users.id });
            return newUser.id;
        }
    } catch (error) {
        console.error(`Email processing: Error finding or creating user for ${senderEmail}:`, error);
        return null; // Return null if user creation/lookup fails
    }
}

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
            errorDetails: result.errors > 0 ? result.results.filter(r => !r.success).map(r => r.message) : []
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