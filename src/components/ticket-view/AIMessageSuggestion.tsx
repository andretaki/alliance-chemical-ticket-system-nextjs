'use client';

import React from 'react';
import { Button, Card } from 'react-bootstrap';
import DOMPurify from 'dompurify';
import { Bot, X, Copy, Send } from 'lucide-react';

interface AIMessageSuggestionProps {
  draftContent: string;
  onApproveAndSendDraft: (content: string) => void;
  onDiscard: () => void;
  isSubmitting?: boolean;
}

export function AIMessageSuggestion({
  draftContent,
  onApproveAndSendDraft,
  onDiscard,
  isSubmitting = false
}: AIMessageSuggestionProps) {
  return (
    <Card className="ai-suggestion-card mb-3 border-primary">
      <Card.Header className="bg-primary text-white d-flex align-items-center gap-2">
        <Bot className="w-4 h-4" />
        <strong>AI Draft Ready</strong>
      </Card.Header>
      <Card.Body>
        <div className="ai-draft-preview mb-3">
          <div
            className="p-3 bg-light border rounded"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(draftContent.replace(/\n/g, '<br>'))
            }}
          />
        </div>
        <div className="d-flex gap-2 justify-content-end">
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={onDiscard}
            disabled={isSubmitting}
            className="d-flex align-items-center gap-1"
          >
            <X className="w-4 h-4" />
            Discard
          </Button>
          <Button
            variant="outline-primary"
            size="sm"
            onClick={() => navigator.clipboard.writeText(draftContent)}
            disabled={isSubmitting}
            className="d-flex align-items-center gap-1"
          >
            <Copy className="w-4 h-4" />
            Copy
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onApproveAndSendDraft(draftContent)}
            disabled={isSubmitting}
            className="d-flex align-items-center gap-1"
          >
            <Send className="w-4 h-4" />
            {isSubmitting ? 'Sending...' : 'Use & Send'}
          </Button>
        </div>
      </Card.Body>
    </Card>
  );
}

export default AIMessageSuggestion; 