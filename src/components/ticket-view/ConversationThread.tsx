'use client';

import React from 'react';
import DOMPurify from 'dompurify';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  MessageSquare,
  Mail,
  MailCheck,
  Lock,
  Paperclip,
  ExternalLink,
  Clock,
  CheckCircle2,
} from 'lucide-react';

interface Attachment {
  id: number;
  filename: string;
  originalFilename?: string;
  mimeType?: string;
  fileSize?: number;
  url?: string;
}

interface Comment {
  id: number;
  commentText: string | null;
  createdAt: string;
  commenter: {
    id?: string;
    name: string | null;
    email?: string | null;
  } | null;
  isInternalNote: boolean;
  isFromCustomer: boolean;
  isOutgoingReply: boolean;
  attachments?: Attachment[];
}

interface ConversationThreadProps {
  comments: Comment[];
  ticket: {
    id: number;
    senderName?: string | null;
    senderEmail?: string | null;
  };
}

// Time formatting
function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(hours / 24);

  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: days > 365 ? 'numeric' : undefined,
  });
}

function formatFullTime(dateString: string): string {
  return new Date(dateString).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// File size formatter
function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Individual message component
function Message({ comment, isFirst }: { comment: Comment; isFirst: boolean }) {
  const isInternal = comment.isInternalNote;
  const isCustomer = comment.isFromCustomer;
  const isOutgoing = comment.isOutgoingReply;

  // Determine message type for styling
  const messageType = isInternal ? 'internal' : isOutgoing ? 'outgoing' : 'incoming';

  const styles = {
    internal: {
      container: 'bg-amber-50 border-amber-200 dark:bg-amber-500/5 dark:border-amber-500/20',
      avatar: 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400',
      badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-400',
      icon: Lock,
    },
    outgoing: {
      container: 'bg-indigo-50 border-indigo-200 dark:bg-indigo-500/5 dark:border-indigo-500/20',
      avatar: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400',
      badge: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/15 dark:text-indigo-400',
      icon: MailCheck,
    },
    incoming: {
      container: 'bg-gray-50 border-gray-200 dark:bg-gray-800/50 dark:border-gray-700',
      avatar: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
      badge: 'border-gray-200 bg-gray-100 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400',
      icon: Mail,
    },
  };

  const style = styles[messageType];
  const Icon = style.icon;

  return (
    <TooltipProvider>
      <div className={cn('group relative', isFirst && 'pt-0')}>
        {/* Timeline connector */}
        {!isFirst && (
          <div className="absolute left-5 -top-4 h-4 w-px bg-gray-200 dark:bg-gray-700" />
        )}

        <div className="flex gap-4">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <Avatar className="h-10 w-10">
              <AvatarFallback className={cn('text-sm font-medium', style.avatar)}>
                {comment.commenter?.name?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div
              className={cn(
                'absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white dark:border-gray-900',
                isInternal ? 'bg-amber-500' : isOutgoing ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'
              )}
            >
              <Icon className="h-2 w-2 text-white" />
            </div>
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            {/* Header */}
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {comment.commenter?.name || 'Unknown'}
              </span>
              {isInternal && (
                <Badge variant="outline" className={cn('text-[10px]', style.badge)}>
                  <Lock className="mr-1 h-2.5 w-2.5" />
                  Internal Note
                </Badge>
              )}
              {isOutgoing && (
                <Badge variant="outline" className={cn('text-[10px]', style.badge)}>
                  <MailCheck className="mr-1 h-2.5 w-2.5" />
                  Sent to Customer
                </Badge>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{formatTime(comment.createdAt)}</span>
                </TooltipTrigger>
                <TooltipContent>{formatFullTime(comment.createdAt)}</TooltipContent>
              </Tooltip>
            </div>

            {/* Message Body */}
            <div
              className={cn(
                'rounded-lg border p-4 transition-all',
                style.container,
                'hover:border-opacity-80'
              )}
            >
              {comment.commentText ? (
                <div
                  className="prose prose-sm max-w-none text-gray-700 dark:text-gray-200
                    prose-p:my-1.5 prose-p:leading-relaxed
                    prose-a:text-indigo-600 dark:prose-a:text-indigo-400 prose-a:no-underline hover:prose-a:underline
                    prose-strong:text-gray-900 dark:prose-strong:text-white prose-strong:font-semibold
                    prose-ul:my-2 prose-ol:my-2
                    prose-li:my-0.5"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(comment.commentText) }}
                />
              ) : (
                <p className="text-sm italic text-gray-400 dark:text-gray-500">No content</p>
              )}

              {/* Attachments */}
              {comment.attachments && comment.attachments.length > 0 && (
                <div className="mt-3 border-t border-gray-200 dark:border-gray-700 pt-3">
                  <div className="flex flex-wrap gap-2">
                    {comment.attachments.map((attachment) => (
                      <a
                        key={attachment.id}
                        href={attachment.url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group/file flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 transition-all hover:border-gray-300 hover:bg-gray-100 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                        <span className="max-w-[150px] truncate">
                          {attachment.originalFilename || attachment.filename}
                        </span>
                        {attachment.fileSize && (
                          <span className="text-gray-400 dark:text-gray-500">
                            ({formatFileSize(attachment.fileSize)})
                          </span>
                        )}
                        <ExternalLink className="h-3 w-3 opacity-0 transition-opacity group-hover/file:opacity-100" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

export function ConversationThread({ comments, ticket }: ConversationThreadProps) {
  if (comments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
          <MessageSquare className="h-8 w-8 text-gray-400 dark:text-gray-500" />
        </div>
        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">No messages yet</p>
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
          Start the conversation by sending a reply
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {comments.map((comment, index) => (
        <Message key={comment.id} comment={comment} isFirst={index === 0} />
      ))}

      {/* End of conversation indicator */}
      <div className="flex items-center justify-center gap-3 py-4">
        <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
          <Clock className="h-3 w-3" />
          <span>
            {comments.length} message{comments.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
      </div>
    </div>
  );
}
