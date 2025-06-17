// src/lib/graphService.ts
import 'dotenv/config';
import { ClientSecretCredential } from '@azure/identity';
import { Client, GraphRequest } from '@microsoft/microsoft-graph-client';
import { Message, MailFolder, InternetMessageHeader } from '@microsoft/microsoft-graph-types';
import { db } from '@/lib/db';
import { subscriptions, userSignatures } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import 'isomorphic-fetch'; // Required for the Graph client

// Load environment variables
const tenantId = process.env.MICROSOFT_GRAPH_TENANT_ID;
const clientId = process.env.MICROSOFT_GRAPH_CLIENT_ID;
const clientSecret = process.env.MICROSOFT_GRAPH_CLIENT_SECRET;
export const userEmail = process.env.SHARED_MAILBOX_ADDRESS || '';

if (!tenantId || !clientId || !clientSecret || !userEmail) {
  throw new Error('Microsoft Graph configuration is incomplete. Check your .env file.');
}

const selectProps = 'id,subject,body,sender,from,toRecipients,ccRecipients,isRead,createdDateTime,receivedDateTime,sentDateTime,lastModifiedDateTime,parentFolderId,conversationId,internetMessageId,internetMessageHeaders';

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;
const TIMEOUT_MS = 30000; // 30 seconds timeout

