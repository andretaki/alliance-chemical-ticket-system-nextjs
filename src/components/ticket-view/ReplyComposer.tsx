// Reply Composer Component
'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

interface ReplyComposerProps {
  ticketId: number;
  senderEmail: string | null;
  onSubmit: (text: string, isInternal: boolean, sendEmail: boolean, files: File[]) => void;
  aiSuggestion?: string;
}

export function ReplyComposer({ ticketId, senderEmail, onSubmit, aiSuggestion }: ReplyComposerProps) {
  const [text, setText] = useState(aiSuggestion || '');
  const [isInternal, setIsInternal] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);

  // Update text when AI suggestion changes
  useEffect(() => {
    if (aiSuggestion) {
      setText(aiSuggestion);
    }
  }, [aiSuggestion]);

  const handleSubmit = () => {
    onSubmit(text, isInternal, sendEmail, []);
    setText('');
  };

  return (
    <div className="border-t border-border bg-card p-4">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a reply..."
        className="w-full min-h-[120px] p-3 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <div className="flex items-center justify-between mt-3">
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={isInternal}
              onChange={(e) => setIsInternal(e.target.checked)}
              className="rounded"
            />
            Internal Note
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
              className="rounded"
            />
            Send Email
          </label>
        </div>
        <Button onClick={handleSubmit} disabled={!text.trim()}>
          Send Reply
        </Button>
      </div>
    </div>
  );
}
