// Ticket Sidebar Component
'use client';

import React from 'react';

interface TicketSidebarProps {
  ticket: any;
  relatedQuote: any;
  quoteAdminUrl: string | null;
}

export function TicketSidebar({ ticket, relatedQuote, quoteAdminUrl }: TicketSidebarProps) {
  return (
    <div className="p-4 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-3">Details</h3>
        <div className="space-y-2">
          <div>
            <span className="text-sm text-muted-foreground">Status:</span>
            <span className="ml-2 text-sm font-medium">{ticket.status}</span>
          </div>
          <div>
            <span className="text-sm text-muted-foreground">Priority:</span>
            <span className="ml-2 text-sm font-medium">{ticket.priority}</span>
          </div>
          <div>
            <span className="text-sm text-muted-foreground">Assignee:</span>
            <span className="ml-2 text-sm font-medium">{ticket.assignee?.name || 'Unassigned'}</span>
          </div>
        </div>
      </div>

      {relatedQuote && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-3">Related Quote</h3>
          <div className="rounded-lg border p-3">
            <p className="font-medium">{relatedQuote.name}</p>
            {quoteAdminUrl && (
              <a
                href={quoteAdminUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline mt-2 inline-block"
              >
                View in Shopify
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
