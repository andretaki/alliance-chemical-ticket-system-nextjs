import { NextResponse, NextRequest } from 'next/server';
import * as graphService from '@/lib/graphService';
import { db } from '@/db';
import { tickets, users, ticketPriorityEnum, ticketStatusEnum, ticketTypeEcommerceEnum } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { analyzeEmailContent } from '@/lib/aiService';
import { processSingleEmail } from '@/lib/emailProcessor';
import { ticketEventEmitter } from '@/lib/eventEmitter';

// Constants from your process-emails route (or a shared config)
const PROCESSED_FOLDER_NAME = process.env.PROCESSED_FOLDER_NAME || "Processed";
const ERROR_FOLDER_NAME = process.env.ERROR_FOLDER_NAME || "Error";
const INTERNAL_DOMAIN = "alliancechemical.com"; // Or from ENV
const DEFAULT_PRIORITY = ticketPriorityEnum.enumValues[1]; // 'medium'
const DEFAULT_STATUS = ticketStatusEnum.enumValues[0]; // 'new'
const DEFAULT_TYPE = 'General Inquiry' as typeof ticketTypeEcommerceEnum.enumValues[number];

// Helper function to find or create a user based on email
async function findOrCreateUserWebhook(senderEmail: string, senderName?: string | null): Promise<string | null> {
    if (!senderEmail) return null;
    
    try {
        let user = await db.query.users.findFirst({ 
            where: eq(users.email, senderEmail), 
            columns: { id: true }
        });
        
        if (user) return user.id;
        
        const [newUser] = await db.insert(users).values({
            email: senderEmail, 
            name: senderName || senderEmail.split('@')[0], 
            password: null,
            role: 'user', 
            isExternal: true,
        }).returning({ id: users.id });
        
        return newUser.id;
    } catch (error) {
        console.error(`Webhook: Error finding or creating user for ${senderEmail}:`, error);
        return null;
    }
}

// Helper function to create a ticket from an email
async function createTicketFromEmail(email: any, reporterId: string) {
    try {
        const subject = email.subject || "No Subject";
        const body = email.body?.contentType === 'text' 
            ? email.body.content 
            : email.bodyPreview || '';

        let aiAnalysis = null;
        
        try {
            aiAnalysis = await analyzeEmailContent(subject, body);
        } catch (aiError) {
            console.error(`Webhook: AI Analysis Error for email ${email.id}:`, aiError);
            // Continue with default values if AI analysis fails
        }

        const ticketData = {
            title: aiAnalysis?.summary?.substring(0, 255) || subject.substring(0, 255),
            description: body,
            reporterId,
            priority: aiAnalysis?.prioritySuggestion || DEFAULT_PRIORITY,
            status: DEFAULT_STATUS,
            type: (aiAnalysis?.ticketType && ticketTypeEcommerceEnum.enumValues.includes(aiAnalysis.ticketType as any))
                  ? aiAnalysis.ticketType as typeof ticketTypeEcommerceEnum.enumValues[number]
                  : DEFAULT_TYPE,
            orderNumber: aiAnalysis?.orderNumber || null,
            trackingNumber: aiAnalysis?.trackingNumber || null,
            senderEmail: email.sender?.emailAddress?.address,
            senderName: email.sender?.emailAddress?.name,
            externalMessageId: email.internetMessageId,
        };

        const [newTicket] = await db.insert(tickets).values(ticketData).returning({ id: tickets.id });
        console.log(`Webhook: Created ticket ${newTicket.id} for email ${email.id}. AI Used: ${!!aiAnalysis}`);
        
        // Emit event for the new ticket
        ticketEventEmitter.emit({
            type: 'ticket_created',
            ticketId: newTicket.id
        });
        
        return newTicket;
    } catch (error) {
        console.error(`Webhook: Error creating ticket for email ${email.id}:`, error);
        throw error;
    }
}

export async function POST(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const validationToken = searchParams.get('validationToken');

    // 1. Handle Subscription Validation Request
    if (validationToken) {
        console.log('Webhook: Received validation token:', validationToken);
        return new NextResponse(validationToken, {
            status: 200,
            headers: {
                'Content-Type': 'text/plain',
                'Content-Length': validationToken.length.toString()
            },
        });
    }

    // 2. Handle Actual Notifications
    try {
        // Check if the request has content before attempting to parse JSON
        const contentType = request.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            console.warn('Webhook: Received request with invalid content type:', contentType);
            return NextResponse.json({ message: 'Invalid content type' }, { status: 400 });
        }

        // Get the request body text and verify it's not empty
        const bodyText = await request.text();
        if (!bodyText || bodyText.trim() === '') {
            console.warn('Webhook: Received empty request body');
            return NextResponse.json({ message: 'Empty request body' }, { status: 202 });
        }

        // Now safely parse the JSON
        const notificationPayload = JSON.parse(bodyText);
        console.log('Webhook: Received notification'); // Don't log full payload by default
        
        // Log essential details for debugging
        console.log(`Webhook: Notification details - Type: ${notificationPayload.changeType || 'N/A'}, Resource count: ${notificationPayload?.value?.length || 0}`);
        
        if (notificationPayload?.value?.length > 0) {
            for (const notification of notificationPayload.value) {
                // Verify clientState (Keep this)
                if (process.env.MICROSOFT_GRAPH_WEBHOOK_SECRET &&
                    notification.clientState !== process.env.MICROSOFT_GRAPH_WEBHOOK_SECRET) {
                    console.warn('Webhook: Invalid clientState. Ignoring notification.');
                    continue;
                }

                if (notification.resource && notification.changeType === 'created') {
                    const messageId = notification.resourceData?.id;
                    if (!messageId) {
                        console.warn('Webhook: Notification received without message ID.');
                        continue;
                    }
                    console.log(`Webhook: Processing notification for Message ID: ${messageId}`);

                    // Fetch the full message details
                    const emailMessage = await graphService.getMessageById(messageId);

                    if (emailMessage) {
                        // Call the centralized processing function
                        const result = await processSingleEmail(emailMessage);
                        if (!result.success && !result.skipped) {
                            // Log errors that weren't just skips
                             console.error(`Webhook: Failed to process email ${messageId}: ${result.message}`);
                        }
                    } else {
                        console.error(`Webhook: Could not fetch details for message ID: ${messageId}. Email might have been moved/deleted quickly.`);
                        // Consider attempting to move based only on ID if an error folder exists
                    }
                } else {
                     console.log(`Webhook: Received notification type ${notification.changeType} for resource ${notification.resource}. Ignoring (only processing 'created').`);
                }
            }
        }

        // Always return 202 for notifications
        return NextResponse.json({ message: 'Notification received' }, { status: 202 });
    } catch (error: any) {
        console.error('Webhook: Error processing notification payload:', error);
        
        // Add more detailed error info
        if (error instanceof SyntaxError) {
            console.error('Webhook: JSON parsing error - likely malformed payload');
        }
        
        // Always return 202 even for errors to prevent Microsoft Graph from deactivating subscription
        return NextResponse.json({ message: 'Error processing notification but accepted' }, { status: 202 });
    }
} 