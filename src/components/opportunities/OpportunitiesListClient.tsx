'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/layout/EmptyState';
import { StatCard } from '@/components/layout/StatCard';
import { opportunityStageEnum } from '@/db/schema';
import { AlertTriangle, TrendingUp, DollarSign, Clock, Search, RefreshCw } from 'lucide-react';

type OpportunityRow = {
  id: number;
  title: string;
  stage: string;
  division: string | null;
  source: string | null;
  estimatedValue: string | null;
  currency: string;
  ownerName: string | null;
  customerId: number;
  customerName: string | null;
  customerEmail: string | null;
  createdAt: string;
  stageChangedAt: string | null;
};

type PipelineHealthRow = {
  stage: string;
  count: number;
  totalValue: number;
  staleCount: number;
};

interface Props {
  initial: OpportunityRow[];
  pipelineHealth?: PipelineHealthRow[];
}

const stageOptions = opportunityStageEnum.enumValues;

const STALE_THRESHOLD_DAYS = 14;

function isStaleOpportunity(opp: OpportunityRow): boolean {
  if (opp.stage !== 'quote_sent' || !opp.stageChangedAt) return false;
  const changedDate = new Date(opp.stageChangedAt);
  const now = new Date();
  const daysInStage = (now.getTime() - changedDate.getTime()) / (1000 * 60 * 60 * 24);
  return daysInStage > STALE_THRESHOLD_DAYS;
}

function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export function OpportunitiesListClient({ initial, pipelineHealth = [] }: Props) {
  const [data, setData] = useState<OpportunityRow[]>(initial);
  const [stage, setStage] = useState<string>('all');
  const [division, setDivision] = useState<string>('all');
  const [ownerId, setOwnerId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [owners, setOwners] = useState<{ id: string; name: string | null; email: string; }[]>([]);
  const [loading, setLoading] = useState(false);
  const [showStaleOnly, setShowStaleOnly] = useState(false);

  useEffect(() => {
    fetch('/api/users')
      .then(res => res.json())
      .then(setOwners)
      .catch((err) => {
        console.error('[OpportunitiesListClient] Failed to fetch users:', err);
      });
  }, []);

  const refresh = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (stage !== 'all') params.append('stage', stage);
    if (division !== 'all') params.append('division', division);
    if (ownerId !== 'all') params.append('ownerId', ownerId);
    if (search.trim()) params.append('search', search.trim());

    const res = await fetch(`/api/opportunities?${params.toString()}`);
    const json = await res.json();
    const raw = json?.data;
    setData(Array.isArray(raw) ? raw : []);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, division, ownerId]);

  // Compute pipeline totals
  const totalCount = pipelineHealth.reduce((sum, r) => sum + r.count, 0);
  const totalValue = pipelineHealth.reduce((sum, r) => sum + Number(r.totalValue || 0), 0);
  const totalStale = pipelineHealth.reduce((sum, r) => sum + r.staleCount, 0);

  // Filter data for stale only mode - computed dynamically from stageChangedAt
  const displayData = showStaleOnly ? data.filter(isStaleOpportunity) : data;

  return (
    <>
      {/* Pipeline Health Header */}
      {pipelineHealth.length > 0 && (
        <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Open Pipeline"
            value={totalCount}
            description="opportunities"
            icon={TrendingUp}
          />
          <StatCard
            title="Total Value"
            value={formatCurrency(totalValue)}
            description="in pipeline"
            icon={DollarSign}
          />
          <StatCard
            title="Stale Quotes"
            value={totalStale}
            description=">14 days in quote_sent"
            icon={AlertTriangle}
            tone="warning"
          />
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <div className="p-1.5 bg-muted/60 rounded">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <span className="font-medium">By Stage</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {pipelineHealth.map((s) => (
                  <span key={s.stage} className="text-xs bg-muted/70 text-foreground px-2 py-0.5 rounded font-medium">
                    {s.stage}: {s.count}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="border-b border-border/60">
          <CardTitle className="text-foreground">Opportunities</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search title..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && refresh()}
                className="pl-9"
              />
            </div>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className="w-40 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:ring-2 focus:ring-ring/30"
            >
              <option value="all">All stages</option>
              {stageOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <select
              value={division}
              onChange={(e) => setDivision(e.target.value)}
              className="w-40 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:ring-2 focus:ring-ring/30"
            >
              <option value="all">All divisions</option>
              <option value="gov">gov</option>
              <option value="local">local</option>
              <option value="other">other</option>
            </select>

            <select
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              className="w-48 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:ring-2 focus:ring-ring/30"
            >
              <option value="all">All owners</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>{o.name || o.email}</option>
              ))}
            </select>

            <Button onClick={refresh} disabled={loading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>

            {/* Stale Only Toggle */}
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer bg-muted/40 px-3 py-2 rounded-lg border border-border hover:bg-muted/60 transition-colors">
              <input
                type="checkbox"
                checked={showStaleOnly}
                onChange={(e) => setShowStaleOnly(e.target.checked)}
                className="rounded border-input bg-background text-amber-500 focus:ring-amber-500"
              />
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                Stale only
              </span>
            </label>
          </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full text-sm" aria-label="Opportunities list">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground font-medium">
              <tr>
                <th scope="col" className="px-4 py-3 text-left">Title</th>
                <th scope="col" className="px-4 py-3 text-left">Customer</th>
                <th scope="col" className="px-4 py-3 text-left">Stage</th>
                <th scope="col" className="px-4 py-3 text-left">Value</th>
                <th scope="col" className="px-4 py-3 text-left">Owner</th>
                <th scope="col" className="px-4 py-3 text-left">Division</th>
                <th scope="col" className="px-4 py-3 text-left">Source</th>
                <th scope="col" className="px-4 py-3 text-left">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 bg-card">
              {displayData.length === 0 ? (
                <tr>
                  <td className="px-4 py-8" colSpan={8}>
                    <EmptyState
                      icon={AlertTriangle}
                      title={showStaleOnly ? 'No stale opportunities' : 'No opportunities yet'}
                      description={
                        showStaleOnly
                          ? 'Quotes appear here once they remain in quote_sent for more than 14 days.'
                          : 'Opportunities are created from quotes and CRM imports. Create a quote to start tracking.'
                      }
                      action={
                        <Button variant="outline" size="sm" asChild>
                          <Link href="/admin/quotes/create">Create a quote</Link>
                        </Button>
                      }
                      className="border-0 bg-transparent"
                    />
                  </td>
                </tr>
              ) : (
                displayData.map((opp) => {
                  const isStale = isStaleOpportunity(opp);
                  return (
                    <tr
                      key={opp.id}
                      className={cn(
                        'transition-colors hover:bg-muted/60',
                        isStale && 'bg-amber-50/60 dark:bg-amber-900/15'
                      )}
                    >
                      <td className="px-4 py-3 font-medium text-foreground">
                        <Link href={`/opportunities/${opp.id}`} className="flex items-center gap-2 hover:text-primary">
                          {opp.title}
                          {isStale && (
                            <span title="Stale quote">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {opp.customerName || opp.customerEmail || `Customer ${opp.customerId}`}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" size="sm" className="text-xs">
                          {opp.stage}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-foreground font-medium">
                        {opp.currency} {opp.estimatedValue ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {opp.ownerName || '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{opp.division || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{opp.source || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(opp.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
    </>
  );
}
