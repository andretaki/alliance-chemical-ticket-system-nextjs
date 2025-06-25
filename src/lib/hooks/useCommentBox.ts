import { useState, useCallback, FormEvent } from 'react';
import axios, { AxiosError } from 'axios';
import toast from 'react-hot-toast';
import type { AttachmentData, TicketComment as CommentData } from '@/types/ticket';

interface UseCommentBoxProps {
    ticketId: number;
    refreshTicket: () => Promise<void>;
    onSuccess?: () => void;
}

export function useCommentBox({ ticketId, refreshTicket, onSuccess }: UseCommentBoxProps) {
    const [newComment, setNewComment] = useState('');
    const [isInternalNote, setIsInternalNote] = useState(false);
    const [sendAsEmail, setSendAsEmail] = useState(true);
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);
    const [files, setFiles] = useState<File[]>([]);

    const handleCommentSubmit = useCallback(async (event?: FormEvent) => {
        event?.preventDefault();
        if (!newComment.trim() && files.length === 0) return;

        setIsSubmittingComment(true);
        const toastId = toast.loading('Submitting...');

        try {
            let attachmentIds: number[] = [];
            if (files.length > 0) {
                const formData = new FormData();
                files.forEach(file => formData.append('files', file));
                
                const uploadResponse = await axios.post<{ attachments: AttachmentData[] }>(
                    `/api/tickets/${ticketId}/attachments`,
                    formData,
                    { headers: { 'Content-Type': 'multipart/form-data' } }
                );
                attachmentIds = uploadResponse.data.attachments.map(att => att.id);
            }

            await axios.post(`/api/tickets/${ticketId}/reply`, {
                content: newComment,
                isInternalNote,
                sendAsEmail,
                attachmentIds,
            });

            toast.success('Reply submitted!', { id: toastId });
            setNewComment('');
            setFiles([]);
            refreshTicket();
            onSuccess?.();
        } catch (error) {
            const errorMessage = error instanceof AxiosError
                ? error.response?.data?.error || 'An unexpected error occurred.'
                : 'An unknown error occurred.';
            toast.error(errorMessage, { id: toastId });
        } finally {
            setIsSubmittingComment(false);
        }
    }, [newComment, files, ticketId, isInternalNote, sendAsEmail, refreshTicket, onSuccess]);

    const handleApproveAndSendDraft = useCallback((draftText: string) => {
        setNewComment(draftText);
        setIsInternalNote(false);
        setSendAsEmail(true);
        toast.success('AI suggestion moved to reply box. Review and send.'); // This toast remains as it's a direct user action
    }, [setNewComment, setIsInternalNote, setSendAsEmail]);

    return {
        newComment,
        setNewComment,
        isInternalNote,
        setIsInternalNote,
        sendAsEmail,
        setSendAsEmail,
        isSubmittingComment,
        files,
        setFiles,
        handleCommentSubmit,
        handleApproveAndSendDraft,
    };
} 