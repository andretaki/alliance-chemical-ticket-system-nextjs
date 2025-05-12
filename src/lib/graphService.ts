// src/lib/graphService.ts
import 'dotenv/config';
import { ClientSecretCredential } from '@azure/identity';
import { Client, PageCollection } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import { Message, MailFolder, InternetMessageHeader } from '@microsoft/microsoft-graph-types';

// Load environment variables
const tenantId = process.env.MICROSOFT_GRAPH_TENANT_ID;
const clientId = process.env.MICROSOFT_GRAPH_CLIENT_ID;
const clientSecret = process.env.MICROSOFT_GRAPH_CLIENT_SECRET;
const userEmail = process.env.MICROSOFT_GRAPH_USER_EMAIL || 'sales@alliancechemical.com';

// Validate required environment variables
if (!tenantId || !clientId || !clientSecret) {
  console.error('Missing required Microsoft Graph environment variables.');
  throw new Error('Microsoft Graph configuration is incomplete. Check your .env file.');
}

// Create credential and authentication provider
const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
const authProvider = new TokenCredentialAuthenticationProvider(credential, {
  scopes: ['https://graph.microsoft.com/.default']
});

// Initialize Microsoft Graph client
const graphClient = Client.initWithMiddleware({
  authProvider,
  defaultVersion: 'v1.0'
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

/**
 * Sends an email reply using Microsoft Graph API, using provided threading information.
 * @param toEmailAddress The recipient's email address.
 * @param subject The subject of the reply email.
 * @param messageContent The HTML content of the reply.
 * @param threadingInfo Object containing inReplyToId, referencesIds, conversationId or a Message object.
 * @param fromEmailAddress The email address to send from (e.g., your shared mailbox).
 * @returns The sent message object or null if sending fails.
 */
export async function sendEmailReply(
  toEmailAddress: string,
  subject: string,
  messageContent: string, 
  threadingInfo: ThreadingInfo | Message,
  fromEmailAddress: string = userEmail
): Promise<Message | null> {
  try {
    // Extract threading information regardless of input type
    let conversationId: string | undefined;
    
    // Process the message content to ensure proper HTML formatting
    // Convert plain text with line breaks to proper HTML paragraphs
    let formattedContent = messageContent;
    
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
            address: userEmail, // This is 'sales@alliancechemical.com' by default
          },
        },
      ],
      // Initialize an empty array for custom headers
      internetMessageHeaders: []
    };
    
    // Process the threading information based on input type
    if ('internetMessageId' in threadingInfo) {
      // Handle case where input is a Message object
      const originalMessage = threadingInfo as Message;
      
      if (originalMessage.internetMessageId) {
        // Add threading headers with X- prefix as required by Graph API
        messageToSend.internetMessageHeaders.push({
          name: 'X-MS-Exchange-Organization-In-Reply-To',
          value: `<${originalMessage.internetMessageId}>`
        });
        
        // Get existing References if available
        const existingRefs = (originalMessage.internetMessageHeaders as InternetMessageHeader[] | undefined)?.find(
          h => h.name === 'References' || h.name === 'X-References' || h.name === 'X-MS-Exchange-Organization-References'
        )?.value || '';
        
        // Add references with the Exchange-specific header
        messageToSend.internetMessageHeaders.push({
          name: 'X-MS-Exchange-Organization-References',
          value: `${existingRefs} <${originalMessage.internetMessageId}>`.trim()
        });
        
        console.log(`GraphService: Added threading headers for message ID: ${originalMessage.internetMessageId}`);
      }
      
      // Set the conversation ID if available
      if (originalMessage.conversationId) {
        conversationId = originalMessage.conversationId;
        console.log(`GraphService: Using conversation ID from original message: ${conversationId}`);
      }
    } else {
      // Handle case where input is a ThreadingInfo object
      const threading = threadingInfo as ThreadingInfo;
      
      if (threading.inReplyToId) {
        // Add In-Reply-To header with X- prefix
        messageToSend.internetMessageHeaders.push({
          name: 'X-MS-Exchange-Organization-In-Reply-To',
          value: `<${threading.inReplyToId}>`
        });
        
        // Build references string
        let referencesValue: string;
        if (threading.referencesIds && threading.referencesIds.length > 0) {
          referencesValue = threading.referencesIds.map(id => `<${id}>`).join(' ');
        } else {
          // If no references, use In-Reply-To as the initial reference
          referencesValue = `<${threading.inReplyToId}>`;
        }
        
        // Add the references header
        messageToSend.internetMessageHeaders.push({
          name: 'X-MS-Exchange-Organization-References',
          value: referencesValue
        });
        
        console.log(`GraphService: Added threading headers using In-Reply-To ID: ${threading.inReplyToId}`);
      }
      
      // Set conversation ID if available
      if (threading.conversationId) {
        conversationId = threading.conversationId;
        console.log(`GraphService: Using conversation ID from threading info: ${conversationId}`);
      }
    }
    
    // Add thread-index header to help Outlook with threading
    messageToSend.internetMessageHeaders.push({
      name: 'X-Thread-Index',
      value: `Thread-${Date.now()}`
    });
    
    // Add custom header to indicate this is a reply
    messageToSend.internetMessageHeaders.push({
      name: 'X-Auto-Response-Suppress',
      value: 'All'
    });
    
    // Set the conversation ID in the message itself if available
    if (conversationId) {
      messageToSend.conversationId = conversationId;
    }
    
    // Build the final request
    const requestBody = {
      message: messageToSend,
      saveToSentItems: true
    };

    // Log the attempt
    console.log(`GraphService: Attempting to send email reply to ${toEmailAddress} from ${fromEmailAddress}`);
    console.log(`GraphService: Email subject: "${subject}"`);
    console.log(`GraphService: CC'ing sales mailbox: ${userEmail}`);
    
    if (conversationId) {
      console.log(`GraphService: Using conversation ID: ${conversationId}`);
    }
    
    console.log(`GraphService: Sending formatted HTML content (${formattedContent.length} chars)`);

    // Make the API call
    const response = await graphClient
      .api(`/users/${fromEmailAddress}/sendMail`)
      .post(requestBody);

    console.log(`GraphService: Email reply sent successfully.`);
    return { id: 'sent' } as Message;

  } catch (error: any) {
    console.error('GraphService: Error sending email reply:', JSON.stringify(error, null, 2));
    if (error.details) console.error('GraphService Error Details:', error.details);
    if (error.code) console.error(`GraphService Error Code: ${error.code}`);
    if (error.body) console.error('GraphService Error Body:', error.body);
    return null;
  }
}

