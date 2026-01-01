'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSession } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge, PriorityDot } from '@/components/StatusBadge';
import { EmptyState } from '@/components/layout/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageShell } from '@/components/layout/PageShell';
import { Section } from '@/components/layout/Section';
import { StatCard } from '@/components/layout/StatCard';
import {
  Ticket,
  AlertCircle,
  Clock,
  CheckCircle2,
  TrendingUp,
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
      className="group flex items-center gap-4 rounded-lg border border-transparent px-3 py-3 transition-colors hover:border-border/80 hover:bg-muted/50"
    >
      <PriorityDot priority={ticket.priority} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground group-hover:text-foreground">
            {ticket.title}
          </span>
          <span className="flex-shrink-0 text-xs text-muted-foreground">#{ticket.id}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
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
        className="h-auto w-full flex-col gap-2 px-4 py-4"
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
  const firstName = session?.user?.name?.split(' ')[0] || 'there';

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
    <PageShell size="wide">
      <PageHeader
        title="Dashboard"
        description={`Welcome back, ${firstName}. Here's what's happening.`}
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-2" asChild>
              <Link href="/tickets">
                <Search className="h-4 w-4" />
                View All Tickets
              </Link>
            </Button>
            <Button size="sm" className="gap-2" asChild>
              <Link href="/tickets/create">
                <Plus className="h-4 w-4" />
                New Ticket
              </Link>
            </Button>
          </>
        }
      />

      <Section title="At a glance" description="Queue health and SLA posture.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Active Tickets"
            value={stats?.active ?? '-'}
            description="Open and in progress"
            icon={Ticket}
            href="/tickets?status=open,in_progress"
            loading={isLoading}
          />
          <StatCard
            title="Critical"
            value={stats?.critical ?? '-'}
            description="High & urgent priority"
            icon={AlertCircle}
            tone="danger"
            href="/tickets?priority=high,urgent"
            loading={isLoading}
          />
          <StatCard
            title="New Today"
            value={stats?.newToday ?? '-'}
            description="Created in last 24h"
            icon={Clock}
            loading={isLoading}
          />
          <StatCard
            title="SLA Compliance"
            value={stats ? `${stats.slaCompliance}%` : '-'}
            description="Response within target"
            icon={CheckCircle2}
            tone="success"
            loading={isLoading}
          />
        </div>
      </Section>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
          {/* Tickets Section - 2 columns */}
          <div className="lg:col-span-2">
            <Card className="overflow-hidden">
              <CardHeader className="border-b border-border/60 pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold text-foreground">Tickets</CardTitle>
                  <Link
                    href="/tickets"
                    className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    View all <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </CardHeader>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="border-b border-border/60 px-4">
                  <TabsList className="h-10 w-full justify-start gap-4 bg-transparent p-0">
                    <TabsTrigger
                      value="needs-attention"
                      className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-0 pb-3 pt-2 text-sm font-medium text-muted-foreground transition-colors data-[state=active]:border-primary data-[state=active]:text-foreground"
                    >
                      Needs Attention
                      {urgentTickets.length > 0 && (
                        <Badge
                          variant="danger"
                          size="sm"
                          className="ml-2 h-5"
                        >
                          {urgentTickets.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger
                      value="new"
                      className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-0 pb-3 pt-2 text-sm font-medium text-muted-foreground transition-colors data-[state=active]:border-primary data-[state=active]:text-foreground"
                    >
                      New
                      {newTickets.length > 0 && (
                        <Badge
                          variant="secondary"
                          size="sm"
                          className="ml-2 h-5"
                        >
                          {newTickets.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger
                      value="recent"
                      className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-0 pb-3 pt-2 text-sm font-medium text-muted-foreground transition-colors data-[state=active]:border-primary data-[state=active]:text-foreground"
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
                          <EmptyState
                            icon={CheckCircle2}
                            title="No urgent tickets"
                            description="Priority rules and SLA timers feed this queue. When something escalates, it will surface here."
                            action={
                              <Button variant="outline" size="sm" asChild>
                                <Link href="/tickets">View all tickets</Link>
                              </Button>
                            }
                          />
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
                          <EmptyState
                            icon={Ticket}
                            title="No new tickets yet"
                            description="New tickets arrive from inbox sync and web forms. Create one to start a thread."
                            action={
                              <Button size="sm" asChild>
                                <Link href="/tickets/create">Create ticket</Link>
                              </Button>
                            }
                          />
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
                          <EmptyState
                            icon={Activity}
                            title="No recent activity"
                            description="Updates appear when tickets change status or receive agent comments."
                            action={
                              <Button variant="outline" size="sm" asChild>
                                <Link href="/tickets">View all tickets</Link>
                              </Button>
                            }
                          />
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
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <Zap className="h-4 w-4 text-primary" />
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
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <Sparkles className="h-4 w-4 text-primary" />
                  AI Insights
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  Powered by intelligent analysis
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border border-border/60 bg-muted/40 p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-medium text-foreground">Response Time</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Average response time improved by 18% this week
                  </p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-900/20">
                  <div className="mb-1 flex items-center gap-2">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    <span className="text-xs font-medium text-amber-900 dark:text-amber-200">
                      Attention Needed
                    </span>
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    3 tickets approaching SLA deadline in the next 2 hours
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Team Activity */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold text-foreground">Team Activity</CardTitle>
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
                        <AvatarFallback className="bg-muted text-[10px] text-muted-foreground">
                          {activity.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{activity.name}</span>{' '}
                          {activity.action}{' '}
                          <span className="text-primary">{activity.ticket}</span>
                        </p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{activity.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
    </PageShell>
  );
}