async function withRetry<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const result = await Promise.race([
        operation(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Operation ${operationName} timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
        )
      ]) as T;
      
      return result;
    } catch (error: any) {
      lastError = error;
      console.error(`Attempt ${attempt}/${RETRY_ATTEMPTS} failed for ${operationName}:`, error);
      
      if (attempt < RETRY_ATTEMPTS) {
        const delay = RETRY_DELAY_MS * attempt; // Exponential backoff
        console.log(`Retrying ${operationName} in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw new Error(`All ${RETRY_ATTEMPTS} attempts failed for ${operationName}. Last error: ${lastError.message}`);
}

// Create credential and authentication provider
const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

const authProvider = new TokenCredentialAuthenticationProvider(credential, {
  scopes: ['https://graph.microsoft.com/.default'],
});

// Initialize the Graph client
export const graphClient = Client.initWithMiddleware({ authProvider });

/**
 * Get unread emails from the inbox
 * @param limit Maximum number of emails to fetch
 * @returns Array of unread Message objects
 */
export async function getUnreadEmails(limit = 50): Promise<Message[]> {
  try {
    const response = await graphClient
      .api(`/users/${userEmail}/mailFolders/inbox/messages`)
      .select(selectProps)
      .filter('isRead eq false')
      .top(limit)
      .get();

    return response.value as Message[];
  } catch (error) {
    console.error('Error fetching unread emails:', error);
    throw error;
  }
}

/**
 * Mark an email as read
 * @param messageId The ID of the email to mark as read
 */
export async function markEmailAsRead(messageId: string): Promise<void> {
  try {
    await graphClient
      .api(`/users/${userEmail}/messages/${messageId}`)
      .update({
        isRead: true
      });
  } catch (error: any) {
    // Handle 404 errors gracefully - emails can be moved/deleted quickly
    if (error.statusCode === 404 || error.code === 'ErrorItemNotFound') {
      console.log(`Email ${messageId} not found when marking as read - likely moved/deleted (normal for webhooks)`);
    } else {
      console.error(`Error marking email ${messageId} as read:`, error);
      throw error;
    }
  }
}

/**
 * Move an email to a different folder
 * @param messageId The ID of the email to move
 * @param destinationFolderId The ID of the destination folder
 */
// export async function moveEmail(messageId: string, destinationFolderId: string): Promise<void> {
//   try {
//     await graphClient
//       .api(`/users/${userEmail}/messages/${messageId}/move`)
//       .post({
//         destinationId: destinationFolderId
//       });
//   } catch (error) {
//     console.error(`Error moving email ${messageId} to folder ${destinationFolderId}:`, error);
//     throw error;
//   }
// }

/**
 * Get the ID of a mail folder by name
 * @param folderName The name of the folder to find
 * @returns The folder ID, or null if not found
 */
// export async function getFolderId(folderName: string): Promise<string | null> {
//   try {
//     const response = await graphClient
//       .api(`/users/${userEmail}/mailFolders`)
//       .filter(`displayName eq '${folderName}'`)
//       .get();

//     const folders = response.value as MailFolder[];
//     if (folders && folders.length > 0) {
//       return folders[0].id || null;
//     }
//     return null;
//   } catch (error) {
//     console.error(`Error finding folder ID for "${folderName}":`, error);
//     throw error;
//   }
// }

/**
 * Create a mail folder if it doesn't exist
 * @param folderName The name of the folder to create
 * @returns The ID of the created or existing folder
 */
// export async function createFolderIfNotExists(folderName: string): Promise<string> {
//   try {
//     // First check if folder exists
//     const existingId = await getFolderId(folderName);
//     if (existingId) {
//       return existingId;
//     }

//     // Create folder if it doesn't exist
//     const response = await graphClient
//       .api(`/users/${userEmail}/mailFolders`)
//       .post({
//         displayName: folderName
//       });

//     return response.id;
//   } catch (error) {
//     console.error(`Error creating folder "${folderName}":`, error);
//     throw error;
//   }
// }

interface ThreadingInfo {
  inReplyToId?: string | null;
  referencesIds?: string[] | null;
  conversationId?: string | null;
}

interface FileAttachment {
  name: string;
  contentType: string;
  contentBytes: string;
}

/**
 * Sends an email reply using Microsoft Graph API, using provided threading information.
 * @param toEmailAddress The recipient's email address.
 * @param subject The subject of the reply email.
 * @param messageContent The HTML content of the reply.
 * @param threadingInfo Object containing inReplyToId, referencesIds, conversationId or a Message object.
 * @param fromEmailAddress The email address to send from (e.g., your shared mailbox).
 * @param attachments Optional array of file attachments.
 * @param userId Optional user ID to fetch their signature.
 * @returns The sent message object or null if sending fails.
 */
export async function sendEmailReply(
  toEmailAddress: string,
  subject: string,
  messageContent: string, 
  threadingInfo: ThreadingInfo | Message,
  fromEmailAddress: string = userEmail,
  attachments?: FileAttachment[],
  userId?: string
): Promise<Message | null> {
  try {
    // Helper to check for greetings in message content
    const containsGreeting = (text: string): boolean => {
      const lowerText = text.toLowerCase().trim();
      // Check for greetings at the start of content
      return /^(hi|hello|dear)\s/i.test(lowerText) ||
             lowerText.includes('\nhi ') || lowerText.includes('\nhello ') ||
             lowerText.includes('\ndear ');
    };

    // Get user's signature if userId is provided
    let signature = '';
    if (userId) {
      const userSignature = await db.query.userSignatures.findFirst({
        where: and(
          eq(userSignatures.userId, userId),
          eq(userSignatures.isDefault, true)
        ),
      });
      if (userSignature) {
        signature = userSignature.signature;
      }
    }

    // Extract threading information regardless of input type
    let conversationId: string | undefined;
    let inReplyToId: string | undefined;
    let referencesIds: string[] = [];
    
    if ('conversationId' in threadingInfo) {
      conversationId = threadingInfo.conversationId || undefined;
    } else if (threadingInfo.conversationId) {
      conversationId = threadingInfo.conversationId;
    }
    
    if ('internetMessageId' in threadingInfo) {
      inReplyToId = threadingInfo.internetMessageId || undefined;
    } else if ('inReplyToId' in threadingInfo && threadingInfo.inReplyToId) {
      inReplyToId = threadingInfo.inReplyToId;
    }
    
    if ('internetMessageHeaders' in threadingInfo) {
      const referencesHeader = threadingInfo.internetMessageHeaders?.find(
        header => header.name?.toLowerCase() === 'references'
      );
      if (referencesHeader?.value) {
        referencesIds = referencesHeader.value.split(' ');
      }
    } else if ('referencesIds' in threadingInfo && threadingInfo.referencesIds) {
      referencesIds = threadingInfo.referencesIds;
    }
    
    // 1. Process the AI's messageContent (plain text with \n and markdown) into HTML
    let aiMessageHtml = messageContent;
    
    // Convert multiple types of markdown bold formatting
    // Handle triple asterisks ***text*** (priority - process first)
    aiMessageHtml = aiMessageHtml.replace(/\*\*\*(.*?)\*\*\*/g, '<strong>$1</strong>');
    // Handle double asterisks **text**
    aiMessageHtml = aiMessageHtml.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Process paragraphs more intelligently
    // First, normalize line endings and handle multiple consecutive newlines
    aiMessageHtml = aiMessageHtml
      .replace(/\r\n/g, '\n') // Normalize Windows line endings
      .replace(/\r/g, '\n')   // Normalize old Mac line endings
      .replace(/\n{3,}/g, '\n\n'); // Collapse multiple newlines to double newlines
    
    // Split into paragraphs by double newlines, but also handle single newlines as breaks
    const paragraphs = aiMessageHtml.split(/\n\s*\n/);
    
    if (paragraphs.length > 1) {
      // Multiple paragraphs found
      aiMessageHtml = paragraphs
        .map(paragraph => {
          const trimmed = paragraph.trim();
          if (!trimmed) return '';
          // Convert single newlines within paragraphs to <br />
          const withBreaks = trimmed.replace(/\n/g, '<br />');
          return `<p>${withBreaks}</p>`;
        })
        .filter(paragraph => paragraph) // Remove empty paragraphs
        .join('');
    } else {
      // Single paragraph, but may contain line breaks
      const trimmed = aiMessageHtml.trim();
      if (trimmed) {
        // Split by single newlines and join with <br /> tags, then wrap in <p>
        const withBreaks = trimmed.replace(/\n/g, '<br />');
        aiMessageHtml = `<p>${withBreaks}</p>`;
      } else {
        aiMessageHtml = '<p></p>';
      }
    }

    // 2. Get user's DB signature (this might already be HTML)
    let dbSignatureHtml = '';
    if (signature) {
      // If signature is plain text, convert its newlines. If HTML, use as is.
      if (!/<[a-z][\s\S]*>/i.test(signature)) { // Simple HTML check
        dbSignatureHtml = signature.replace(/\n/g, '<br />');
      } else {
        dbSignatureHtml = signature;
      }
    }

    // 3. Construct the final HTML body
    const greetingHtml = containsGreeting(messageContent) ? '' : `<p>Hello,</p>`;
    
    const finalHtmlBody = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; }
    p { margin-bottom: 10px; }
    a { color: #0078d4; text-decoration: none; }
    strong { font-weight: bold; }
  </style>
</head>
<body>
  <div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6;">
    ${greetingHtml}
    ${aiMessageHtml}
    ${dbSignatureHtml ? `<br /><div>${dbSignatureHtml}</div>` : `<br /><p>Best regards</p>`}
  </div>
</body>
</html>`;
    
    // Create a message object to send
    const messageToSend: any = {
      subject,
      body: {
        contentType: 'HTML',
        content: finalHtmlBody,
      },
      toRecipients: [
        {
          emailAddress: {
            address: toEmailAddress,
          },
        },
      ],
      // Add CC to sales mailbox
      ccRecipients: [
        {
          emailAddress: {
            address: 'sales@alliancechemical.com',
          },
        },
      ],
      // Initialize an empty array for custom headers
      internetMessageHeaders: []
    };

    // Add threading information if available
    if (inReplyToId) {
      messageToSend.internetMessageHeaders.push({
        name: 'x-in-reply-to',
        value: inReplyToId
      });
    }

    if (referencesIds.length > 0) {
      messageToSend.internetMessageHeaders.push({
        name: 'x-references',
        value: referencesIds.join(' ')
      });
    }

    if (conversationId) {
      messageToSend.conversationId = conversationId;
    }

    // Add attachments if provided
    if (attachments && attachments.length > 0) {
      messageToSend.attachments = attachments.map(att => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: att.name,
        contentType: att.contentType,
        contentBytes: att.contentBytes
      }));
    }

    // Send the email with retry logic
    const response = await withRetry(
      () => graphClient
        .api(`/users/${fromEmailAddress}/sendMail`)
        .post({
          message: messageToSend,
          saveToSentItems: true
        }),
      'sendEmailReply'
    );

    return response;
  } catch (error) {
    console.error('Error sending email reply:', error);
    throw error; // Let the caller handle the error
  }
}

