import * as graphService from '@/lib/graphService';
import { Message } from '@microsoft/microsoft-graph-types';

// Define the environment variables for alert recipients
const ALERT_EMAIL = process.env.ALERT_EMAIL || process.env.MICROSOFT_GRAPH_USER_EMAIL || 'andre@alliancechemical.com';
const ERROR_THRESHOLD = parseInt(process.env.ERROR_ALERT_THRESHOLD || '3', 10);

// Track errors to avoid sending too many alerts
let recentErrors: {timestamp: Date, message: string}[] = [];
let lastAlertSent: Date | null = null;

/**
 * Send an alert email about a critical error
 * @param subject The alert subject
 * @param body The error details
 * @returns true if alert was sent, false otherwise
 */
export async function sendAlertEmail(subject: string, body: string): Promise<boolean> {
  try {
    if (!ALERT_EMAIL) {
      console.error('AlertService: Alert email address not configured');
      return false;
    }

    // Create a fake original message for sendEmailReply
    const dummyMessage: Message = {
      id: 'alert-' + new Date().getTime(),
      internetMessageId: 'alert-' + new Date().getTime() + '@ticket-system.local',
    };

    // Format the body as HTML
    const htmlBody = `
      <h2>Ticket System Alert</h2>
      <p><strong>Time:</strong> ${new Date().toISOString()}</p>
      <p><strong>Type:</strong> Error Alert</p>
      <hr/>
      <pre>${body}</pre>
      <hr/>
      <p>This is an automated message from your ticket system alert service.</p>
    `;

    // Send the alert email
    const result = await graphService.sendEmailReply(
      ALERT_EMAIL,
      `🚨 ALERT: ${subject}`,
      htmlBody,
      dummyMessage
    );

    if (result) {
      console.log(`AlertService: Alert email sent to ${ALERT_EMAIL}`);
      lastAlertSent = new Date();
      return true;
    } else {
      console.error('AlertService: Failed to send alert email');
      return false;
    }
  } catch (error) {
    console.error('AlertService: Error sending alert email:', error);
    return false;
  }
}

/**
 * Track an error and send an alert if threshold is reached
 * @param errorSource The source of the error (e.g., 'emailProcessor')
 * @param errorMessage The error message
 * @param errorDetails Additional error details (optional)
 * @returns true if alert was sent, false otherwise
 */
export async function trackErrorAndAlert(
  errorSource: string, 
  errorMessage: string, 
  errorDetails?: any
): Promise<boolean> {
  // Add error to recent errors
  recentErrors.push({
    timestamp: new Date(),
    message: errorMessage
  });

  // Clean up old errors (older than 1 hour)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  recentErrors = recentErrors.filter(e => e.timestamp > oneHourAgo);

  // Check if we should send an alert
  // Criteria: Either 1) We have many errors or 2) It's been a while since the last alert
  const shouldSendAlert = 
    recentErrors.length >= ERROR_THRESHOLD || 
    (recentErrors.length > 0 && (!lastAlertSent || (Date.now() - lastAlertSent.getTime() > 30 * 60 * 1000)));

  if (shouldSendAlert) {
    // Format the error details for the alert
    const subject = `${errorSource} Error: ${errorMessage.substring(0, 50)}${errorMessage.length > 50 ? '...' : ''}`;
    
    let body = `Source: ${errorSource}\n\nError: ${errorMessage}\n\n`;
    
    if (errorDetails) {
      body += `Details: ${typeof errorDetails === 'object' ? JSON.stringify(errorDetails, null, 2) : errorDetails}\n\n`;
    }
    
    body += `Recent Errors (${recentErrors.length}):\n`;
    recentErrors.forEach((err, index) => {
      body += `${index + 1}. [${err.timestamp.toISOString()}] ${err.message}\n`;
    });

    return await sendAlertEmail(subject, body);
  }
  
  return false;
} 