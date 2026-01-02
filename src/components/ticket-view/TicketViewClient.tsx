// src/components/ticket-view/TicketViewClient.tsx
'use client';

import React, { useState, useMemo, useCallback, useOptimistic } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';

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
import { SimilarRepliesPanel } from '@/components/rag/SimilarRepliesPanel';
import { SimilarTicketsPanel } from '@/components/rag/SimilarTicketsPanel';

// Types
import type { Ticket, TicketComment, TicketUser } from '@/types/ticket';
import type { ShopifyDraftOrderGQLResponse } from '@/agents/quoteAssistant/quoteInterfaces';
import type { CustomerOverview } from '@/lib/contracts';

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
      let attachmentIds: number[] = [];

      if (attachments.length > 0) {
        const uploadData = new FormData();
        attachments.forEach((file) => uploadData.append('files', file));

        const uploadResponse = await fetch(`/api/tickets/${optimisticTicket.id}/attachments`, {
          method: 'POST',
          body: uploadData,
        });

        const uploadPayload = await uploadResponse.json().catch(() => ({}));
        if (!uploadResponse.ok) {
          const message = uploadPayload?.error || 'Failed to upload attachments';
          throw new Error(message);
        }

        if (Array.isArray(uploadPayload.attachments)) {
          attachmentIds = uploadPayload.attachments
            .map((att: { id?: number }) => att.id)
            .filter((id: number | undefined): id is number => typeof id === 'number');
        }
      }

      const response = await fetch(`/api/tickets/${optimisticTicket.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: commentText,
          isInternalNote,
          sendAsEmail,
          attachmentIds: attachmentIds.length ? attachmentIds : undefined,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = payload?.error || 'Failed to post comment';
        throw new Error(message);
      }

      const emailNotice = sendAsEmail
        ? (payload?.emailSent === false
          ? 'Reply saved. Email delivery is currently disabled.'
          : 'Your reply has been sent to the customer.')
        : 'Internal note added.';

      toast({
        title: 'Comment Posted',
        description: emailNotice,
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

      const payload = await response.json();
      const draftText = payload?.draft ?? payload?.draftMessage;
      if (!draftText) throw new Error('No draft returned');
      setAiSuggestion({ type: 'reply', content: draftText });
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
      const response = await fetch(`/api/tickets/${optimisticTicket.id}/draft-order-status`);

      if (!response.ok) throw new Error('Failed to get order status');

      const payload = await response.json();
      const draftText = payload?.draft ?? payload?.draftMessage;
      if (!draftText) throw new Error('No draft returned');
      setAiSuggestion({ type: 'order_status', content: draftText });
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
    <div className="flex h-[calc(100vh-56px)] overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Left Sidebar - Ticket List */}
      <aside className="w-72 border-r border-gray-200 bg-white flex flex-col dark:border-gray-700 dark:bg-gray-800">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Recent Tickets</h2>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {sidebarTickets.map((ticket) => (
              <Link
                key={ticket.id}
                href={`/tickets/${ticket.id}`}
                className={`block px-3 py-2.5 rounded-lg transition-colors ${
                  ticket.id === optimisticTicket.id
                    ? 'bg-blue-50 border border-blue-100 dark:bg-blue-900/20 dark:border-blue-800'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <p className={`text-sm font-medium truncate ${
                  ticket.id === optimisticTicket.id
                    ? 'text-blue-900 dark:text-blue-100'
                    : 'text-gray-900 dark:text-gray-100'
                }`}>
                  {ticket.title}
                </p>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {ticket.senderName || 'Unknown'}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {new Date(ticket.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </ScrollArea>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-800">
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
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/50">
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
        <ScrollArea className="flex-1 bg-gray-50 dark:bg-gray-900">
          <div className="p-6">
            <ConversationThread
              comments={conversationHistory}
              ticket={optimisticTicket}
            />
          </div>
        </ScrollArea>
      </div>

      {/* Right Sidebar */}
      {showCopilot && (
        <aside className="w-96 border-l border-gray-200 bg-gray-50 flex flex-col overflow-hidden dark:border-gray-700 dark:bg-gray-900">
          <div className="px-4 py-3 border-b border-gray-200 bg-white flex items-center justify-between dark:border-gray-700 dark:bg-gray-800">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Details & AI</h2>
            <button
              onClick={() => setShowCopilot(false)}
              className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-6">
              <AICopilotPanel
                ticket={optimisticTicket}
                aiSuggestion={aiSuggestion}
                onApplySuggestion={() => setAiSuggestion(null)}
                onDismiss={() => setAiSuggestion(null)}
              />
              <Separator className="bg-gray-200 dark:bg-gray-700" />
              <TicketSidebar
                ticket={optimisticTicket}
                relatedQuote={relatedQuote}
                quoteAdminUrl={quoteAdminUrl}
              />
              <Separator className="bg-gray-200 dark:bg-gray-700" />
              <SimilarTicketsPanel ticketId={optimisticTicket.id} />
              <Separator className="bg-gray-200 dark:bg-gray-700" />
              <SimilarRepliesPanel ticketId={optimisticTicket.id} />
            </div>
          </ScrollArea>
        </aside>
      )}
    </div>
  );
}
