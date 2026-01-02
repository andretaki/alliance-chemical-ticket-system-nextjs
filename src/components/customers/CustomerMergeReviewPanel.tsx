'use client';

import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Merge, RefreshCw } from 'lucide-react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useApiQuery } from '@/hooks/useApiQuery';
import {
  MergeCandidateSchema,
  type MergeCandidate,
} from '@/lib/contracts';

interface CustomerMergeReviewPanelProps {
  customerId: number;
  taskId?: number | null;
}

const candidatesSchema = z.array(MergeCandidateSchema);

export function CustomerMergeReviewPanel({ customerId, taskId }: CustomerMergeReviewPanelProps) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isMerging, setIsMerging] = useState(false);

  const url = useMemo(() => `/api/customers/${customerId}/merge-candidates`, [customerId]);
  const { data, error, isLoading, refetch } = useApiQuery<MergeCandidate[]>(
    url,
    { schema: candidatesSchema }
  );

  const candidates = data || [];

  const toggleSelection = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  };

  const handleMerge = async () => {
    if (selectedIds.length === 0) return;
    setIsMerging(true);
    setActionError(null);
    try {
      const response = await fetch('/api/customers/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryCustomerId: customerId,
          mergeCustomerIds: selectedIds,
        }),
      });
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error?.message || 'Merge failed');
      }

      if (taskId) {
        await fetch(`/api/tasks/${taskId}/complete`, { method: 'POST' });
      }

      setSelectedIds([]);
      await refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Merge failed');
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Merge Review
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => void refetch()} disabled={isLoading}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error.message}
          </div>
        )}
        {actionError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {actionError}
          </div>
        )}

        {isLoading && (
          <div className="text-sm text-muted-foreground">Loading merge candidates...</div>
        )}

        {!isLoading && candidates.length === 0 && (
          <div className="text-sm text-muted-foreground">
            No merge candidates found. Check identities for duplicates and retry.
          </div>
        )}

        {!isLoading && candidates.length > 0 && (
          <div className="space-y-2">
            {candidates.map((candidate) => {
              const name =
                [candidate.firstName, candidate.lastName].filter(Boolean).join(' ') ||
                candidate.company ||
                `Customer #${candidate.id}`;
              const isSelected = selectedIds.includes(candidate.id);
              return (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => toggleSelection(candidate.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                    isSelected
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-border hover:border-border/80 hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">
                        {name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {candidate.primaryEmail || candidate.primaryPhone || 'No primary contact info'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {candidate.matchedOn.map((match) => (
                        <Badge key={`${candidate.id}-${match}`} variant="secondary" size="sm">
                          {match}
                        </Badge>
                      ))}
                      {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {selectedIds.length} selected
          </div>
          <Button
            size="sm"
            onClick={handleMerge}
            disabled={selectedIds.length === 0 || isMerging}
            className="gap-2"
          >
            <Merge className="h-4 w-4" />
            {isMerging ? 'Merging...' : 'Merge Customers'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
