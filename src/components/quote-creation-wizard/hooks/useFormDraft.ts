import { useEffect, useCallback, useRef } from 'react';
import { UseFormWatch, UseFormReset } from 'react-hook-form';
import { QuoteFormData } from '../types';
import { toast } from 'react-hot-toast';

const DRAFT_KEY_PREFIX = 'quote-draft';
const DRAFT_TIMESTAMP_KEY = 'quote-draft-timestamp';
const AUTOSAVE_INTERVAL = 3000; // Auto-save every 3 seconds

interface UseFormDraftOptions {
  watch: UseFormWatch<QuoteFormData>;
  reset: UseFormReset<QuoteFormData>;
  ticketId?: number;
}

export const useFormDraft = ({ watch, reset, ticketId }: UseFormDraftOptions) => {
  const draftKey = ticketId ? `${DRAFT_KEY_PREFIX}-${ticketId}` : DRAFT_KEY_PREFIX;
  const timestampKey = ticketId ? `${DRAFT_TIMESTAMP_KEY}-${ticketId}` : DRAFT_TIMESTAMP_KEY;
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Save draft to localStorage
  const saveDraft = useCallback((data: QuoteFormData) => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(data));
      localStorage.setItem(timestampKey, new Date().toISOString());
      console.log('📝 Draft saved to localStorage');
    } catch (error) {
      console.error('Failed to save draft:', error);
    }
  }, [draftKey, timestampKey]);

  // Load draft from localStorage
  const loadDraft = useCallback((): { data: QuoteFormData | null; timestamp: string | null } => {
    try {
      const savedData = localStorage.getItem(draftKey);
      const timestamp = localStorage.getItem(timestampKey);

      if (savedData) {
        const parsedData = JSON.parse(savedData) as QuoteFormData;
        console.log('📂 Draft loaded from localStorage');
        return { data: parsedData, timestamp };
      }
    } catch (error) {
      console.error('Failed to load draft:', error);
    }
    return { data: null, timestamp: null };
  }, [draftKey, timestampKey]);

  // Clear draft from localStorage
  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(draftKey);
      localStorage.removeItem(timestampKey);
      console.log('🗑️ Draft cleared from localStorage');
    } catch (error) {
      console.error('Failed to clear draft:', error);
    }
  }, [draftKey, timestampKey]);

  // Restore draft if available
  const restoreDraft = useCallback(() => {
    const { data, timestamp } = loadDraft();

    if (data && timestamp) {
      const draftDate = new Date(timestamp);
      const now = new Date();
      const hoursSinceLastSave = (now.getTime() - draftDate.getTime()) / (1000 * 60 * 60);

      // Only restore if draft is less than 7 days old
      if (hoursSinceLastSave < 168) {
        reset(data);
        toast.success(
          `Draft restored from ${draftDate.toLocaleDateString()} at ${draftDate.toLocaleTimeString()}`,
          { duration: 5000 }
        );
        return true;
      } else {
        // Clear old draft
        clearDraft();
        toast.error('Draft was too old and has been discarded');
      }
    }
    return false;
  }, [loadDraft, reset, clearDraft]);

  // Check if draft exists
  const hasDraft = useCallback((): boolean => {
    return !!localStorage.getItem(draftKey);
  }, [draftKey]);

  // Auto-save functionality
  useEffect(() => {
    const subscription = watch((data) => {
      // Clear existing timer
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }

      // Set new timer for auto-save
      autoSaveTimerRef.current = setTimeout(() => {
        saveDraft(data as QuoteFormData);
      }, AUTOSAVE_INTERVAL);
    });

    return () => {
      subscription.unsubscribe();
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [watch, saveDraft]);

  return {
    saveDraft,
    loadDraft,
    clearDraft,
    restoreDraft,
    hasDraft,
  };
};
