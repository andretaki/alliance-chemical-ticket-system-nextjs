# Testing Ticket Assignment Notification Emails

This document provides guidance on how to manually test the ticket assignment notification feature.

## Overview

When a ticket is assigned to an agent, the system automatically sends a notification email to that agent. This email is a standard notification (not a threaded reply) and includes a link to the ticket.

## Test Scenarios

### Scenario 1: Basic Assignment Notification

**Steps:**
1. Log in as an admin or user with ticket management permissions
2. Create a new ticket or find an existing unassigned ticket
3. Edit the ticket and assign it to an agent with a valid email address
4. Save the changes

**Expected Results:**
- The ticket should be successfully assigned
- The assigned agent should receive an email notification
- The email subject should be: `Ticket Assigned: #[ticketId] - [ticketTitle]`
- The email should contain a link to the ticket
- The email should NOT have In-Reply-To or References headers (check email source)

### Scenario 2: Reassignment Notification

**Steps:**
1. Find a ticket that is already assigned to Agent A
2. Change the assignment to Agent B
3. Save the changes

**Expected Results:**
- The ticket should be successfully reassigned
- Agent B should receive the notification email
- Agent A should NOT receive any notification

### Scenario 3: No Notification for Same Assignee

**Steps:**
1. Find a ticket that is already assigned to an agent
2. Edit other ticket details (like status or priority) without changing the assignee
3. Save the changes

**Expected Results:**
- The ticket details should update
- No assignment notification email should be sent to the agent

## Troubleshooting

If the notification emails are not working:

1. Check server logs for any errors in the notification process
2. Verify the Microsoft Graph configuration is correct
3. Make sure the user being assigned has a valid email address in the system
4. Check that the NEXT_PUBLIC_APP_URL environment variable is set correctly

## Code Flow

For developers, here's how the notification system works:

1. When a ticket is updated via PUT /api/tickets/[id], the API checks if the assignee changed
2. If there's a new assignee, it fetches their email address
3. It then calls `sendNotificationEmail()` from `/src/lib/email.ts`
4. This function uses the Graph API to send a standard email (not a threaded reply)

## Email Template

The notification email uses this template:

```html
<p>Hello [Name],</p>
<p>You have been assigned ticket #[TicketId]: "[TicketTitle]".</p>
<p>You can view the ticket details here:</p>
<p><a href="[TicketUrl]">[TicketUrl]</a></p>
<p>Thank you,<br/>Ticket System</p>
``` 