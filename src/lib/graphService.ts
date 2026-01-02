/**
 * Microsoft Graph Service - Email Sending Only
 *
 * This module handles outbound email sending via Microsoft Graph API.
 * Used for ticket replies, notifications, and alerts.
 */
import 'dotenv/config';
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { Message } from '@microsoft/microsoft-graph-types';
import { db } from '@/lib/db';
import { userSignatures } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import 'isomorphic-fetch';
import { env } from '@/lib/env';

// =============================================================================
// Configuration
// =============================================================================

export function getUserEmail(): string {
  const email = env.SHARED_MAILBOX_ADDRESS || '';
  if (!email) {
    throw new Error('Microsoft Graph configuration is incomplete. SHARED_MAILBOX_ADDRESS is missing.');
  }
  return email;
}

export const userEmail = env.SHARED_MAILBOX_ADDRESS || '';

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;
const TIMEOUT_MS = 30000;

// =============================================================================
// Graph Client Initialization
// =============================================================================

let _graphClient: Client | null = null;

function getGraphClient(): Client {
  if (_graphClient) return _graphClient;

  const tenantId = env.MICROSOFT_GRAPH_TENANT_ID;
  const clientId = env.MICROSOFT_GRAPH_CLIENT_ID;
  const clientSecret = env.MICROSOFT_GRAPH_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Microsoft Graph configuration is incomplete. Check your .env file.');
  }

  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default'],
  });

  _graphClient = Client.initWithMiddleware({ authProvider });
  return _graphClient;
}

export const graphClient = new Proxy({} as Client, {
  get(_target, prop) {
    return (getGraphClient() as any)[prop];
  }
});

/**
 * Verify Microsoft Graph connectivity
 * @returns true if connection is healthy, false otherwise
 */
export async function checkGraphHealth(): Promise<{ healthy: boolean; error?: string }> {
  try {
    const client = getGraphClient();
    // Simple test - get current user info (uses minimal permissions)
    await client.api('/organization').select('displayName').top(1).get();
    return { healthy: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[GraphService] Health check failed:', message);
    return { healthy: false, error: message };
  }
}

// =============================================================================
// Utilities
// =============================================================================

async function withRetry<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Operation ${operationName} timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
        )
      ]);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Attempt ${attempt}/${RETRY_ATTEMPTS} failed for ${operationName}:`, error);

      if (attempt < RETRY_ATTEMPTS) {
        const delay = RETRY_DELAY_MS * attempt;
        console.log(`Retrying ${operationName} in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`All ${RETRY_ATTEMPTS} attempts failed for ${operationName}. Last error: ${lastError?.message}`);
}

// =============================================================================
// Types
// =============================================================================

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

// =============================================================================
// Email Sending Functions
// =============================================================================

/**
 * Sends an email reply using Microsoft Graph API with threading support.
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
    const containsGreeting = (text: string): boolean => {
      const lowerText = text.toLowerCase().trim();
      return /^(hi|hello|dear)\s/i.test(lowerText) ||
             lowerText.includes('\nhi ') || lowerText.includes('\nhello ') ||
             lowerText.includes('\ndear ');
    };

    // Get user's signature
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

    // Extract threading information
    let conversationId: string | undefined;
    let inReplyToId: string | undefined;
    let referencesIds: string[] = [];

    if ('conversationId' in threadingInfo) {
      conversationId = threadingInfo.conversationId || undefined;
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

    // Process message content to HTML
    let aiMessageHtml = messageContent
      .replace(/\*\*\*(.*?)\*\*\*/g, '<strong>$1</strong>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n');

    const paragraphs = aiMessageHtml.split(/\n\s*\n/);

    if (paragraphs.length > 1) {
      aiMessageHtml = paragraphs
        .map(p => {
          const trimmed = p.trim();
          if (!trimmed) return '';
          return `<p>${trimmed.replace(/\n/g, '<br />')}</p>`;
        })
        .filter(p => p)
        .join('');
    } else {
      const trimmed = aiMessageHtml.trim();
      aiMessageHtml = trimmed ? `<p>${trimmed.replace(/\n/g, '<br />')}</p>` : '<p></p>';
    }

    // Process signature
    let dbSignatureHtml = '';
    if (signature) {
      dbSignatureHtml = !/<[a-z][\s\S]*>/i.test(signature)
        ? signature.replace(/\n/g, '<br />')
        : signature;
    }

    // Build HTML body
    const greetingHtml = containsGreeting(messageContent) ? '' : '<p>Hello,</p>';
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
    ${dbSignatureHtml ? `<br /><div>${dbSignatureHtml}</div>` : '<br /><p>Best regards</p>'}
  </div>
</body>
</html>`;

    // Build message object
    const messageToSend: Record<string, unknown> = {
      subject,
      body: { contentType: 'HTML', content: finalHtmlBody },
      toRecipients: [{ emailAddress: { address: toEmailAddress } }],
      ccRecipients: [{ emailAddress: { address: env.CC_EMAIL_ADDRESS } }],
      internetMessageHeaders: [] as Array<{ name: string; value: string }>
    };

    // Add threading headers
    if (inReplyToId) {
      (messageToSend.internetMessageHeaders as Array<{ name: string; value: string }>).push({
        name: 'x-in-reply-to',
        value: inReplyToId
      });
    }

    if (referencesIds.length > 0) {
      (messageToSend.internetMessageHeaders as Array<{ name: string; value: string }>).push({
        name: 'x-references',
        value: referencesIds.join(' ')
      });
    }

    if (conversationId) {
      messageToSend.conversationId = conversationId;
    }

    // Add attachments
    if (attachments && attachments.length > 0) {
      messageToSend.attachments = attachments.map(att => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: att.name,
        contentType: att.contentType,
        contentBytes: att.contentBytes
      }));
    }

    // Send email
    const response = await withRetry(
      () => graphClient
        .api(`/users/${fromEmailAddress}/sendMail`)
        .post({ message: messageToSend, saveToSentItems: true }),
      'sendEmailReply'
    );

    return response;
  } catch (error) {
    console.error('Error sending email reply:', error);
    throw error;
  }
}

/**
 * Send a simple email without threading (for new conversations).
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
    // Get user's signature
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

    // Process signature
    let dbSignatureHtml = '';
    if (signature) {
      dbSignatureHtml = !/<[a-z][\s\S]*>/i.test(signature)
        ? signature.replace(/\n/g, '<br />')
        : signature;
    }

    const finalHtmlBody = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; }
    p { margin-bottom: 10px; }
    a { color: #0078d4; text-decoration: none; }
  </style>
</head>
<body>
  <div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6;">
    ${messageContent}
    ${dbSignatureHtml ? `<br /><div>${dbSignatureHtml}</div>` : ''}
  </div>
</body>
</html>`;

    const messageToSend: Record<string, unknown> = {
      subject,
      body: { contentType: 'HTML', content: finalHtmlBody },
      toRecipients: [{ emailAddress: { address: toEmailAddress } }],
      ccRecipients: [{ emailAddress: { address: env.CC_EMAIL_ADDRESS } }],
    };

    if (attachments && attachments.length > 0) {
      messageToSend.attachments = attachments.map(att => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: att.name,
        contentType: att.contentType,
        contentBytes: att.contentBytes
      }));
    }

    const response = await withRetry(
      () => graphClient
        .api(`/users/${fromEmailAddress}/sendMail`)
        .post({ message: messageToSend, saveToSentItems: true }),
      'sendEmail'
    );

    return response;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}
