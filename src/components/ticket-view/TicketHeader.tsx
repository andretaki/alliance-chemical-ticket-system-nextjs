// Ticket Header Component
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';

interface TicketHeaderProps {
  ticket: any;
  currentUser: any;
  onStatusChange: (status: 'new' | 'open' | 'in_progress' | 'pending_customer' | 'closed') => void;
  onAssigneeChange: (assigneeId: string | null, assignee: any) => void;
  onDraftReply: () => void;
  onCheckOrderStatus: () => void;
  isLoadingAI: boolean;
}

export function TicketHeader({
  ticket,
  currentUser,
  onStatusChange,
  onAssigneeChange,
  onDraftReply,
  onCheckOrderStatus,
  isLoadingAI,
}: TicketHeaderProps) {
  return (
    <div className="border-b border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ticket #{ticket.id}</h1>
          <p className="text-sm text-muted-foreground">{ticket.title}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onDraftReply} disabled={isLoadingAI}>
            Draft Reply
          </Button>
          {ticket.orderNumber && (
            <Button variant="outline" onClick={onCheckOrderStatus} disabled={isLoadingAI}>
              Check Order Status
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
