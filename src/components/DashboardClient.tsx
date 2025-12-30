'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useSession } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge, PriorityBadge, PriorityDot } from '@/components/StatusBadge';
import {
  Ticket,
  AlertCircle,
  Clock,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Plus,
  ArrowRight,
  Search,
  Sparkles,
  Users,
  FileText,
  BarChart3,
  Activity,
  Zap,
} from 'lucide-react';

interface TicketSummary {
  id: number;
  title: string;
  status: 'new' | 'open' | 'in_progress' | 'pending_customer' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  createdAt: string;
  updatedAt: string;
  assigneeName: string | null;
  senderEmail?: string | null;
  type?: string | null;
}

interface DashboardStats {
  active: number;
  critical: number;
  newToday: number;
  closedToday: number;
  avgResponseTime: string;
  slaCompliance: number;
}

// Stat Card Component
function StatCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  trendValue,
  variant = 'default',
  href,
  isLoading,
}: {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ElementType;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
  href?: string;
  isLoading?: boolean;
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
        {isLoading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-gray-900 tabular-nums dark:text-white">{value}</span>
              {trend && trendValue && (
                <span
                  className={cn(
                    'flex items-center gap-0.5 text-xs font-medium',
                    trend === 'up' && 'text-emerald-600 dark:text-emerald-400',
                    trend === 'down' && 'text-red-600 dark:text-red-400',
                    trend === 'neutral' && 'text-gray-500 dark:text-gray-400'
                  )}
                >
                  {trend === 'up' && <TrendingUp className="h-3 w-3" />}
                  {trend === 'down' && <TrendingDown className="h-3 w-3" />}
                  {trendValue}
                </span>
              )}
            </div>
            {description && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{description}</p>}
          </>
        )}
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

// Ticket Row Component for lists
function TicketRow({ ticket }: { ticket: TicketSummary }) {
  const timeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <Link
      href={`/tickets/${ticket.id}`}
      className="group flex items-center gap-4 rounded-lg border border-transparent px-3 py-3 transition-all hover:border-gray-200 hover:bg-gray-50 dark:hover:border-gray-700 dark:hover:bg-gray-800"
    >
      <PriorityDot priority={ticket.priority} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-gray-800 group-hover:text-gray-900 dark:text-gray-200 dark:group-hover:text-white">
            {ticket.title}
          </span>
          <span className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500">#{ticket.id}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span>{ticket.senderEmail || 'Unknown'}</span>
          <span>·</span>
          <span>{timeAgo(ticket.updatedAt)}</span>
        </div>
      </div>
      <StatusBadge status={ticket.status} size="sm" showIcon={false} />
    </Link>
  );
}

// Quick Action Button
function QuickAction({
  icon: Icon,
  label,
  href,
  variant = 'default',
}: {
  icon: React.ElementType;
  label: string;
  href: string;
  variant?: 'default' | 'primary';
}) {
  return (
    <Link href={href}>
      <Button
        variant={variant === 'primary' ? 'default' : 'outline'}
        className={cn(
          'h-auto w-full flex-col gap-2 px-4 py-4',
          variant === 'primary' && 'bg-indigo-600 hover:bg-indigo-500'
        )}
      >
        <Icon className="h-5 w-5" />
        <span className="text-xs">{label}</span>
      </Button>
    </Link>
  );
}

