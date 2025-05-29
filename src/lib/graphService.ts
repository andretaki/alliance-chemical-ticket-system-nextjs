// src/lib/graphService.ts
import 'dotenv/config';
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { Message, MailFolder, InternetMessageHeader } from '@microsoft/microsoft-graph-types';
import { db } from '@/db';
import { subscriptions, userSignatures } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

// Load environment variables
const tenantId = process.env.MICROSOFT_GRAPH_TENANT_ID;
const clientId = process.env.MICROSOFT_GRAPH_CLIENT_ID;
const clientSecret = process.env.MICROSOFT_GRAPH_CLIENT_SECRET;
const userEmail = process.env.SHARED_MAILBOX_ADDRESS || '';

if (!tenantId || !clientId || !clientSecret || !userEmail) {
  throw new Error('Microsoft Graph configuration is incomplete. Check your .env file.');
}

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

// Initialize the Graph client
const graphClient = Client.init({
  authProvider: async (done) => {
    try {
      const token = await credential.getToken(['https://graph.microsoft.com/.default']);
      done(null, token.token);
    } catch (error) {
      done(error, null);
    }
  }
});

/**
 * Get unread emails from the inbox
 * @param limit Maximum number of emails to fetch
 * @returns Array of unread Message objects
 */
export async function getUnreadEmails(limit = 20): Promise<Message[]> {
  try {
    const response = await graphClient
      .api(`/users/${userEmail}/mailFolders/inbox/messages`)
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
  } catch (error) {
    console.error(`Error marking email ${messageId} as read:`, error);
    throw error;
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
    
    // Process the message content to ensure proper HTML formatting
    let formattedContent = messageContent;
    
    // Add signature if available
    if (signature) {
      formattedContent += `\n\n${signature}`;
    }
    
    // Only apply formatting if it doesn't already contain HTML tags
    if (!formattedContent.includes('<html>') && !formattedContent.includes('<p>') && !formattedContent.includes('<div>')) {
      // Replace plain line breaks with HTML paragraph tags
      formattedContent = formattedContent
        .split('\n\n')
        .map(paragraph => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
        .join('');
        
      // Wrap in basic HTML structure
      formattedContent = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; }
    p { margin-bottom: 10px; }
    a { color: #0078d4; text-decoration: none; }
  </style>
</head>
<body>
  ${formattedContent}
</body>
</html>`;
    }
    
    // Create a message object to send
    const messageToSend: any = {
      subject,
      body: {
        contentType: 'HTML',
        content: formattedContent,
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
 * Get a specific email message by its ID.
 * @param messageId The ID of the message.
 * @returns The Message object or null if not found/error.
 */
export async function getMessageById(messageId: string): Promise<Message | null> {
  try {
    return await graphClient
      .api(`/users/${userEmail}/messages/${messageId}`)
      .get();
  } catch (error) {
    console.error(`Error getting message ${messageId}:`, error);
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
 * @param flagColor Optional flag color (red, blue, green, yellow, purple, orange)
 */
export async function flagEmail(messageId: string, flagColor: string = 'red'): Promise<void> {
  try {
    await graphClient
      .api(`/users/${userEmail}/messages/${messageId}`)
      .update({
        flag: {
          flagStatus: 'flagged'
        }
      });
  } catch (error) {
    console.error(`Error flagging email ${messageId}:`, error);
    throw error;
  }
}

export async function getMessage(messageId: string): Promise<Message> {
  return withRetry(
    () => graphClient.api(`/users/${userEmail}/messages/${messageId}`).get(),
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