'use client';

import React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  WhoToTalkToRow,
  PipelineHealthRow,
  StaleOpportunity,
  OpenTask,
} from '@/services/crm/crmDashboardService';

interface CrmDashboardClientProps {
  stats: {
    highChurnCustomers: number;
    staleQuotes: number;
    openTasks: number;
    pipelineValue: number;
  };
  whoToTalk: WhoToTalkToRow[];
  pipelineHealth: PipelineHealthRow[];
  staleOpportunities: StaleOpportunity[];
  openTasks: OpenTask[];
  winRate: { won: number; lost: number; winRate: number };
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

// Stat Card
function StatCard({
  title,
  value,
  description,
  icon: Icon,
  variant = 'default',
  href,
}: {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ElementType;
  variant?: 'default' | 'success' | 'warning' | 'danger';
  href?: string;
}) {
  const variantStyles = {
    default: 'text-indigo-600 dark:text-indigo-400',
    success: 'text-emerald-600 dark:text-emerald-400',
    warning: 'text-amber-600 dark:text-amber-400',
    danger: 'text-red-600 dark:text-red-400',
  };

  const content = (
    <Card className="group relative overflow-hidden border-gray-200 bg-white shadow-sm transition-all hover:border-gray-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</CardTitle>
        <div className={cn('rounded-lg bg-gray-100 p-2 dark:bg-gray-700', variantStyles[variant])}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-gray-900 tabular-nums dark:text-white">{value}</span>
        </div>
        {description && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{description}</p>}
      </CardContent>
      {href && (
        <div className="absolute bottom-3 right-3 opacity-0 transition-opacity group-hover:opacity-100">
          <ArrowRight className="h-4 w-4 text-gray-400 dark:text-gray-500" />
        </div>
      )}
    </Card>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}

// Churn Risk Badge
function ChurnBadge({ risk }: { risk: 'low' | 'medium' | 'high' | null }) {
  if (!risk) return null;

  const styles = {
    low: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    medium: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    high: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400',
  };

  return (
    <Badge variant="outline" className={cn('text-[10px]', styles[risk])}>
      {risk}
    </Badge>
  );
}

// Customer Row for "Who to talk to"
function CustomerRow({ customer }: { customer: WhoToTalkToRow }) {
  const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.company || 'Unknown';

  return (
    <Link
      href={`/customers/${customer.customerId}`}
      className="group flex items-center gap-4 rounded-lg border border-transparent px-3 py-3 transition-all hover:border-gray-200 hover:bg-gray-50 dark:hover:border-gray-700 dark:hover:bg-gray-800"
    >
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
        <Building2 className="h-4 w-4 text-gray-500 dark:text-gray-400" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-gray-800 group-hover:text-gray-900 dark:text-gray-200 dark:group-hover:text-white">
            {name}
          </span>
          {customer.isVip && (
            <Badge variant="outline" className="border-amber-200 bg-amber-50 px-1.5 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
              VIP
            </Badge>
          )}
          <ChurnBadge risk={customer.churnRisk} />
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          {customer.company && <span>{customer.company}</span>}
          <span>LTV: {formatCurrency(customer.ltv)}</span>
          <span>Last order: {timeAgo(customer.lastOrderDate)}</span>
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        {customer.openTicketCount > 0 && (
          <Badge variant="outline" className="border-gray-200 bg-gray-50 text-[10px] text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
            {customer.openTicketCount} tickets
          </Badge>
        )}
        <div className="flex gap-1">
          {customer.primaryPhone && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300">
              <Phone className="h-3.5 w-3.5" />
            </Button>
          )}
          {customer.primaryEmail && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300">
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
    lead: 'text-blue-600 dark:text-blue-400',
    quote_sent: 'text-amber-600 dark:text-amber-400',
    won: 'text-emerald-600 dark:text-emerald-400',
    lost: 'text-red-600 dark:text-red-400',
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className={cn('text-xs font-medium', stageColors[stage] || 'text-gray-500 dark:text-gray-400')}>
        {stageLabels[stage] || stage}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-xl font-bold text-gray-900 dark:text-white">{data?.count || 0}</span>
        {data?.staleCount && data.staleCount > 0 && (
          <span className="text-xs text-amber-600 dark:text-amber-400">({data.staleCount} stale)</span>
        )}
      </div>
      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
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
      className="group flex items-center gap-3 rounded-lg border border-transparent px-3 py-2 transition-all hover:border-gray-200 hover:bg-gray-50 dark:hover:border-gray-700 dark:hover:bg-gray-800"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-gray-700 group-hover:text-gray-900 dark:text-gray-200 dark:group-hover:text-white">
          {opp.title}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span>{opp.customerName || opp.company || 'Unknown'}</span>
          <span>·</span>
          <span className="text-amber-600 dark:text-amber-400">{Math.floor(opp.daysInStage)}d in quote_sent</span>
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-200">{formatCurrency(opp.estimatedValue)}</div>
        {opp.ownerName && <div className="text-xs text-gray-500 dark:text-gray-400">{opp.ownerName}</div>}
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
  };

  const typeColors: Record<string, string> = {
    FOLLOW_UP: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    CHURN_WATCH: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400',
    VIP_TICKET: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    AR_OVERDUE: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    SLA_BREACH: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400',
  };

  // Determine link destination
  let href = '#';
  if (task.customerId) href = `/customers/${task.customerId}`;
  if (task.opportunityId) href = `/opportunities/${task.opportunityId}`;
  if (task.ticketId) href = `/tickets/${task.ticketId}`;

  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-lg border border-transparent px-3 py-2 transition-all hover:border-gray-200 hover:bg-gray-50 dark:hover:border-gray-700 dark:hover:bg-gray-800"
    >
      <Badge variant="outline" className={cn('text-[10px]', typeColors[task.type] || 'text-gray-600 dark:text-gray-400')}>
        {typeLabels[task.type] || task.type}
      </Badge>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-gray-700 dark:text-gray-200">
          {task.customerName || task.opportunityTitle || `Task #${task.id}`}
        </div>
        {task.reason && (
          <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{task.reason.replace(/_/g, ' ')}</div>
        )}
      </div>
      {task.dueAt && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
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
    <div className="mx-auto max-w-7xl">
      {/* Header */}
      <header className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">CRM</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Customer health, pipeline priorities, and action items.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              asChild
            >
              <Link href="/customers">
                <Users className="h-4 w-4" />
                All Customers
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              asChild
            >
              <Link href="/opportunities">
                <Target className="h-4 w-4" />
                All Opportunities
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Stats Grid */}
      <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="High Churn Risk"
          value={stats.highChurnCustomers}
          description="Customers needing attention"
          icon={TrendingDown}
          variant="danger"
        />
        <StatCard
          title="Stale Quotes"
          value={stats.staleQuotes}
          description="Quotes > 14 days old"
          icon={Clock}
          variant="warning"
          href="/opportunities?stale=true"
        />
        <StatCard
          title="Open Tasks"
          value={stats.openTasks}
          description="Action items pending"
          icon={ListTodo}
          variant="default"
          href="/tasks"
        />
        <StatCard
          title="Pipeline Value"
          value={formatCurrency(stats.pipelineValue)}
          description="Open opportunities"
          icon={DollarSign}
          variant="success"
          href="/opportunities"
        />
      </section>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Who to Talk To - 2 columns */}
        <div className="lg:col-span-2">
          <Card className="border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <CardHeader className="border-b border-gray-100 pb-4 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base font-medium text-gray-900 dark:text-white">
                  <AlertTriangle className="h-4 w-4 text-red-500 dark:text-red-400" />
                  Who to Talk to Today
                </CardTitle>
                <span className="text-xs text-gray-500 dark:text-gray-400">High churn risk, sorted by LTV</span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[400px]">
                <div className="p-2">
                  {whoToTalk.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <CheckCircle2 className="mb-3 h-10 w-10 text-emerald-500/50 dark:text-emerald-400/50" />
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No high-risk customers</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Customer health is looking good
                      </p>
                    </div>
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
          <Card className="border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base font-medium text-gray-900 dark:text-white">
                  <PieChart className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  Pipeline
                </CardTitle>
                <Link
                  href="/opportunities"
                  className="flex items-center gap-1 text-xs text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
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
              <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Win Rate (90d)</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{winRate.winRate}%</span>
                </div>
                <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                  <div
                    className="bg-emerald-500"
                    style={{ width: `${winRate.winRate}%` }}
                  />
                  <div
                    className="bg-red-500"
                    style={{ width: `${100 - winRate.winRate}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-gray-500 dark:text-gray-400">
                  <span>{winRate.won} won</span>
                  <span>{winRate.lost} lost</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Open Tasks */}
          <Card className="border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base font-medium text-gray-900 dark:text-white">
                  <ListTodo className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  Open Tasks
                </CardTitle>
                <Link
                  href="/tasks"
                  className="flex items-center gap-1 text-xs text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[200px]">
                <div className="p-2">
                  {openTasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-500/50 dark:text-emerald-400/50" />
                      <p className="text-xs text-gray-500 dark:text-gray-400">No open tasks</p>
                    </div>
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
          <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base font-medium text-gray-900 dark:text-white">
                  <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  Stale Quotes Needing Follow-up
                </CardTitle>
                <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  {staleOpportunities.length} quotes
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-amber-200 dark:divide-amber-800">
                {staleOpportunities.map((opp) => (
                  <StaleOpportunityRow key={opp.id} opp={opp} />
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
