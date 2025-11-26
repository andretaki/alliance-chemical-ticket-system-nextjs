// Conversation Thread Component
'use client';

import React from 'react';

interface ConversationThreadProps {
  comments: any[];
  ticket: any;
}

export function ConversationThread({ comments, ticket }: ConversationThreadProps) {
  return (
    <div className="space-y-4">
      {comments.map((comment) => (
        <div key={comment.id} className="rounded-lg border p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                {comment.commenter?.name?.[0] || 'U'}
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{comment.commenter?.name || 'Unknown'}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(comment.createdAt).toLocaleString()}
                </span>
              </div>
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: comment.commentText }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
