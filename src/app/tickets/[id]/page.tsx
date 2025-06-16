// src/app/tickets/[id]/page.tsx
import { notFound } from 'next/navigation';
import { db, tickets } from '@/lib/db';
import { eq, asc, desc } from 'drizzle-orm';
import TicketViewClient from '@/components/TicketViewClient';
import { Metadata } from 'next';
import { ShopifyService } from '@/services/shopify/ShopifyService';
import type { ShopifyDraftOrderGQLResponse } from '@/agents/quoteAssistant/quoteInterfaces';
import { Config } from '@/config/appConfig';

interface TicketViewPageProps {
  params: Promise<{
    id: string;
  }>;
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

async function getDraftOrdersByQuery(shopifyService: ShopifyService, query: string, limit: number = 1): Promise<ShopifyDraftOrderGQLResponse[]> {
  const gqlQuery = `
    query GetDraftOrders($query: String!, $first: Int!) {
      draftOrders(query: $query, first: $first, sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id
            legacyResourceId
            name
            status
            invoiceUrl
            createdAt
            updatedAt
            totalPriceSet { shopMoney { amount currencyCode } }
            subtotalPriceSet { shopMoney { amount currencyCode } }
            totalTaxSet { shopMoney { amount currencyCode } }
            totalShippingPriceSet { shopMoney { amount currencyCode } }
            customer {
              id
              displayName
              email
              firstName
              lastName
              phone
              company
            }
            shippingAddress {
              firstName
              lastName
              address1
              address2
              city
              province
              zip
              country
              company
              phone
            }
            billingAddress {
              firstName
              lastName
              address1
              address2
              city
              province
              zip
              country
              company
              phone
            }
            lineItems(first: 50) {
              edges {
                node {
                  id
                  quantity
                  title
                  originalUnitPriceSet { shopMoney { amount currencyCode } }
                  product {
                    id
                    title
                  }
                  variant {
                    id
                    title
                    sku
                  }
                }
              }
            }
            tags
          }
        }
      }
    }
  `;

  try {
    console.log(`[ShopifyService] Searching for draft orders with query: ${query}`);
    // @ts-expect-error - private property
    const response: any = await shopifyService.graphqlClient.request(
      gqlQuery,
      {
        variables: { query: query, first: limit },
        retries: 2
      }
    );

    if (response.errors) {
      console.error('[ShopifyService] GraphQL errors when searching draft orders:', response.errors);
      throw new Error('Failed to search draft orders in Shopify.');
    }

    const draftOrders = response.data?.draftOrders?.edges?.map((edge: any) => edge.node) || [];
    console.log(`[ShopifyService] Found ${draftOrders.length} draft orders.`);
    return draftOrders;
  } catch (error) {
    console.error(`[ShopifyService] Error searching draft orders by query "${query}":`, error);
    throw error;
  }
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
  const params = await paramsPromise;
  const ticketId = parseInt(params.id, 10);

  if (isNaN(ticketId)) {
    notFound();
  }

  const ticket = await db.query.tickets.findFirst({
    where: eq(tickets.id, ticketId),
    with: {
      // project: true, // Ensure this is REMOVED or commented out
      assignee: { columns: { id: true, name: true, email: true } },
      reporter: { columns: { id: true, name: true, email: true } },
      comments: {
        with: { commenter: { columns: { id: true, name: true, email: true } } },
        orderBy: (comments, { asc }) => [asc(comments.createdAt)]
      }
    }
  });

  if (!ticket) {
    notFound();
  }

  // Fetch related quote from Shopify
  let relatedQuote: ShopifyDraftOrderGQLResponse | null = null;
  let quoteAdminUrl: string | null = null;
  try {
    const shopifyService = new ShopifyService();
    const quotes = await getDraftOrdersByQuery(shopifyService, `tag:'TicketID-${ticketId}'`, 1);
    if (quotes && quotes.length > 0) {
      relatedQuote = quotes[0];
      if (relatedQuote.legacyResourceId) {
        quoteAdminUrl = `https://${Config.shopify.storeUrl.replace(/^https?:\/\//, '')}/admin/draft_orders/${relatedQuote.legacyResourceId}`;
      }
    }
  } catch (error) {
    console.error(`Failed to fetch quote for ticket ${ticketId}:`, error);
    // Don't block page load if Shopify call fails
  }

  const serializedTicket = {
    ...ticket,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    comments: ticket.comments.map((comment: any) => ({
        ...comment,
        createdAt: comment.createdAt.toISOString(),
    })),
  };

  return (
      <div className="ticket-page-wrapper">
          <TicketViewClient initialTicket={serializedTicket as any} relatedQuote={relatedQuote} quoteAdminUrl={quoteAdminUrl} />
      </div>
  );
}