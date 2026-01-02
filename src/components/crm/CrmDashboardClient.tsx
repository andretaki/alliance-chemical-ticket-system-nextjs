'use client';

import React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StatusPill } from '@/components/ui/status-pill';
import { EmptyState } from '@/components/layout/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageShell } from '@/components/layout/PageShell';
import { Section } from '@/components/layout/Section';
import { StatCard } from '@/components/layout/StatCard';
import {
  Users,
  TrendingDown,
  Clock,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Phone,
  Mail,
  Building2,
  Target,
  ListTodo,
  PieChart,
} from 'lucide-react';
import type {
  CrmDashboardStats,
  WinRate,
  WhoToTalkToRow,
  PipelineHealthRow,
  StaleOpportunity,
  OpenTask,
} from '@/lib/contracts';

interface CrmDashboardClientProps {
  stats: CrmDashboardStats;
  whoToTalk: WhoToTalkToRow[];
  pipelineHealth: PipelineHealthRow[];
  staleOpportunities: StaleOpportunity[];
  openTasks: OpenTask[];
  winRate: WinRate;
}

// Format currency
function formatCurrency(value: number | string | null): string {
  if (!value) return '$0';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
}

// Format date relative
function timeAgo(date: Date | string | null): string {
  if (!date) return 'Never';
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}


// Churn Risk Badge
function ChurnBadge({ risk }: { risk: 'low' | 'medium' | 'high' | null }) {
  if (!risk) return null;

  const tone = {
    low: 'success',
    medium: 'warning',
    high: 'danger',
  } as const;

  return (
    <StatusPill tone={tone[risk]} size="sm" className="text-[10px]">
      {risk}
    </StatusPill>
  );
}

// Customer Row for "Who to talk to"
function CustomerRow({ customer }: { customer: WhoToTalkToRow }) {
  const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.company || 'Unknown';

  return (
    <Link
      href={`/customers/${customer.customerId}`}
      className="group flex items-center gap-4 rounded-lg border border-transparent px-3 py-3 transition-colors hover:border-border/80 hover:bg-muted/50"
    >
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-muted">
        <Building2 className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground group-hover:text-foreground">
            {name}
          </span>
          {customer.isVip && (
            <StatusPill tone="warning" size="sm" className="px-1.5 text-[10px]">
              VIP
            </StatusPill>
          )}
          <ChurnBadge risk={customer.churnRisk} />
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
          {customer.company && <span>{customer.company}</span>}
          <span>LTV: {formatCurrency(customer.ltv)}</span>
          <span>Last order: {timeAgo(customer.lastOrderDate)}</span>
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        {customer.openTicketCount > 0 && (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            {customer.openTicketCount} tickets
          </Badge>
        )}
        <div className="flex gap-1">
          {customer.primaryPhone && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
              <Phone className="h-3.5 w-3.5" />
            </Button>
          )}
          {customer.primaryEmail && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
              <Mail className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </Link>
  );
}

// Pipeline Stage Card
function PipelineStageCard({ stage, data }: { stage: string; data: PipelineHealthRow | undefined }) {
  const stageLabels: Record<string, string> = {
    lead: 'Leads',
    quote_sent: 'Quotes Sent',
    won: 'Won',
    lost: 'Lost',
  };

  const stageColors: Record<string, string> = {
    lead: 'text-muted-foreground',
    quote_sent: 'text-amber-600 dark:text-amber-400',
    won: 'text-emerald-600 dark:text-emerald-400',
    lost: 'text-red-600 dark:text-red-400',
  };

  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4">
      <div className={cn('text-xs font-medium', stageColors[stage] || 'text-muted-foreground')}>
        {stageLabels[stage] || stage}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-xl font-semibold text-foreground">{data?.count || 0}</span>
        {data?.staleCount && data.staleCount > 0 && (
          <span className="text-xs text-amber-600 dark:text-amber-400">({data.staleCount} stale)</span>
        )}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {formatCurrency(data?.totalValue || 0)}
      </div>
    </div>
  );
}

// Stale Opportunity Row
function StaleOpportunityRow({ opp }: { opp: StaleOpportunity }) {
  return (
    <Link
      href={`/opportunities/${opp.id}`}
      className="group flex items-center gap-3 rounded-lg border border-transparent px-3 py-2 transition-colors hover:border-border/80 hover:bg-muted/50"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground group-hover:text-foreground">
          {opp.title}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{opp.customerName || opp.company || 'Unknown'}</span>
          <span>·</span>
          <span className="text-amber-600 dark:text-amber-400">{Math.floor(opp.daysInStage)}d in quote_sent</span>
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-medium text-foreground">{formatCurrency(opp.estimatedValue)}</div>
        {opp.ownerName && <div className="text-xs text-muted-foreground">{opp.ownerName}</div>}
      </div>
    </Link>
  );
}