export default function DashboardClient() {
  const { data: sessionData } = useSession();
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('needs-attention');

  // Get user from session
  const session = sessionData;

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/tickets');
      const data = await res.json();
      const allTickets: TicketSummary[] = data.data || [];

      setTickets(allTickets);

      // Calculate stats
      const activeStatuses = ['new', 'open', 'in_progress', 'pending_customer'];
      const criticalPriorities = ['high', 'urgent'];
      const today = new Date().toISOString().split('T')[0];

      const active = allTickets.filter((t) => activeStatuses.includes(t.status)).length;
      const critical = allTickets.filter(
        (t) => activeStatuses.includes(t.status) && criticalPriorities.includes(t.priority)
      ).length;
      const newToday = allTickets.filter((t) => t.createdAt.startsWith(today)).length;
      const closedToday = allTickets.filter(
        (t) => t.status === 'closed' && t.updatedAt.startsWith(today)
      ).length;

      setStats({
        active,
        critical,
        newToday,
        closedToday,
        avgResponseTime: '2.4h',
        slaCompliance: 94,
      });
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [fetchData]);

  // Filter tickets for different views
  const urgentTickets = tickets
    .filter((t) => ['high', 'urgent'].includes(t.priority) && t.status !== 'closed')
    .slice(0, 5);

  const recentTickets = tickets
    .filter((t) => t.status !== 'closed')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  const newTickets = tickets.filter((t) => t.status === 'new').slice(0, 5);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">Dashboard</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Welcome back, {session?.user?.name?.split(' ')[0] || 'there'}. Here&apos;s what&apos;s happening.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                asChild
              >
                <Link href="/tickets">
                  <Search className="h-4 w-4" />
                  View All Tickets
                </Link>
              </Button>
              <Button size="sm" className="gap-2 bg-indigo-600 hover:bg-indigo-500" asChild>
                <Link href="/tickets/create">
                  <Plus className="h-4 w-4" />
                  New Ticket
                </Link>
              </Button>
            </div>
          </div>
        </header>

        {/* Stats Grid */}
        <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Active Tickets"
            value={stats?.active ?? '-'}
            description="Open and in progress"
            icon={Ticket}
            href="/tickets?status=open,in_progress"
            isLoading={isLoading}
          />
          <StatCard
            title="Critical"
            value={stats?.critical ?? '-'}
            description="High & urgent priority"
            icon={AlertCircle}
            variant="danger"
            href="/tickets?priority=high,urgent"
            isLoading={isLoading}
          />
          <StatCard
            title="New Today"
            value={stats?.newToday ?? '-'}
            description="Created in last 24h"
            icon={Clock}
            trend="up"
            trendValue="+12%"
            variant="success"
            isLoading={isLoading}
          />
          <StatCard
            title="SLA Compliance"
            value={stats ? `${stats.slaCompliance}%` : '-'}
            description="Response within target"
            icon={CheckCircle2}
            variant="success"
            isLoading={isLoading}
          />
        </section>

        {/* Main Content Grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Tickets Section - 2 columns */}
          <div className="lg:col-span-2">
            <Card className="border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <CardHeader className="border-b border-gray-100 pb-4 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-medium text-gray-900 dark:text-white">Tickets</CardTitle>
                  <Link
                    href="/tickets"
                    className="flex items-center gap-1 text-xs text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    View all <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </CardHeader>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="border-b border-gray-100 px-4 dark:border-gray-700">
                  <TabsList className="h-10 w-full justify-start gap-4 bg-transparent p-0">
                    <TabsTrigger
                      value="needs-attention"
                      className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-0 pb-3 pt-2 text-sm font-medium text-gray-500 transition-all data-[state=active]:border-indigo-500 data-[state=active]:text-gray-900 dark:text-gray-400 dark:data-[state=active]:text-white"
                    >
                      Needs Attention
                      {urgentTickets.length > 0 && (
                        <Badge
                          variant="outline"
                          className="ml-2 h-5 border-red-200 bg-red-50 px-1.5 text-[10px] text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400"
                        >
                          {urgentTickets.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger
                      value="new"
                      className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-0 pb-3 pt-2 text-sm font-medium text-gray-500 transition-all data-[state=active]:border-indigo-500 data-[state=active]:text-gray-900 dark:text-gray-400 dark:data-[state=active]:text-white"
                    >
                      New
                      {newTickets.length > 0 && (
                        <Badge
                          variant="outline"
                          className="ml-2 h-5 border-indigo-200 bg-indigo-50 px-1.5 text-[10px] text-indigo-700 dark:border-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400"
                        >
                          {newTickets.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger
                      value="recent"
                      className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-0 pb-3 pt-2 text-sm font-medium text-gray-500 transition-all data-[state=active]:border-indigo-500 data-[state=active]:text-gray-900 dark:text-gray-400 dark:data-[state=active]:text-white"
                    >
                      Recent Activity
                    </TabsTrigger>
                  </TabsList>
                </div>
                <CardContent className="p-0">
                  <ScrollArea className="h-[340px]">
                    <div className="p-2">
                      <TabsContent value="needs-attention" className="m-0">
                        {isLoading ? (
                          <div className="space-y-2 p-2">
                            {[...Array(5)].map((_, i) => (
                              <Skeleton key={i} className="h-16 w-full" />
                            ))}
                          </div>
                        ) : urgentTickets.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-12 text-center">
                            <CheckCircle2 className="mb-3 h-10 w-10 text-emerald-500/50 dark:text-emerald-400/50" />
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">All caught up!</p>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              No urgent tickets need your attention
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {urgentTickets.map((ticket) => (
                              <TicketRow key={ticket.id} ticket={ticket} />
                            ))}
                          </div>
                        )}
                      </TabsContent>
                      <TabsContent value="new" className="m-0">
                        {isLoading ? (
                          <div className="space-y-2 p-2">
                            {[...Array(5)].map((_, i) => (
                              <Skeleton key={i} className="h-16 w-full" />
                            ))}
                          </div>
                        ) : newTickets.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-12 text-center">
                            <Ticket className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No new tickets</p>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              New tickets from email or form submissions appear here
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {newTickets.map((ticket) => (
                              <TicketRow key={ticket.id} ticket={ticket} />
                            ))}
                          </div>
                        )}
                      </TabsContent>
                      <TabsContent value="recent" className="m-0">
                        {isLoading ? (
                          <div className="space-y-2 p-2">
                            {[...Array(5)].map((_, i) => (
                              <Skeleton key={i} className="h-16 w-full" />
                            ))}
                          </div>
                        ) : recentTickets.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-12 text-center">
                            <Activity className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No recent activity</p>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              Ticket updates will appear here
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {recentTickets.map((ticket) => (
                              <TicketRow key={ticket.id} ticket={ticket} />
                            ))}
                          </div>
                        )}
                      </TabsContent>
                    </div>
                  </ScrollArea>
                </CardContent>
              </Tabs>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <Card className="border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-base font-medium text-gray-900 dark:text-white">
                  <Zap className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <QuickAction icon={Plus} label="New Ticket" href="/tickets/create" variant="primary" />
                  <QuickAction icon={FileText} label="New Quote" href="/admin/quotes/create" />
                  <QuickAction icon={Users} label="Customers" href="/customers" />
                  <QuickAction icon={BarChart3} label="Reports" href="/admin/resolution-dashboard" />
                </div>
              </CardContent>
            </Card>

            {/* AI Insights */}
            <Card className="border-indigo-100 bg-gradient-to-br from-indigo-50 via-purple-50/50 to-white dark:border-indigo-900/50 dark:from-indigo-950/30 dark:via-purple-950/20 dark:to-gray-800">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-base font-medium text-gray-900 dark:text-white">
                  <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  AI Insights
                </CardTitle>
                <CardDescription className="text-gray-500 dark:text-gray-400">
                  Powered by intelligent analysis
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
                  <div className="mb-1 flex items-center gap-2">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-200">Response Time</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Average response time improved by 18% this week
                  </p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
                  <div className="mb-1 flex items-center gap-2">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    <span className="text-xs font-medium text-amber-800 dark:text-amber-200">Attention Needed</span>
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    3 tickets approaching SLA deadline in the next 2 hours
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Team Activity */}
            <Card className="border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-medium text-gray-900 dark:text-white">Team Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { name: 'Sarah Chen', action: 'resolved', ticket: 'Shipping delay inquiry', time: '5m ago' },
                    { name: 'Mike Ross', action: 'assigned', ticket: 'Quote request #2847', time: '12m ago' },
                    { name: 'Alex Kim', action: 'commented', ticket: 'Product availability', time: '28m ago' },
                  ].map((activity, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="bg-gray-100 text-[10px] text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                          {activity.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-gray-600 dark:text-gray-300">
                          <span className="font-medium text-gray-900 dark:text-gray-100">{activity.name}</span>{' '}
                          {activity.action}{' '}
                          <span className="text-indigo-600 dark:text-indigo-400">{activity.ticket}</span>
                        </p>
                        <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">{activity.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
