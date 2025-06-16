# Microsoft Graph Webhook Setup for Email Processing

This document explains how to set up and maintain Microsoft Graph webhooks for real-time email processing in your ticket system.

## Overview

Instead of polling Microsoft Graph API periodically for new emails, webhooks allow Microsoft to notify your application when a new email arrives. This creates a more efficient, real-time email processing pipeline.

## Prerequisites

1. Your application must be deployed to a publicly accessible HTTPS URL
2. Microsoft Graph API credentials properly configured in your `.env` file
3. Database migrations applied for the updated `subscriptions` table

## Environment Variables

Make sure these are set in your `.env` file:

```
# Microsoft Graph API Configuration
MICROSOFT_GRAPH_TENANT_ID=your-tenant-id
MICROSOFT_GRAPH_CLIENT_ID=your-client-id
MICROSOFT_GRAPH_CLIENT_SECRET=your-client-secret
MICROSOFT_GRAPH_USER_EMAIL=sales@alliancechemical.com

# Webhook Configuration
NEXT_PUBLIC_APP_URL=https://your-production-url.com
MICROSOFT_GRAPH_WEBHOOK_SECRET=your-secure-random-string
```

## Creating a Subscription

### Production Setup

Once your application is deployed to a production URL, run the setup script:

```bash
npx tsx scripts/setupWebhook.ts
```

This will:
1. Create a new subscription in Microsoft Graph
2. Store the subscription details in your database
3. Log the subscription ID and expiration date

### Local Development with ngrok

For testing locally, you'll need to expose your local development server to the internet using ngrok:

1. Install ngrok: https://ngrok.com/download
2. Start your Next.js app: `npm run dev`
3. In a new terminal, run: `ngrok http 3000`
4. Copy the https URL provided by ngrok
5. Update your `.env` file: `NEXT_PUBLIC_APP_URL=https://your-ngrok-url`
6. Run the setup script: `npx tsx scripts/setupWebhook.ts`

## Managing Subscriptions

### Admin API

The application includes an API for admins to manage subscriptions:

- **List subscriptions**: `GET /api/admin/subscriptions`
- **Create subscription**: `POST /api/admin/subscriptions` with body `{"action": "create"}`
- **Renew subscription**: `POST /api/admin/subscriptions` with body `{"action": "renew", "subscriptionId": "id-from-list"}`
- **Delete subscription**: `POST /api/admin/subscriptions` with body `{"action": "delete", "subscriptionId": "id-from-list"}`
- **Ensure active subscription**: `POST /api/admin/subscriptions` with body `{"action": "ensure"}`

### Subscription Renewal

Microsoft Graph subscriptions expire after a few days. Two renewal methods are provided:

#### 1. Cron Job (Recommended)

Set up a cron job to call the renewal endpoint daily:

```
# Vercel Cron configuration (in vercel.json)
{
  "crons": [
    {
      "path": "/api/admin/cron/renew-subscriptions",
      "schedule": "0 0 * * *"  // Daily at midnight
    }
  ]
}
```

#### 2. Manual Script

You can also manually renew subscriptions with:

```bash
npx tsx scripts/renewSubscriptions.ts
```

## How It Works

1. When a new email arrives in your mailbox, Microsoft sends a notification to your webhook endpoint
2. Your endpoint validates the notification and processes the email
3. The system filters out internal emails (from your domain)
4. New tickets are created for external emails, just like in the polling system

## Troubleshooting

### Subscription Creation Issues

- **Invalid URL**: Make sure your URL is publicly accessible via HTTPS
- **Permission Issues**: Verify your Microsoft Graph API credentials have the `Mail.Read` permission
- **Check Logs**: Look at server logs for detailed error messages

### Webhook Not Receiving Notifications

- **Subscription Expired**: Check and renew the subscription
- **Network Issues**: Ensure your webhook endpoint is accessible from the internet
- **Validation Failure**: Verify the `MICROSOFT_GRAPH_WEBHOOK_SECRET` is correct

### Testing the Webhook

Send a test email to your monitored mailbox and check the application logs for webhook processing messages.

## Security Considerations

- Always use HTTPS for your webhook endpoint
- Use a strong random string for `MICROSOFT_GRAPH_WEBHOOK_SECRET`
- Validate the `clientState` in incoming notifications
- Consider adding additional authentication to your webhook endpoint 