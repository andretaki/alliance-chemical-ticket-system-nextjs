import { useState, useCallback, ChangeEvent } from 'react';
import axios, { AxiosError } from 'axios';
import toast from 'react-hot-toast';
import type { Ticket as TicketData, TicketUser as BaseUser } from '@/types/ticket';
import type { ShopifyDraftOrderGQLResponse } from '@/agents/quoteAssistant/quoteInterfaces';

interface UseTicketActionsProps {
  ticket: TicketData;
  setTicket: React.Dispatch<React.SetStateAction<TicketData>>;
  users: BaseUser[];
  refreshTicket: () => Promise<void>;
  relatedQuote?: ShopifyDraftOrderGQLResponse | null;
}

export function useTicketActions({ ticket, setTicket, users, refreshTicket, relatedQuote }: UseTicketActionsProps) {
    const [isUpdatingAssignee, setIsUpdatingAssignee] = useState(false);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
    const [isLoadingOrderStatusDraft, setIsLoadingOrderStatusDraft] = useState(false);
    const [isResendingInvoice, setIsResendingInvoice] = useState(false);
    
    const handleAssigneeChange = useCallback(async (e: ChangeEvent<HTMLSelectElement>) => {
        const newAssigneeId = e.target.value || null;
        setIsUpdatingAssignee(true);
        try {
            await axios.put(`/api/tickets/${ticket.id}`, { assigneeId: newAssigneeId });
            setTicket(prev => ({ ...prev, assignee: newAssigneeId ? users.find(u => u.id === newAssigneeId) || null : null }));
            toast.success('Assignee updated!');
        } catch (err) { 
            toast.error('Failed to update assignee.');
        } finally { 
            setIsUpdatingAssignee(false);
        }
    }, [ticket.id, users, setTicket]);

    const handleStatusSelectChange = useCallback(async (e: ChangeEvent<HTMLSelectElement>) => {
        const newStatus = e.target.value as 'new' | 'open' | 'in_progress' | 'pending_customer' | 'closed';
        setIsUpdatingStatus(true);
        try {
            await axios.put(`/api/tickets/${ticket.id}`, { status: newStatus });
            setTicket(prev => ({ ...prev, status: newStatus }));
            toast.success(`Status updated to ${newStatus.replace('_', ' ')}`);
        } catch (err) { 
            toast.error('Failed to update status.');
        } finally { 
            setIsUpdatingStatus(false);
        }
    }, [ticket.id, setTicket]);
    
    const onReopenTicket = useCallback(async () => {
        const toastId = toast.loading('Reopening ticket...');
        try {
            await axios.post(`/api/admin/tickets/${ticket.id}/reopen`);
            toast.success('Ticket reopened!', { id: toastId });
            await refreshTicket();
        } catch (err) {
            const errorMsg = err instanceof AxiosError ? err.response?.data?.error : 'Failed to reopen ticket.';
            toast.error(errorMsg, { id: toastId });
        }
    }, [ticket.id, refreshTicket]);

    const onGetOrderStatusDraft = useCallback(async (): Promise<string> => {
        setIsLoadingOrderStatusDraft(true);
        try {
            const response = await axios.get<{ draftMessage: string }>(`/api/tickets/${ticket.id}/draft-order-status`);
            toast.success('Order status reply drafted!');
            return response.data.draftMessage;
        } catch (err) {
            const errorMsg = err instanceof AxiosError ? err.response?.data?.error || 'Failed to get order status.' : 'Failed to get order status.';
            toast.error(errorMsg);
            return '';
        } finally { 
            setIsLoadingOrderStatusDraft(false);
        }
    }, [ticket.id]);

    const onResendInvoice = useCallback(async () => {
        if (!relatedQuote) return;
        setIsResendingInvoice(true);
        try {
            await axios.post('/api/email/send-invoice', {
                draftOrderId: relatedQuote.id,
                recipientEmail: ticket.senderEmail,
                ticketId: ticket.id
            });
            toast.success('Invoice email resent!');
            await refreshTicket();
        } catch (err) { 
            toast.error('Failed to resend invoice.');
        } finally { 
            setIsResendingInvoice(false);
        }
    }, [relatedQuote, ticket.id, ticket.senderEmail, refreshTicket]);

    return {
        isUpdatingAssignee,
        isUpdatingStatus,
        isLoadingOrderStatusDraft,
        isResendingInvoice,
        handleAssigneeChange,
        handleStatusSelectChange,
        onReopenTicket,
        onGetOrderStatusDraft,
        onResendInvoice,
    };
} 