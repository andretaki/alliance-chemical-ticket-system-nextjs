'use client';

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ExternalLink, RefreshCw, MessageSquare, Loader2, Eye, EyeOff } from 'lucide-react';
import { RagSimilarResultsResponseSchema, type RagResultItem } from '@/lib/contracts';
import { useApiQuery } from '@/hooks/useApiQuery';

interface SimilarRepliesPanelProps {
  ticketId: number;
}

function formatDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ScoreBar({ score }: { score: number }) {
  const percentage = Math.round(score * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-purple-500 rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium w-8 text-right">{percentage}%</span>
    </div>
  );
}

function SkeletonResult() {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 animate-pulse">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-4 w-12 bg-gray-200 dark:bg-gray-700 rounded-full" />
        <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
      <div className="space-y-1.5">
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full" />
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
      </div>
    </div>
  );
}

export function SimilarRepliesPanel({ ticketId }: SimilarRepliesPanelProps) {
  const [includeInternal, setIncludeInternal] = useState(false);

  const url = useMemo(() => {
    const params = new URLSearchParams({
      ticketId: String(ticketId),
    });
    if (includeInternal) params.set('includeInternal', 'true');
    return `/api/rag/similar-replies?${params.toString()}`;
  }, [ticketId, includeInternal]);
  const {
    data,
    error,
    isLoading,
    refetch,
  } = useApiQuery(url, { schema: RagSimilarResultsResponseSchema });
  const results: RagResultItem[] = data?.results || [];

  return (
    <section className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-purple-50 dark:bg-purple-900/20">
            <MessageSquare className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Similar Replies</h3>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={includeInternal ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setIncludeInternal((prev) => !prev)}
            className={`h-7 px-2 text-xs ${
              includeInternal
                ? 'bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            {includeInternal ? (
              <><Eye className="h-3 w-3 mr-1" /> Internal</>
            ) : (
              <><EyeOff className="h-3 w-3 mr-1" /> Internal</>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refetch()}
            disabled={isLoading}
            className="h-7 px-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-2.5">
          <p className="text-xs text-red-700 dark:text-red-400">{error.message}</p>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-2">
          <SkeletonResult />
          <SkeletonResult />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && results.length === 0 && !error && (
        <div className="text-center py-6 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
          <MessageSquare className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
          <p className="text-xs text-gray-500 dark:text-gray-400">No similar replies found</p>
        </div>
      )}

      {/* Results */}
      {!isLoading && results.length > 0 && (
        <div className="space-y-2">
          {results.map((result) => (
            <div
              key={result.sourceId}
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                  <MessageSquare className="h-2.5 w-2.5" />
                  Reply
                </span>
                <span className="text-[10px] text-gray-500 dark:text-gray-400">{formatDate(result.sourceCreatedAt)}</span>
              </div>
              <p className="text-xs font-medium text-gray-900 dark:text-white mb-1 line-clamp-1">
                {result.title || 'Reply'}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2 mb-2">{result.snippet}</p>
              <div className="flex items-center justify-between gap-3">
                {result.sourceUri ? (
                  <a
                    href={result.sourceUri}
                    className="inline-flex items-center gap-1 text-[10px] text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 font-medium"
                    target="_blank"
                    rel="noreferrer"
                  >
                    View reply
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                ) : (
                  <span />
                )}
                <div className="w-20">
                  <ScoreBar score={result.score.finalScore || 0} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
