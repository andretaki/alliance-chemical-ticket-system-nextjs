'use client';

import React from 'react';
import { Accordion, Nav } from 'react-bootstrap';
import { Info } from 'lucide-react';
import TicketDetailsSidebar from './TicketDetailsSidebar';
import CustomerOrderHistory from './CustomerOrderHistory';
import SlaTimer from './SlaTimer';
import { RagSearchInterface } from '@/components/RagSearchInterface';
import type { Ticket as TicketData } from '@/types/ticket';
import type { ShopifyDraftOrderGQLResponse } from '@/agents/quoteAssistant/quoteInterfaces';

interface TicketContextSidebarProps {
  ticket: TicketData;
  relatedQuote?: ShopifyDraftOrderGQLResponse | null;
  quoteAdminUrl?: string | null;
}

export default function TicketContextSidebar({ ticket, relatedQuote, quoteAdminUrl }: TicketContextSidebarProps) {
  return (
    <div className="ticket-context-sidebar h-100">
      <Accordion defaultActiveKey="0" flush>
        <div className="sidebar-header p-3 border-bottom">
          <h5 className="mb-0">Context & Tools</h5>
        </div>
        <Accordion.Body className="p-0">
          <Accordion.Item eventKey="0" className="border-0">
            <Accordion.Header as="div" className="w-100">
                <div className="d-flex justify-content-between align-items-center w-100 pe-3">
                    <span className="d-flex align-items-center"><Info className="w-4 h-4 me-2" />Details</span>
                    <div className="d-flex gap-2">
                        <SlaTimer
                            label="First Response"
                            dueDate={ticket.firstResponseDueAt || null}
                            isBreached={ticket.slaBreached || false}
                        />
                        <SlaTimer
                            label="Resolution"
                            dueDate={ticket.resolutionDueAt || null}
                            isBreached={ticket.slaBreached || false}
                        />
                    </div>
                </div>
            </Accordion.Header>
            <Accordion.Body><TicketDetailsSidebar ticket={ticket} relatedQuote={relatedQuote} quoteAdminUrl={quoteAdminUrl} /></Accordion.Body>
          </Accordion.Item>
          <Accordion.Item eventKey="1">
            <Accordion.Header>Order History</Accordion.Header>
            <Accordion.Body>
              <CustomerOrderHistory customerEmail={ticket.senderEmail || undefined} />
            </Accordion.Body>
          </Accordion.Item>
          <Accordion.Item eventKey="2">
            <Accordion.Header>Knowledge Search</Accordion.Header>
            <Accordion.Body>
              <RagSearchInterface />
            </Accordion.Body>
          </Accordion.Item>
        </Accordion.Body>
      </Accordion>
    </div>
  );
} 