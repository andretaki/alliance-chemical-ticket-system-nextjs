// src/app/tickets/[id]/page.tsx
import { notFound } from 'next/navigation';
import { db, tickets } from '@/lib/db';
import { eq, desc, and, not } from 'drizzle-orm';
import TicketViewClient from '@/components/TicketViewClient';
import { Metadata } from 'next';
import { ShopifyService } from '@/services/shopify/ShopifyService'; // Keep this for quote fetching
import type { ShopifyDraftOrderGQLResponse } from '@/agents/quoteAssistant/quoteInterfaces';
import { Config } from '@/config/appConfig';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import type { Ticket as TicketData } from '@/types/ticket';

interface TicketViewPageProps {
  params: Promise<{
    id: string;
  }>;
}

interface TicketSidebarEntry {
    id: number;
    title: string;
    senderName: string | null;
    status: string;
    updatedAt: string;
}

export async function generateMetadata({ params: paramsPromise }: TicketViewPageProps): Promise<Metadata> {
    const params = await paramsPromise;
    const ticketId = parseInt(params.id, 10);
    if (isNaN(ticketId)) {
        return { title: 'Invalid Ticket - Issue Tracker' };
    }

    const ticket = await db.query.tickets.findFirst({
        where: eq(tickets.id, ticketId),
        columns: { title: true },
    });

    return {
        title: ticket ? `Ticket #${ticketId}: ${ticket.title} - Issue Tracker` : 'Ticket Not Found - Issue Tracker',
        description: `Details and comments for ticket #${ticketId}.`,
    };
}

async function getTicketDetails(id: number, userRole: string, userId: string) {
  const ticket = await db.query.tickets.findFirst({
    where: eq(tickets.id, id),
    with: {
      assignee: true,
      reporter: true,
      comments: {
        with: {
          commenter: true,
        },
        orderBy: (comments, { asc }) => [asc(comments.createdAt)],
      },
    },
  });

  if (!ticket) {
    notFound();
  }

  const flatComments =
    ticket.comments?.map((comment: any) => ({
      ...comment,
      commenterName: comment.commenter?.name || 'Unknown',
    })) || [];

  return { ...ticket, comments: flatComments, userRole, currentUserId: userId };
}

export default async function TicketViewPage({ params: paramsPromise }: TicketViewPageProps) {
  // --- Data Fetching ---
  const params = await paramsPromise;
  const ticketId = parseInt(params.id, 10);
  const session = await getServerSession(authOptions);

  if (isNaN(ticketId)) {
    notFound();
  }

  // Fetch the main ticket and the list for the sidebar in parallel
  const [ticket, ticketList] = await Promise.all([
    db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
      with: {
        assignee: { columns: { id: true, name: true, email: true } },
        reporter: { columns: { id: true, name: true, email: true } },
        comments: {
          with: { 
            commenter: { columns: { id: true, name: true, email: true } },
            attachments: true,
          },
          orderBy: (comments, { asc }) => [asc(comments.createdAt)]
        },
        attachments: { where: (att, { isNull }) => isNull(att.commentId) }
      }
    }),
    db.query.tickets.findMany({
      where: and(not(eq(tickets.status, 'closed'))),
      columns: {
        id: true,
        title: true,
        senderName: true,
        status: true,
        updatedAt: true
      },
      orderBy: [desc(tickets.updatedAt)],
      limit: 50
    })
  ]);

  if (!ticket) {
    notFound();
  }

  // Fetch related quote from Shopify
  const [relatedQuote, quoteAdminUrl] = await (async () => {
    try {
      const shopifyService = new ShopifyService();
      const quotes = await shopifyService.getDraftOrdersByQuery(`tag:'TicketID-${ticketId}'`, 1);
      if (quotes && quotes.length > 0) {
        const quote = quotes[0];
        const adminUrl = quote.legacyResourceId
          ? `https://${Config.shopify.storeUrl.replace(/^https?:\/\//, '')}/admin/draft_orders/${quote.legacyResourceId}`
          : null;
        return [quote, adminUrl];
      }
    } catch (error) {
      console.error(`Failed to fetch quote for ticket ${ticketId}:`, error);
    }
    return [null, null];
  })();

  // --- Data Serialization ---
  const serializedTicket = {
    ...ticket,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    comments: ticket.comments.map((comment: any) => ({
        ...comment,
        createdAt: comment.createdAt.toISOString(),
        attachments: comment.attachments?.map((att: any) => ({
            ...att,
            uploadedAt: att.uploadedAt.toISOString(),
        }))
    })),
    attachments: ticket.attachments?.map((att: any) => ({
        ...att,
        uploadedAt: att.uploadedAt.toISOString(),
    })),
  };

  const serializedTicketList = ticketList.map(t => ({
      ...t,
      updatedAt: t.updatedAt.toISOString(),
  }));

  // --- Rendering ---
  return (
    <div className="inbox-layout">
        {/* Left Pane: Ticket List */}
        <aside className="inbox-sidebar-pane">
            <div className="p-4 border-b border-white/10">
                <h4 className="text-lg font-bold text-white">Inbox</h4>
                {/* Filter buttons will go here in a future update */}
            </div>
            <ul className="list-unstyled p-2">
                {serializedTicketList.map(item => (
                    <li key={item.id}>
                        <Link href={`/tickets/${item.id}`} 
                              className={`block p-3 rounded-lg transition-colors ${item.id === ticketId ? 'bg-primary/20' : 'hover:bg-white/5'}`}>
                            <p className={`font-semibold truncate ${item.id === ticketId ? 'text-primary' : 'text-white'}`}>{item.title}</p>
                            <div className="flex justify-between items-center text-xs text-foreground-muted">
                                <span>{item.senderName || 'Unknown Sender'}</span>
                                <span>{new Date(item.updatedAt).toLocaleDateString()}</span>
                            </div>
                        </Link>
                    </li>
                ))}
            </ul>
        </aside>

        {/* Center & Right Panes managed by TicketViewClient */}
        <TicketViewClient 
            initialTicket={serializedTicket as TicketData} 
            relatedQuote={relatedQuote} 
            quoteAdminUrl={quoteAdminUrl} 
        />
    </div>
  );
}