'use client';

import React, { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Kbd } from '@/components/ui/kbd';
import {
  Reply,
  Send,
  Lock,
  Mail,
  Paperclip,
  X,
  Sparkles,
  Maximize2,
  Minimize2,
} from 'lucide-react';

interface ReplyComposerProps {
  ticketId: number;
  senderEmail: string | null;
  onSubmit: (text: string, isInternal: boolean, sendEmail: boolean, files: File[]) => void;
  aiSuggestion?: string;
  isSubmitting?: boolean;
}

export function ReplyComposer({
  ticketId,
  senderEmail,
  onSubmit,
  aiSuggestion,
  isSubmitting = false,
}: ReplyComposerProps) {
  const [text, setText] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Apply AI suggestion when available
  useEffect(() => {
    if (aiSuggestion) {
      setText(aiSuggestion);
      setIsExpanded(true);
      textareaRef.current?.focus();
    }
  }, [aiSuggestion]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current && isExpanded) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 300)}px`;
    }
  }, [text, isExpanded]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // R to expand reply composer (only when not in an input/textarea)
      if (e.key === 'r' && !isExpanded && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setIsExpanded(true);
        setTimeout(() => textareaRef.current?.focus(), 0);
      }
      // Cmd/Ctrl + Enter to submit
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && isExpanded && text.trim()) {
        e.preventDefault();
        if (!isSubmitting) {
          onSubmit(text, isInternal, sendEmail && !isInternal, attachments);
          setText('');
          setAttachments([]);
          setIsExpanded(false);
          setIsFullscreen(false);
        }
      }
      // Escape to collapse
      if (e.key === 'Escape' && isExpanded) {
        e.preventDefault();
        if (isFullscreen) {
          setIsFullscreen(false);
        } else if (!text.trim()) {
          setIsExpanded(false);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded, isFullscreen, text, isSubmitting, isInternal, sendEmail, attachments, onSubmit]);

  const handleSubmit = () => {
    if (!text.trim() || isSubmitting) return;
    onSubmit(text, isInternal, sendEmail && !isInternal, attachments);
    setText('');
    setAttachments([]);
    setIsExpanded(false);
    setIsFullscreen(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachments((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleExpand = () => {
    setIsExpanded(true);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  // Collapsed state
  if (!isExpanded) {
    return (
      <div className="border-b border-gray-200 bg-white px-5 py-3 dark:border-gray-800 dark:bg-gray-900">
        <button
          onClick={handleExpand}
          className="group flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-left transition-all hover:border-gray-300 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600 dark:hover:bg-gray-700"
        >
          <Reply className="h-4 w-4 text-gray-400 transition-colors group-hover:text-gray-500 dark:text-gray-500 dark:group-hover:text-gray-400" />
          <span className="flex-1 text-sm text-gray-500 transition-colors group-hover:text-gray-600 dark:text-gray-400 dark:group-hover:text-gray-300">
            Write a reply...
          </span>
          <Kbd className="opacity-0 transition-opacity group-hover:opacity-100">R</Kbd>
        </button>
      </div>
    );
  }

  // Expanded state
  return (
    <TooltipProvider>
      <div
        className={cn(
          'border-b border-gray-200 bg-white transition-all dark:border-gray-800 dark:bg-gray-900',
          isFullscreen && 'fixed inset-0 z-50 flex flex-col border-0'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-2 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
              {isInternal ? 'Internal Note' : 'Reply'}
            </span>
            {!isInternal && senderEmail && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                to {senderEmail}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className="h-7 w-7 p-0 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (!text.trim()) {
                      setIsExpanded(false);
                      setIsFullscreen(false);
                    }
                  }}
                  className="h-7 w-7 p-0 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                >
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Close</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Textarea */}
        <div className={cn('flex-1 px-5 py-3', isFullscreen && 'overflow-y-auto')}>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={isInternal ? 'Write an internal note...' : 'Write your reply...'}
            className={cn(
              'w-full resize-none bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none dark:text-gray-100 dark:placeholder:text-gray-500',
              isFullscreen ? 'min-h-[200px]' : 'min-h-[80px]'
            )}
            autoFocus
          />

          {/* AI Suggestion indicator */}
          {aiSuggestion && text === aiSuggestion && (
            <div className="mt-2 flex items-center gap-2 text-xs text-indigo-500 dark:text-indigo-400">
              <Sparkles className="h-3 w-3" />
              <span>AI-generated suggestion - feel free to edit</span>
            </div>
          )}

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {attachments.map((file, index) => (
                <div
                  key={index}
                  className="group flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                >
                  <Paperclip className="h-3 w-3" />
                  <span className="max-w-[150px] truncate">{file.name}</span>
                  <button
                    onClick={() => removeAttachment(index)}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="h-3 w-3 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3 dark:border-gray-800">
          <div className="flex items-center gap-3">
            {/* Mode Toggle */}
            <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-gray-700 dark:bg-gray-800">
              <button
                onClick={() => {
                  setIsInternal(false);
                  setSendEmail(true);
                }}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                  !isInternal
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                )}
              >
                <Mail className="h-3 w-3" />
                Reply
              </button>
              <button
                onClick={() => {
                  setIsInternal(true);
                  setSendEmail(false);
                }}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                  isInternal
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                )}
              >
                <Lock className="h-3 w-3" />
                Internal
              </button>
            </div>

            {/* Send Email Toggle (only for replies) */}
            {!isInternal && (
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-gray-300 bg-gray-50 text-indigo-500 focus:ring-0 focus:ring-offset-0 dark:border-gray-600 dark:bg-gray-700"
                />
                <span className="text-xs text-gray-500 dark:text-gray-400">Send email to customer</span>
              </label>
            )}

            {/* Attach Files */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-8 w-8 p-0 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Attach files</TooltipContent>
            </Tooltip>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setText('');
                setAttachments([]);
                setIsExpanded(false);
                setIsFullscreen(false);
              }}
              className="text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!text.trim() || isSubmitting}
              className={cn(
                'gap-2',
                isInternal
                  ? 'bg-amber-600 hover:bg-amber-500'
                  : 'bg-indigo-600 hover:bg-indigo-500'
              )}
            >
              {isSubmitting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  {isInternal ? 'Add Note' : sendEmail ? 'Send Reply' : 'Add Comment'}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
