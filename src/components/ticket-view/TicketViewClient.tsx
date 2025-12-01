// src/components/ticket-view/TicketViewClient.tsx
'use client';

import React, { useState, useMemo, useCallback, useOptimistic } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// UI Components (shadcn/ui)
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';

// Feature Components
import { TicketHeader } from './TicketHeader';
import { ConversationThread } from './ConversationThread';
import { ReplyComposer } from './ReplyComposer';
import { TicketSidebar } from './TicketSidebar';
import { AICopilotPanel } from './AICopilotPanel';
import { CustomerSnapshotCard } from '@/components/customers/CustomerSnapshotCard';

// Types
import type { Ticket, TicketComment, TicketUser } from '@/types/ticket';
import type { ShopifyDraftOrderGQLResponse } from '@/agents/quoteAssistant/quoteInterfaces';
import type { CustomerOverview } from '@/services/crm/customerService';

interface TicketViewClientProps {
  initialTicket: Ticket;
  sidebarTickets: Array<{
    id: number;
    title: string;
    senderName: string | null;
    status: string;
    updatedAt: string;
  }>;
  relatedQuote: ShopifyDraftOrderGQLResponse | null;
  quoteAdminUrl: string | null;
  currentUser: TicketUser;
  customerOverview?: CustomerOverview | null;
}

type OptimisticUpdate =
  | { type: 'status'; status: 'new' | 'open' | 'in_progress' | 'pending_customer' | 'closed' }
  | { type: 'assignee'; assigneeId: string | null; assignee: TicketUser | null }
  | { type: 'comment'; comment: TicketComment }
  | { type: 'priority'; priority: 'low' | 'medium' | 'high' | 'urgent' };