// Task Row
function TaskRow({ task }: { task: OpenTask }) {
  const typeLabels: Record<string, string> = {
    FOLLOW_UP: 'Follow Up',
    CHURN_WATCH: 'Churn Watch',
    VIP_TICKET: 'VIP Ticket',
    AR_OVERDUE: 'AR Overdue',
    SLA_BREACH: 'SLA Breach',
    MERGE_REVIEW: 'Merge Review',
    MERGE_REQUIRED: 'Merge Review',
  };

  const typeTones: Record<string, 'neutral' | 'warning' | 'danger'> = {
    FOLLOW_UP: 'neutral',
    CHURN_WATCH: 'danger',
    VIP_TICKET: 'warning',
    AR_OVERDUE: 'warning',
    SLA_BREACH: 'danger',
    MERGE_REVIEW: 'warning',
    MERGE_REQUIRED: 'warning',
  };

  // Determine link destination
  let href = '#';
  if (task.customerId) href = `/customers/${task.customerId}`;
  if (task.opportunityId) href = `/opportunities/${task.opportunityId}`;
  if (task.ticketId) href = `/tickets/${task.ticketId}`;

  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-lg border border-transparent px-3 py-2 transition-colors hover:border-border/80 hover:bg-muted/50"
    >
      <StatusPill tone={typeTones[task.type] || 'neutral'} size="sm" className="text-[10px]">
        {typeLabels[task.type] || task.type}
      </StatusPill>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-foreground">
          {task.customerName || task.opportunityTitle || `Task #${task.id}`}
        </div>
        {task.reason && (
          <div className="mt-0.5 text-xs text-muted-foreground">{task.reason.replace(/_/g, ' ')}</div>
        )}
      </div>
      {task.dueAt && (
        <div className="text-xs text-muted-foreground">
          Due {timeAgo(task.dueAt)}
        </div>
      )}
    </Link>
  );
}

export default function CrmDashboardClient({
  stats,
  whoToTalk,
  pipelineHealth,
  staleOpportunities,
  openTasks,
  winRate,
}: CrmDashboardClientProps) {
  // Create a map for easier stage lookup
  const pipelineMap = new Map(pipelineHealth.map(p => [p.stage, p]));

  return (
    <PageShell size="wide">
      <PageHeader
        title="CRM"
        description="Customer health, pipeline priorities, and action items."
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-2" asChild>
              <Link href="/customers">
                <Users className="h-4 w-4" />
                All Customers
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="gap-2" asChild>
              <Link href="/opportunities">
                <Target className="h-4 w-4" />
                All Opportunities
              </Link>
            </Button>
          </>
        }
      />

      <Section title="Signals" description="Where attention is needed right now.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="High Churn Risk"
            value={stats.highChurnCustomers}
            description="Customers needing attention"
            icon={TrendingDown}
            tone="danger"
          />
          <StatCard
            title="Stale Quotes"
            value={stats.staleQuotes}
            description="Quotes > 14 days old"
            icon={Clock}
            tone="warning"
            href="/opportunities?stale=true"
          />
          <StatCard
            title="Open Tasks"
            value={stats.openTasks}
            description="Action items pending"
            icon={ListTodo}
            href="/tasks"
          />
          <StatCard
            title="Pipeline Value"
            value={formatCurrency(stats.pipelineValue)}
            description="Open opportunities"
            icon={DollarSign}
            href="/opportunities"
          />
        </div>
      </Section>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Who to Talk To - 2 columns */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="border-b border-border/60 pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <AlertTriangle className="h-4 w-4 text-red-500 dark:text-red-400" />
                  Who to Talk to Today
                </CardTitle>
                <span className="text-xs text-muted-foreground">High churn risk, sorted by LTV</span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[400px]">
                <div className="p-2">
                  {whoToTalk.length === 0 ? (
                    <EmptyState
                      icon={CheckCircle2}
                      title="No high-risk customers"
                      description="Health scores refresh after orders, tickets, and engagement events. Check back after the next sync."
                      action={
                        <Button variant="outline" size="sm" asChild>
                          <Link href="/customers">Review all customers</Link>
                        </Button>
                      }
                    />
                  ) : (
                    <div className="space-y-1">
                      {whoToTalk.map((customer) => (
                        <CustomerRow key={customer.customerId} customer={customer} />
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Pipeline Snapshot */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <PieChart className="h-4 w-4 text-primary" />
                  Pipeline
                </CardTitle>
                <Link
                  href="/opportunities"
                  className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <PipelineStageCard stage="lead" data={pipelineMap.get('lead')} />
                <PipelineStageCard stage="quote_sent" data={pipelineMap.get('quote_sent')} />
              </div>

              {/* Win Rate */}
              <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Win Rate (90d)</span>
                  <span className="text-sm font-medium text-foreground">{winRate.winRate}%</span>
                </div>
                <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="bg-emerald-500"
                    style={{ width: `${winRate.winRate}%` }}
                  />
                  <div
                    className="bg-red-500"
                    style={{ width: `${100 - winRate.winRate}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                  <span>{winRate.won} won</span>
                  <span>{winRate.lost} lost</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Open Tasks */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <ListTodo className="h-4 w-4 text-primary" />
                  Open Tasks
                </CardTitle>
                <Link
                  href="/tasks"
                  className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[200px]">
                <div className="p-2">
                  {openTasks.length === 0 ? (
                    <EmptyState
                      icon={CheckCircle2}
                      title="No open tasks"
                      description="Tasks appear when churn risk spikes, invoices go overdue, or SLAs breach."
                      action={
                        <Button variant="outline" size="sm" asChild>
                          <Link href="/tasks">Review task rules</Link>
                        </Button>
                      }
                    />
                  ) : (
                    <div className="space-y-1">
                      {openTasks.slice(0, 5).map((task) => (
                        <TaskRow key={task.id} task={task} />
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Stale Opportunities Section */}
      {staleOpportunities.length > 0 && (
        <section className="mt-6">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  Stale Quotes Needing Follow-up
                </CardTitle>
                <Badge variant="warning" size="sm">
                  {staleOpportunities.length} quotes
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/60">
                {staleOpportunities.map((opp) => (
                  <StaleOpportunityRow key={opp.id} opp={opp} />
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}
    </PageShell>
  );
}