/**
 * NEW AND IMPROVED: Fetches a single message by its globally unique Internet Message ID.
 * This is more reliable than the internal ID for finding messages that might have been moved.
 * @param internetMessageId The Internet Message ID of the email to fetch.
 * @returns The message object or null if not found.
 */
export async function getMessageByInternetId(internetMessageId: string): Promise<Message | null> {
  if (!internetMessageId) {
    console.warn("graphService.getMessageByInternetId was called with an empty ID.");
    return null;
  }
  
  try {
    // The 'internetMessageId' property IS filterable.
    // Note the single quotes around the ID in the filter string.
    const encodedId = encodeURIComponent(internetMessageId).replace(/'/g, "''"); // Proper escaping
    const response = await graphClient
      .api(`/users/${userEmail}/messages`)
      .select(selectProps)
      .filter(`internetMessageId eq '${encodedId}'`)
      .get();

    if (response && response.value && response.value.length > 0) {
      return response.value[0];
    }
    
    console.warn(`Could not find message with internetMessageId ${internetMessageId} in any folder.`);
    return null;
    
  } catch (error: any) {
    console.error(`Error getting message by internetMessageId ${internetMessageId}:`, error);
    return null;
  }
}

/**
 * Fetches a single message by its ID from any folder.
 * so the email might have been moved from the Inbox.
 * @param messageId The ID of the message to fetch.
 * @returns The message object or null if not found.
 */
// We can now remove or deprecate the old getMessageById if you wish,
// but let's keep it for now and just not use it in the cron job.
export async function getMessageById(messageId: string): Promise<Message | null> {
  if (!messageId) {
    console.warn("graphService.getMessageById was called with an empty ID.");
    return null;
  }
  
  try {
    // This new API call searches ALL folders for the message ID.
    const response = await graphClient
      .api(`/users/${userEmail}/messages`)
      .select(selectProps)
      .filter(`id eq '${messageId}'`)
      .get();

    // The response will be a collection (even if it's just one item).
    // We need to return the first item from the 'value' array.
    if (response && response.value && response.value.length > 0) {
      return response.value[0];
    }

    // If no message was found, return null.
    console.warn(`Could not find message with ID ${messageId} in any folder.`);
    return null;
    
  } catch (error: any) {
    console.error(`Error getting message ${messageId} by filter:`, error);
    // Add specific logging for 404, although a filter shouldn't 404, just return empty.
    if (error.statusCode === 404) {
      console.error(`Received a 404, which is unexpected for a filter query. Mailbox: ${userEmail}`);
    }
    return null;
  }
}

/**
 * Gets just the internetMessageId from an email. This is a lightweight call.
 * @param messageId The Graph internal message ID.
 * @returns The message object containing headers or null.
 */
export async function getEmailHeaders(messageId: string): Promise<{ internetMessageId?: string | null } | null> {
  try {
    return await graphClient
      .api(`/users/${userEmail}/messages/${messageId}`)
      .select('internetMessageId')
      .get();
  } catch (error: any) {
    if (error.statusCode === 404) {
      console.warn(`getEmailHeaders: Message ${messageId} not found. It may have been moved or deleted.`);
    } else {
      console.error(`Error getting headers for message ${messageId}:`, error);
    }
    return null;
  }
}

/**
 * Creates a new Microsoft Graph subscription for new emails with direct parameters.
 * @param notificationUrl The URL of your webhook endpoint.
 * @param clientState A secret string for validation (optional but recommended).
 * @param validationTimeout The timeout in seconds for subscription validation (optional).
 * @returns The created subscription object or null.
 */
export async function createEmailSubscription(
  notificationUrl: string,
  clientState?: string,
  validationTimeout?: number
): Promise<any | null> {
  const expirationDateTime = new Date();
  expirationDateTime.setDate(expirationDateTime.getDate() + 2); // Expires in 2 days (adjust as needed, max usually 3 for mail)

  const subscription = {
    changeType: 'created',
    notificationUrl: notificationUrl,
    resource: `/users/${userEmail}/mailFolders/inbox/messages`, // Or just /users/${userEmail}/messages
    expirationDateTime: expirationDateTime.toISOString(),
    clientState: clientState || process.env.MICROSOFT_GRAPH_WEBHOOK_SECRET || "DefaultSecretState", // Use a secret
    latestSupportedTlsVersion: "v1_2", // Recommended by Microsoft
    ...(validationTimeout && { validationTimeout }) // Add validationTimeout if provided
  };

  try {
    console.log('Attempting to create subscription:', JSON.stringify(subscription, null, 2));
    const response = await graphClient
      .api('/subscriptions')
      .post(subscription);
    console.log('Subscription created successfully:', response);
    return response;
  } catch (error: any) {
    console.error('Error creating subscription:', JSON.stringify(error, null, 2));
    if (error.body) {
        try {
            const errorBody = JSON.parse(error.body);
            console.error('Error details:', errorBody.error);
        } catch (e) {
            console.error('Error body:', error.body);
        }
    }
    return null;
  }
}

/**
 * Renews an existing Microsoft Graph subscription.
 * @param subscriptionId The ID of the subscription to renew.
 * @returns The updated subscription object or null.
 */
export async function renewSubscription(subscriptionId: string): Promise<any | null> {
  const newExpirationDateTime = new Date();
  newExpirationDateTime.setDate(newExpirationDateTime.getDate() + 2); // Renew for another 2 days

  try {
    const response = await graphClient
      .api(`/subscriptions/${subscriptionId}`)
      .update({
        expirationDateTime: newExpirationDateTime.toISOString()
      });
    console.log(`Subscription ${subscriptionId} renewed successfully:`, response);
    return response;
  } catch (error: any) {
    console.error(`Error renewing subscription ${subscriptionId}:`, error);
    if (error.body) {
      try {
        const errorBody = JSON.parse(error.body);
        console.error('Error details:', errorBody.error);
      } catch (e) {
        console.error('Error body:', error.body);
      }
    }
    return null;
  }
}

/**
 * Lists all active subscriptions for the application.
 * @returns Array of subscription objects.
 */
export async function listSubscriptions(): Promise<any[]> {
  try {
    const response = await withRetry(
      () => graphClient.api('/subscriptions').get(),
      'listSubscriptions'
    );
    // Extract the 'value' array which contains the subscriptions
    return response.value || []; // Ensure it returns an empty array if 'value' is missing or response is unexpected
  } catch (error) {
    console.error('Error in listSubscriptions:', error);
    return []; // Return an empty array on error to prevent iteration issues
  }
}

/**
 * Deletes a specific subscription.
 * @param subscriptionId The ID of the subscription to delete.
 * @returns True if successful, false otherwise.
 */
export async function deleteSubscription(subscriptionId: string): Promise<boolean> {
  return withRetry(
    () => graphClient.api(`/subscriptions/${subscriptionId}`).delete(),
    `deleteSubscription(${subscriptionId})`
  );
}

/**
 * Flag an email without marking it as read
 * @param messageId The ID of the email to flag
 */
export async function flagEmail(messageId: string): Promise<void> {
  try {
    // The 'flag' property for messages is a followupFlag type
    // Microsoft Graph API only supports flagStatus, not color
    await graphClient
      .api(`/users/${userEmail}/messages/${messageId}`)
      .update({
        flag: {
          flagStatus: 'flagged'
          // Note: Microsoft Graph API doesn't support color property on followupFlag
          // Colors are managed by the client (Outlook) based on flag status
        }
      });
      console.log(`[GraphService] Successfully flagged email ${messageId}.`);
  } catch (error: any) {
    const errorMessage = `Error flagging email ${messageId}.`;
    console.error(`[GraphService] ${errorMessage}`, error);
    // Add specific checks for common errors if needed
    if (error.code === 'ErrorItemNotFound') {
        console.warn(`[GraphService] Attempted to flag an email (${messageId}) that was not found.`);
    }
    // Re-throw to allow the calling function to handle it (e.g., for alerting)
    throw error;
  }
}

/**
 * Unflag an email (remove flag)
 * @param messageId The ID of the email to unflag
 */
export async function unflagEmail(messageId: string): Promise<void> {
  try {
    await graphClient
      .api(`/users/${userEmail}/messages/${messageId}`)
      .update({
        flag: {
          flagStatus: 'notFlagged'
        }
      });
  } catch (error) {
    console.error(`Error unflagging email ${messageId}:`, error);
    throw error;
  }
}

export async function getMessage(messageId: string): Promise<Message> {
  return withRetry(
    () => graphClient.api(`/users/${userEmail}/messages/${messageId}`).select(selectProps).get(),
    `getMessage(${messageId})`
  );
}

export async function checkSubscriptionHealth(subscriptionId: string) {
  try {
    const subscription = await withRetry(
      () => graphClient.api(`/subscriptions/${subscriptionId}`).get(),
      `checkSubscriptionHealth(${subscriptionId})`
    );
    
    return {
      isHealthy: true,
      subscription,
      expiresAt: new Date(subscription.expirationDateTime)
    };
  } catch (error: any) {
    return {
      isHealthy: false,
      error: error.message,
      subscriptionId
    };
  }
}

/**
 * Send a simple email without threading headers (for new conversations like invoices)
 * @param toEmailAddress Email address to send to
 * @param subject Email subject
 * @param messageContent HTML message content
 * @param fromEmailAddress From email address (defaults to userEmail)
 * @param attachments Optional file attachments
 * @param userId Optional user ID for signature lookup
 * @returns Promise<Message | null>
 */
export async function sendEmail(
  toEmailAddress: string,
  subject: string,
  messageContent: string,
  fromEmailAddress: string = userEmail,
  attachments?: FileAttachment[],
  userId?: string
): Promise<Message | null> {
  try {
    // Get user's signature if userId is provided
    let signature = '';
    if (userId) {
      const userSignature = await db.query.userSignatures.findFirst({
        where: and(
          eq(userSignatures.userId, userId),
          eq(userSignatures.isDefault, true)
        ),
      });
      if (userSignature) {
        signature = userSignature.signature;
      }
    }

    // Process signature if it exists
    let dbSignatureHtml = '';
    if (signature) {
      // If signature is plain text, convert its newlines. If HTML, use as is.
      if (!/<[a-z][\s\S]*>/i.test(signature)) { // Simple HTML check
        dbSignatureHtml = signature.replace(/\n/g, '<br />');
      } else {
        dbSignatureHtml = signature;
      }
    }

    // Use the provided messageContent as-is (assuming it's already HTML formatted)
    const finalHtmlBody = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; }
    p { margin-bottom: 10px; }
    a { color: #0078d4; text-decoration: none; }
    strong { font-weight: bold; }
  </style>
</head>
<body>
  <div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6;">
    ${messageContent}
    ${dbSignatureHtml ? `<br /><div>${dbSignatureHtml}</div>` : ''}
  </div>
</body>
</html>`;

    // Create a simple message object to send (no threading headers)
    const messageToSend: any = {
      subject,
      body: {
        contentType: 'HTML',
        content: finalHtmlBody,
      },
      toRecipients: [
        {
          emailAddress: {
            address: toEmailAddress,
          },
        },
      ],
      // Add CC to sales mailbox
      ccRecipients: [
        {
          emailAddress: {
            address: 'sales@alliancechemical.com',
          },
        },
      ],
    };

    // Add attachments if provided
    if (attachments && attachments.length > 0) {
      messageToSend.attachments = attachments.map(att => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: att.name,
        contentType: att.contentType,
        contentBytes: att.contentBytes
      }));
    }

    // Send the email with retry logic
    const response = await withRetry(
      () => graphClient
        .api(`/users/${fromEmailAddress}/sendMail`)
        .post({
          message: messageToSend,
          saveToSentItems: true
        }),
      'sendEmail'
    );

    return response;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error; // Let the caller handle the error
  }
} 