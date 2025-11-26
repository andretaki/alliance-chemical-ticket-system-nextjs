// AI Copilot Panel Component
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';

interface AICopilotPanelProps {
  ticket: any;
  aiSuggestion: { type: string; content: string } | null;
  onApplySuggestion: (content: string) => void;
  onDismiss: () => void;
}

export function AICopilotPanel({ ticket, aiSuggestion, onApplySuggestion, onDismiss }: AICopilotPanelProps) {
  return (
    <div className="p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-2">AI Summary</h3>
        <p className="text-sm text-muted-foreground">
          {ticket.ai_summary || 'No AI summary available'}
        </p>
      </div>

      {aiSuggestion && (
        <div className="rounded-lg border bg-muted/50 p-4">
          <div className="flex items-start justify-between mb-2">
            <h4 className="font-medium text-sm">AI Suggestion</h4>
            <button onClick={onDismiss} className="text-xs text-muted-foreground hover:text-foreground">
              Dismiss
            </button>
          </div>
          <p className="text-sm mb-3">{aiSuggestion.content}</p>
          <Button size="sm" onClick={() => onApplySuggestion(aiSuggestion.content)}>
            Apply Suggestion
          </Button>
        </div>
      )}

      {ticket.sentiment && (
        <div>
          <h4 className="text-sm font-medium mb-2">Sentiment</h4>
          <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
            ticket.sentiment === 'positive' ? 'bg-green-100 text-green-800' :
            ticket.sentiment === 'negative' ? 'bg-red-100 text-red-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {ticket.sentiment}
          </span>
        </div>
      )}
    </div>
  );
}
