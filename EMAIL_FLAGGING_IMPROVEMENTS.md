# Email Flagging System Improvements

## Overview

The email processing system has been enhanced with intelligent flagging logic that only flags emails when appropriate and can automatically unflag them when we respond effectively.

## Changes Made

### 1. Added Unflagging Functionality (`src/lib/graphService.ts`)

```javascript
export async function unflagEmail(messageId: string): Promise<void>
```

- New function to remove flags from emails
- Complements the existing `flagEmail` function
- Sets flag status to 'notFlagged' via Microsoft Graph API

### 2. Intelligent Flagging Logic (`src/lib/emailProcessor.ts`)

**BEFORE:** All emails identified as `likelyCustomerRequest` were automatically flagged

**AFTER:** ALL customer requests are flagged for human review (human-in-the-loop approach)

**Current Approach:**
- **Flag ALL Customer Requests**: Every email that creates a ticket is flagged
- **Human Review Required**: No automation bypasses human oversight
- **Descriptive Flagging**: Different flag reasons help prioritize attention
- **Smart Unflagging**: Flags removed when staff respond appropriately

**Flagging Criteria:**
```javascript
// Flag ALL customer requests that create tickets
let shouldFlag = true; // Always flag customer requests
let flagReason = 'customer request requiring human review';

// Add specific reasons for prioritization
if (ticketData.priority === 'high' || ticketData.priority === 'urgent')
    flagReason = `${ticketData.priority} priority customer request`;

if (analysisResult?.intent === 'return_request' || 
    analysisResult?.sentiment === 'negative' ||
    analysisResult?.ticketType === 'Return')
    flagReason = `${analysisResult.intent} requiring urgent attention`;

if (analysisResult?.intent === 'documentation_request')
    flagReason = 'documentation request requiring review';
```

### 3. Smart Unflagging on Response (`src/app/api/tickets/[id]/reply/route.ts`)

Emails are automatically unflagged when we send responses that:

**Always Unflag:**
- Provide direct answers (contain "attached", "here is", "please find", etc.)
- Resolve issues (contain "resolved", "completed", "shipped", "tracking", etc.)

**Conditionally Unflag:**
- Provide substantive information (>50 chars + info keywords)
- Give substantial responses (>100 characters)

**Never Unflag:**
- Asking for more information ("please provide", "can you", "need more")
- Brief acknowledgments (<30 characters)
- Internal notes

## Benefits

### For Support Staff

1. **Complete Visibility**: Every customer request is flagged for human review
2. **Priority Indicators**: Flag reasons help prioritize urgent vs. routine requests
3. **Automatic Cleanup**: Flags are removed when issues are addressed
4. **Human-in-the-Loop**: No customer request bypasses human oversight

### For Email Management

1. **Full Control**: All customer emails require human review and action
2. **Smart Unflagging**: Flags are removed as work progresses
3. **Error Resilience**: Unflagging failures don't break the reply process
4. **Audit Trail**: Clear logging of all flagging decisions

## Logging and Monitoring

The system provides detailed console logging:

```
EmailProcessor: Flagged ticket 123 email (high priority customer request)
EmailProcessor: Flagged ticket 124 email (customer request requiring human review)
Unflagged email for ticket 123 (direct answer provided)
Keeping flag for ticket 125 (requesting more information)
```

## Implementation Notes

- **Human-First Approach**: Every customer request gets human attention
- **Error Handling**: Flagging/unflagging failures don't stop email processing
- **Performance**: Minimal overhead added to email processing
- **Descriptive Flagging**: Different reasons help with prioritization

## Usage Examples

### Scenario 1: High Priority Complaint
- Email comes in with negative sentiment about damaged product
- ✅ **Flagged**: "return_request requiring urgent attention"
- Support responds with return instructions and apology
- ✅ **Unflagged**: Direct resolution provided

### Scenario 2: Routine Order Status
- Customer asks about order status
- ✅ **Flagged**: "order inquiry requiring review"
- Support provides tracking information
- ✅ **Unflagged**: Information provided

### Scenario 3: COA Request
- Customer requests Certificate of Analysis
- ✅ **Flagged**: "documentation request requiring review"
- Support asks for lot number
- ❌ **Stays Flagged**: Still requesting information
- Customer provides lot number, support sends COA
- ✅ **Unflagged**: Document provided

### Scenario 4: Simple Product Inquiry
- Customer asks about product availability
- ✅ **Flagged**: "customer request requiring human review"
- Support provides availability and pricing
- ✅ **Unflagged**: Information provided

## Key Change: Human-in-the-Loop

The system now ensures **every customer request** gets human attention by:
- Flagging all customer emails that create tickets
- Using descriptive flag reasons for prioritization
- Only unflagging when staff provide meaningful responses
- Maintaining complete audit trail of all interactions

## Future Enhancements

Potential improvements could include:

1. **Priority Queues**: Different flag colors for different urgency levels
2. **SLA Tracking**: Flag emails that remain unresponded for too long
3. **Custom Rules**: Allow admins to configure additional flagging criteria
4. **Team Assignment**: Smart routing based on request type
5. **Integration**: Sync with external CRM systems
