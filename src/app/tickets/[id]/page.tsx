// src/app/tickets/[id]/page.tsx
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { TicketViewClient } from '@/components/ticket-view/TicketViewClient';
import { TicketService } from '@/services/TicketService';
import { ShopifyService } from '@/services/shopify/ShopifyService';
import { Config } from '@/config/appConfig';
import { getServerSession } from '@/lib/auth-helpers';
import { customerService } from '@/services/crm/customerService';
import { Breadcrumb } from '@/components/ui/breadcrumb';

interface TicketViewPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params: paramsPromise }: TicketViewPageProps): Promise<Metadata> {
  const params = await paramsPromise;
  const ticketId = parseInt(params.id, 10);

  if (isNaN(ticketId)) {
    return { title: 'Invalid Ticket - Alliance Chemical Support' };
  }

  const ticketService = new TicketService();
  const ticket = await ticketService.getTicketById(ticketId, { includeComments: false });

  return {
    title: ticket
      ? `Ticket #${ticketId}: ${ticket.title} - Alliance Chemical Support`
      : 'Ticket Not Found - Alliance Chemical Support',
    description: ticket?.ai_summary || `Details and communication history for ticket #${ticketId}.`,
  };
}

export default async function TicketViewPage({ params: paramsPromise }: TicketViewPageProps) {
  const params = await paramsPromise;
  const ticketId = parseInt(params.id, 10);
  const { session, error } = await getServerSession();

  if (isNaN(ticketId)) {
    notFound();
  }

  if (error || !session?.user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Unauthorized</h1>
          <p className="text-foreground-muted mt-2">Please sign in to view tickets.</p>
        </div>
      </div>
    );
  }

  const ticketService = new TicketService();

  // Fetch all data in parallel for optimal performance
  const [ticket, sidebarTickets, relatedQuote] = await Promise.all([
    ticketService.getTicketById(ticketId, {
      includeComments: true,
      includeAttachments: true,
      includeAssignee: true,
      includeReporter: true,
    }),
    ticketService.getActiveTicketsForSidebar({ limit: 50 }),
    fetchRelatedQuote(ticketId),
  ]);

  if (!ticket) {
    notFound();
  }

  // Authorization check
  const canView = ticketService.canUserViewTicket(ticket, session.user);
  if (!canView) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Forbidden</h1>
          <p className="text-foreground-muted mt-2">You do not have access to this ticket.</p>
        </div>
      </div>
    );
  }

  // Fetch customer overview if linked
  const customerOverview = ticket.customerId
    ? await customerService.getOverviewById(ticket.customerId)
    : null;

  // Serialize dates for client component
  const serializedTicket = {
    ...ticket,
    createdAt: ticket.createdAt instanceof Date ? ticket.createdAt.toISOString() : ticket.createdAt,
    updatedAt: ticket.updatedAt instanceof Date ? ticket.updatedAt.toISOString() : ticket.updatedAt,
    firstResponseDueAt: ticket.firstResponseDueAt instanceof Date ? ticket.firstResponseDueAt.toISOString() : ticket.firstResponseDueAt,
    resolutionDueAt: ticket.resolutionDueAt instanceof Date ? ticket.resolutionDueAt.toISOString() : ticket.resolutionDueAt,
    comments: ticket.comments?.map((c: any) => ({
      ...c,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
      attachments: c.attachments?.map((a: any) => ({
        ...a,
        uploadedAt: a.uploadedAt instanceof Date ? a.uploadedAt.toISOString() : a.uploadedAt,
      })) || [],
    })) || [],
    attachments: ticket.attachments?.map((a: any) => ({
      ...a,
      uploadedAt: a.uploadedAt instanceof Date ? a.uploadedAt.toISOString() : a.uploadedAt,
    })) || [],
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3 border-b bg-muted/30">
        <Breadcrumb
          items={[
            { label: 'Tickets', href: '/tickets' },
            { label: `#${ticketId}` },
          ]}
        />
      </div>
      <div className="flex-1 min-h-0">
        <TicketViewClient
          initialTicket={serializedTicket as any}
          sidebarTickets={sidebarTickets}
          relatedQuote={relatedQuote.quote}
          quoteAdminUrl={relatedQuote.adminUrl}
          currentUser={session.user}
          customerOverview={customerOverview}
        />
      </div>
    </div>
  );
}

async function fetchRelatedQuote(ticketId: number) {
  try {
    const shopifyService = new ShopifyService();
    const quotes = await shopifyService.getDraftOrdersByQuery(`tag:'TicketID-${ticketId}'`, 1);

    if (quotes && quotes.length > 0) {
      const quote = quotes[0];
      const adminUrl = quote.legacyResourceId
        ? `https://${Config.shopify.storeUrl.replace(/^https?:\/\//, '')}/admin/draft_orders/${quote.legacyResourceId}`
        : null;

      return { quote, adminUrl };
    }
  } catch (error) {
    console.error(`Failed to fetch quote for ticket ${ticketId}:`, error);
  }

  return { quote: null, adminUrl: null };
}
