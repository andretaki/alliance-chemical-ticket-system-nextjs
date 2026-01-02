'use client';

import React, { useCallback, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/layout/EmptyState';
import { StatusPill } from '@/components/ui/status-pill';
import { Search, ExternalLink, Database, MessageSquare, Mail, FileText, Loader2, Brain } from 'lucide-react';
import { ApiResponseSchema, RagQueryResponseSchema, type RagQueryResponse, type RagResultItem, type RagTruthResult } from '@/lib/contracts';

interface CustomerMemoryPanelProps {
  customerId: number;
}

const confidenceConfig = {
  high: { label: 'High confidence', tone: 'success' },
  medium: { label: 'Medium confidence', tone: 'warning' },
  low: { label: 'Low confidence', tone: 'danger' },
} as const;

const sourceTypeConfig: Record<string, { icon: React.ElementType; label: string }> = {
  ticket: { icon: FileText, label: 'Ticket' },
  ticket_comment: { icon: MessageSquare, label: 'Comment' },
  email: { icon: Mail, label: 'Email' },
  interaction: { icon: MessageSquare, label: 'Interaction' },
  order: { icon: Database, label: 'Order' },
  payment: { icon: Database, label: 'Payment' },
  shipment: { icon: Database, label: 'Shipment' },
};

function formatDate(input?: string | null) {
  if (!input) return '';
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return String(input);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function truthDate(result: RagTruthResult) {
  const data = (result.data || {}) as Record<string, unknown>;
  const candidates = [
    data.placedAt,
    data.shipDate,
    data.deliveryDate,
    data.dueDate,
    data.expirationDate,
    data.lastInvoiceDate,
    data.lastPaymentDate,
  ];
  const candidate = candidates.find((value) => typeof value === 'string');
  return formatDate(candidate as string | undefined);
}

function evidenceAuthor(result: RagResultItem) {
  const meta = (result.metadata || {}) as Record<string, unknown>;
  if (result.sourceType === 'email') {
    return (meta.fromEmail || meta.senderName || 'Email') as string;
  }
  if (result.sourceType === 'ticket') {
    return (meta.senderName || meta.senderEmail || 'Ticket') as string;
  }
  if (result.sourceType === 'ticket_comment') {
    if (meta.isInternalNote) return 'Internal note';
    if (meta.isOutgoingReply) return 'Agent reply';
    if (meta.isFromCustomer) return 'Customer';
    return 'Comment';
  }
  if (result.sourceType === 'interaction') {
    return meta.channel ? `Interaction (${meta.channel})` : 'Interaction';
  }
  return 'System';
}

function SourceBadge({ sourceType }: { sourceType: string }) {
  const config = sourceTypeConfig[sourceType] || {
    icon: Database,
    label: sourceType.replace(/_/g, ' '),
  };
  const Icon = config.icon;

  return (
    <Badge variant="outline" size="sm" className="gap-1 text-foreground/80">
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function ScoreBar({ score }: { score: number }) {
  const percentage = Math.round(score * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted/60 overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs font-medium text-muted-foreground w-10 text-right">{percentage}%</span>
    </div>
  );
}

function SkeletonResult() {
  return (
    <div className="rounded-lg border border-border bg-card p-4 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-5 w-16 rounded-full bg-muted/60" />
        <div className="h-4 w-32 rounded bg-muted/60" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full rounded bg-muted/60" />
        <div className="h-3 w-4/5 rounded bg-muted/60" />
      </div>
    </div>
  );
}

export function CustomerMemoryPanel({ customerId }: CustomerMemoryPanelProps) {
  const [queryText, setQueryText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState<string | null>(null);
  const [results, setResults] = useState<RagQueryResponse | null>(null);

  const runQuery = useCallback(async () => {
    if (!queryText.trim()) return;
    setIsLoading(true);
    setError(null);
    setDenyReason(null);

    try {
      const response = await fetch('/api/rag/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queryText,
          customerId,
          topK: 12,
        }),
      });

      const json = await response.json();
      const parsed = ApiResponseSchema(RagQueryResponseSchema).safeParse(json);
      if (!parsed.success) {
        throw new Error('Invalid API response');
      }
      if (!parsed.data.success) {
        const reason = (parsed.data.error.details as { denyReason?: string } | undefined)?.denyReason;
        if (reason) {
          setDenyReason(reason);
          setError(`Access denied: ${reason}`);
          return;
        }
        setError(parsed.data.error.message);
        return;
      }

      setResults(parsed.data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to query customer memory');
    } finally {
      setIsLoading(false);
    }
  }, [customerId, queryText]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      runQuery();
    }
  };

  const hasResults = results && (results.truthResults?.length || results.evidenceResults.length);

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60">
              <Brain className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-base">Customer Memory</CardTitle>
          </div>
          {results?.confidence && (
            <StatusPill tone={confidenceConfig[results.confidence].tone} size="sm">
              {confidenceConfig[results.confidence].label}
            </StatusPill>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search Input */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={queryText}
              onChange={(event) => setQueryText(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search customer history..."
              className="pl-9 bg-muted/40 focus:bg-background"
            />
          </div>
          <Button onClick={runQuery} disabled={!queryText.trim() || isLoading} className="px-4">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
          </Button>
        </div>

        {/* Error State */}
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
            <p className="text-sm text-destructive">{error}</p>
            {denyReason && (
              <p className="mt-1 text-xs text-destructive/80">Deny reason: {denyReason}</p>
            )}
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-3">
            <SkeletonResult />
            <SkeletonResult />
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !hasResults && !error && (
          <EmptyState
            title="Search customer history"
            description="Find orders, tickets, and past conversations."
            icon={Search}
          />
        )}

        {/* Results */}
        {!isLoading && hasResults && (
          <div className="space-y-5">
            {/* Truth Results */}
            {results.truthResults && results.truthResults.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">System Data</h4>
                </div>
                <div className="space-y-2">
                  {results.truthResults.map((result, index) => (
                    <div key={`${result.type}-${index}`} className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-border/80 hover:bg-muted/30">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <SourceBadge sourceType={result.type} />
                          <span className="text-sm font-medium text-foreground">{result.label}</span>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{truthDate(result)}</span>
                      </div>
                      {result.snippet && (
                        <p className="text-sm text-foreground/80 line-clamp-2">{result.snippet}</p>
                      )}
                      {result.sourceUri && (
                        <a
                          href={result.sourceUri}
                          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          View details
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Evidence Results */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Related Conversations</h4>
              </div>
              {results.evidenceResults.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">No matching conversations found.</p>
              ) : (
                <div className="space-y-2">
                  {results.evidenceResults.map((result) => (
                    <div key={result.sourceId} className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-border/80 hover:bg-muted/30">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <SourceBadge sourceType={result.sourceType} />
                          <span className="text-sm font-medium text-foreground">{result.title || result.sourceType}</span>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(result.sourceCreatedAt)}</span>
                      </div>
                      <p className="mb-1 text-xs text-muted-foreground">{evidenceAuthor(result)}</p>
                      <p className="mb-3 text-sm text-foreground/80 line-clamp-2">{result.snippet}</p>
                      <div className="flex items-center justify-between gap-4">
                        {result.sourceUri ? (
                          <a
                            href={result.sourceUri}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open source
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : <span />}
                        <div className="w-24">
                          <ScoreBar score={result.score.finalScore || 0} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
