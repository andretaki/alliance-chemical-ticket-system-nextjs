import { NextRequest, NextResponse } from 'next/server';
import { db, tickets, users } from '@/lib/db';
import { z } from 'zod';
import { eq } from 'drizzle-orm';

// Define the shape of the incoming data from the external form
const creditAppSchema = z.object({
  companyName: z.string().min(1),
  contactName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  zipCode: z.string().min(1),
  taxId: z.string().optional(),
  creditLimit: z.string().optional(),
  bankReferences: z.string().optional(),
  tradeReferences: z.string().optional(),
});

// Helper to format the ticket description beautifully
function formatTicketDescription(data: z.infer<typeof creditAppSchema>): string {
  return `
    <h3>New Credit Application Received</h3>
    <p>A new credit application has been submitted via the public webform.</p>
    <hr>
    <h4>Company Information</h4>
    <ul>
      <li><strong>Company Name:</strong> ${data.companyName}</li>
      <li><strong>Contact Name:</strong> ${data.contactName}</li>
      <li><strong>Email:</strong> ${data.email}</li>
      <li><strong>Phone:</strong> ${data.phone}</li>
      <li><strong>Tax ID/EIN:</strong> ${data.taxId || 'N/A'}</li>
    </ul>
    <h4>Address</h4>
    <p>
      ${data.address}<br>
      ${data.city}, ${data.state} ${data.zipCode}
    </p>
    <h4>Financials</h4>
    <ul>
      <li><strong>Requested Credit Limit:</strong> ${data.creditLimit || 'N/A'}</li>
    </ul>
    <h4>References</h4>
    <p><strong>Bank References:</strong><br>${data.bankReferences || 'N/A'}</p>
    <p><strong>Trade References:</strong><br>${data.tradeReferences || 'N/A'}</p>
  `;
}

export async function POST(request: NextRequest) {
  // 1. Security Check: Validate API Key
  const apiKey = request.headers.get('x-api-key');
  if (apiKey !== process.env.CREDIT_APP_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();

    // 2. Data Validation
    const validation = creditAppSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid data payload.', details: validation.error.format() }, { status: 400 });
    }
    const appData = validation.data;

    // 3. Find or Create User
    let reporter = await db.query.users.findFirst({ where: eq(users.email, appData.email) });
    if (!reporter) {
      [reporter] = await db.insert(users).values({
        email: appData.email,
        name: appData.contactName,
        isExternal: true,
      }).returning();
    }

    // 4. Find Assignee (Accounting Team)
    const accountingUser = await db.query.users.findFirst({ where: eq(users.email, 'accounting@alliancechemical.com') });
    if (!accountingUser) {
      throw new Error("Critical: 'accounting@alliancechemical.com' user not found for assignment.");
    }

    // 5. Create Ticket
    const ticketDescription = formatTicketDescription(appData);
    const [newTicket] = await db.insert(tickets).values({
      title: `Credit Application: ${appData.companyName}`,
      description: ticketDescription,
      status: 'new',
      priority: 'medium',
      type: 'Credit Request',
      reporterId: reporter.id,
      assigneeId: accountingUser.id,
      senderEmail: appData.email,
      senderName: appData.contactName,
      senderPhone: appData.phone,
      senderCompany: appData.companyName,
    }).returning();
    
    return NextResponse.json({ success: true, message: 'Application received and ticket created.', ticketId: newTicket.id }, { status: 201 });

  } catch (error: any) {
    console.error('Credit App Submission Error:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
} 