/**
 * Get a specific email message by its ID.
 * @param messageId The ID of the message.
 * @returns The Message object or null if not found/error.
 */
export async function getMessageById(messageId: string): Promise<Message | null> {
  try {
    const message = await graphClient
      .api(`/users/${userEmail}/messages/${messageId}`)
      // Select only the fields you need to reduce payload size
      .select('id,subject,body,bodyPreview,sender,from,toRecipients,ccRecipients,bccRecipients,internetMessageId,conversationId,createdDateTime,receivedDateTime,isRead,importance,parentFolderId,internetMessageHeaders')
      .get();
    return message as Message;
  } catch (error) {
    console.error(`Error fetching message by ID ${messageId}:`, error);
    return null;
  }
}

/**
 * Creates a new Microsoft Graph subscription for new emails with direct parameters.
 * @param notificationUrl The URL of your webhook endpoint.
 * @param clientState A secret string for validation (optional but recommended).
 * @returns The created subscription object or null.
 */
export async function createEmailSubscription(
  notificationUrl: string,
  clientState?: string
): Promise<any | null> {
  const expirationDateTime = new Date();
  expirationDateTime.setDate(expirationDateTime.getDate() + 2); // Expires in 2 days (adjust as needed, max usually 3 for mail)

  const subscription = {
    changeType: 'created',
    notificationUrl: notificationUrl,
    resource: `/users/${userEmail}/mailFolders/inbox/messages`, // Or just /users/${userEmail}/messages
    expirationDateTime: expirationDateTime.toISOString(),
    clientState: clientState || process.env.MICROSOFT_GRAPH_WEBHOOK_SECRET || "DefaultSecretState", // Use a secret
    latestSupportedTlsVersion: "v1_2" // Recommended by Microsoft
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
    const response = await graphClient.api('/subscriptions').get();
    return response.value || [];
  } catch (error) {
    console.error('Error listing subscriptions:', error);
    return [];
  }
}

/**
 * Deletes a specific subscription.
 * @param subscriptionId The ID of the subscription to delete.
 * @returns True if successful, false otherwise.
 */
export async function deleteSubscription(subscriptionId: string): Promise<boolean> {
  try {
    await graphClient.api(`/subscriptions/${subscriptionId}`).delete();
    console.log(`Subscription ${subscriptionId} deleted successfully.`);
    return true;
  } catch (error) {
    console.error(`Error deleting subscription ${subscriptionId}:`, error);
    return false;
  }
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
    console.log(`Email ${messageId} has been flagged as important`);
  } catch (error) {
    console.error(`Error flagging email ${messageId}:`, error);
    throw error;
  }
} 