export function TicketViewClient({
  initialTicket,
  sidebarTickets,
  relatedQuote,
  quoteAdminUrl,
  currentUser,
  customerOverview,
}: TicketViewClientProps) {
  const router = useRouter();

  // Optimistic UI state
  const [optimisticTicket, addOptimisticUpdate] = useOptimistic<Ticket, OptimisticUpdate>(
    initialTicket,
    (state, update) => {
      switch (update.type) {
        case 'status':
          return { ...state, status: update.status, updatedAt: new Date().toISOString() };
        case 'assignee':
          return {
            ...state,
            assigneeId: update.assigneeId,
            assignee: update.assignee,
            updatedAt: new Date().toISOString()
          };
        case 'comment':
          return {
            ...state,
            comments: [...state.comments, update.comment],
            updatedAt: new Date().toISOString()
          };
        case 'priority':
          return { ...state, priority: update.priority, updatedAt: new Date().toISOString() };
        default:
          return state;
      }
    }
  );

  // Local UI state
  const [showCopilot, setShowCopilot] = useState(true);
  const [aiSuggestion, setAiSuggestion] = useState<{ type: string; content: string } | null>(null);
  const [isLoadingAI, setIsLoadingAI] = useState(false);

  // Memoized conversation history
  const conversationHistory = useMemo(() => {
    const history: TicketComment[] = [];

    // Add initial ticket description as first message
    if (optimisticTicket.description) {
      history.push({
        id: -1,
        commentText: optimisticTicket.description,
        createdAt: optimisticTicket.createdAt,
        commenter: optimisticTicket.reporter,
        isInternalNote: false,
        isFromCustomer: true,
        isOutgoingReply: false,
        attachments: optimisticTicket.attachments?.filter((a: any) => !a.commentId) || [],
      } as TicketComment);
    }

    history.push(...optimisticTicket.comments);
    return history;
  }, [optimisticTicket]);

  // Optimistic action handlers
  const handleStatusChange = useCallback(async (newStatus: 'new' | 'open' | 'in_progress' | 'pending_customer' | 'closed') => {
    addOptimisticUpdate({ type: 'status', status: newStatus });

    try {
      const response = await fetch(`/api/tickets/${optimisticTicket.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) throw new Error('Failed to update status');

      toast({
        title: 'Status Updated',
        description: `Ticket status changed to ${newStatus}`,
      });

      router.refresh();
    } catch (error) {
      toast({
        title: 'Update Failed',
        description: 'Could not update ticket status. Please try again.',
        variant: 'destructive',
      });
      router.refresh(); // Revert optimistic update
    }
  }, [optimisticTicket.id, router, addOptimisticUpdate]);

  const handleAssigneeChange = useCallback(async (assigneeId: string | null, assignee: TicketUser | null) => {
    addOptimisticUpdate({ type: 'assignee', assigneeId, assignee });

    try {
      const response = await fetch(`/api/tickets/${optimisticTicket.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigneeId }),
      });

      if (!response.ok) throw new Error('Failed to update assignee');

      toast({
        title: 'Assignee Updated',
        description: assignee ? `Ticket assigned to ${assignee.name}` : 'Ticket unassigned',
      });

      router.refresh();
    } catch (error) {
      toast({
        title: 'Update Failed',
        description: 'Could not update ticket assignee. Please try again.',
        variant: 'destructive',
      });
      router.refresh();
    }
  }, [optimisticTicket.id, router, addOptimisticUpdate]);

  const handleCommentSubmit = useCallback(async (
    commentText: string,
    isInternalNote: boolean,
    sendAsEmail: boolean,
    attachments: File[]
  ) => {
    // Create optimistic comment
    const optimisticComment: TicketComment = {
      id: Date.now(), // Temporary ID
      commentText,
      createdAt: new Date().toISOString(),
      commenter: currentUser,
      isInternalNote,
      isFromCustomer: false,
      isOutgoingReply: sendAsEmail,
      attachments: [],
    };

    addOptimisticUpdate({ type: 'comment', comment: optimisticComment });

    try {
      const formData = new FormData();
      formData.append('commentText', commentText);
      formData.append('isInternalNote', String(isInternalNote));
      formData.append('sendAsEmail', String(sendAsEmail));
      attachments.forEach((file) => formData.append('attachments', file));

      const response = await fetch(`/api/tickets/${optimisticTicket.id}/reply`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Failed to post comment');

      toast({
        title: 'Comment Posted',
        description: sendAsEmail ? 'Your reply has been sent to the customer.' : 'Internal note added.',
      });

      router.refresh();
    } catch (error) {
      toast({
        title: 'Posting Failed',
        description: 'Could not post comment. Please try again.',
        variant: 'destructive',
      });
      router.refresh();
    }
  }, [optimisticTicket.id, currentUser, router, addOptimisticUpdate]);

  // AI Copilot actions
  const handleDraftReply = useCallback(async () => {
    setIsLoadingAI(true);

    try {
      const response = await fetch(`/api/tickets/${optimisticTicket.id}/draft-ai-reply`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to generate draft');

      const { draft } = await response.json();
      setAiSuggestion({ type: 'reply', content: draft });
      setShowCopilot(true);

      toast({
        title: 'AI Draft Ready',
        description: 'Review the suggested reply in the copilot panel.',
      });
    } catch (error) {
      toast({
        title: 'AI Draft Failed',
        description: 'Could not generate AI reply. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingAI(false);
    }
  }, [optimisticTicket.id]);

  const handleCheckOrderStatus = useCallback(async () => {
    if (!optimisticTicket.orderNumber) {
      toast({
        title: 'No Order Number',
        description: 'This ticket does not have an associated order number.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoadingAI(true);

    try {
      const response = await fetch(`/api/tickets/${optimisticTicket.id}/draft-order-status`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to get order status');

      const { draft } = await response.json();
      setAiSuggestion({ type: 'order_status', content: draft });
      setShowCopilot(true);
    } catch (error) {
      toast({
        title: 'Order Status Failed',
        description: 'Could not fetch order status. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingAI(false);
    }
  }, [optimisticTicket.id, optimisticTicket.orderNumber]);

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden bg-[#0c0f16]">
      {/* Left Sidebar - Ticket List */}
      <aside className="w-64 border-r border-white/[0.06] bg-[#0d1117] flex flex-col">
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <h2 className="text-sm font-medium text-white/60">Recent Tickets</h2>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
            {sidebarTickets.map((ticket) => (
              <Link
                key={ticket.id}
                href={`/tickets/${ticket.id}`}
                className={`block px-3 py-2.5 rounded-md transition-colors ${
                  ticket.id === optimisticTicket.id
                    ? 'bg-white/[0.06]'
                    : 'hover:bg-white/[0.03]'
                }`}
              >
                <p className={`text-sm font-medium truncate ${
                  ticket.id === optimisticTicket.id ? 'text-white' : 'text-white/70'
                }`}>
                  {ticket.title}
                </p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[11px] text-white/40 truncate">{ticket.senderName || 'Unknown'}</span>
                  <span className="text-[11px] text-white/30">{new Date(ticket.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </div>
              </Link>
            ))}
          </div>
        </ScrollArea>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <TicketHeader
          ticket={optimisticTicket}
          currentUser={currentUser}
          onStatusChange={handleStatusChange}
          onAssigneeChange={handleAssigneeChange}
          onDraftReply={handleDraftReply}
          onCheckOrderStatus={handleCheckOrderStatus}
          isLoadingAI={isLoadingAI}
        />

        {/* Customer context */}
        {customerOverview && (
          <div className="px-5 py-3 border-b border-white/[0.06] bg-white/[0.01]">
            <CustomerSnapshotCard overview={customerOverview} />
          </div>
        )}

        {/* Reply Composer */}
        <ReplyComposer
          ticketId={optimisticTicket.id}
          senderEmail={optimisticTicket.senderEmail}
          onSubmit={handleCommentSubmit}
          aiSuggestion={aiSuggestion?.type === 'reply' ? aiSuggestion.content : undefined}
        />

        {/* Conversation */}
        <ScrollArea className="flex-1">
          <div className="p-5">
            <ConversationThread
              comments={conversationHistory}
              ticket={optimisticTicket}
            />
          </div>
        </ScrollArea>
      </div>

      {/* Right Sidebar */}
      {showCopilot && (
        <aside className="w-80 border-l border-white/[0.06] bg-[#0d1117] flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
            <h2 className="text-sm font-medium text-white/70">Details</h2>
            <button
              onClick={() => setShowCopilot(false)}
              className="w-6 h-6 flex items-center justify-center text-white/30 hover:text-white/60 transition-colors"
            >
              <i className="fas fa-times text-xs" />
            </button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4">
              <AICopilotPanel
                ticket={optimisticTicket}
                aiSuggestion={aiSuggestion}
                onApplySuggestion={() => setAiSuggestion(null)}
                onDismiss={() => setAiSuggestion(null)}
              />
              <Separator className="my-4 bg-white/[0.06]" />
              <TicketSidebar
                ticket={optimisticTicket}
                relatedQuote={relatedQuote}
                quoteAdminUrl={quoteAdminUrl}
              />
            </div>
          </ScrollArea>
        </aside>
      )}
    </div>
  );
}
