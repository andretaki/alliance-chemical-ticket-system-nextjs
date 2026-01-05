import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getServerSession } from '@/lib/auth-helpers';
import { customerService } from '@/services/crm/customerService';
import { CustomerSnapshotCard } from '@/components/customers/CustomerSnapshotCard';
import { CustomerMemoryPanel } from '@/components/rag/CustomerMemoryPanel';
import { CustomerMergeReviewPanel } from '@/components/customers/CustomerMergeReviewPanel';
import { UnifiedOrdersPanel } from '@/components/customers/UnifiedOrdersPanel';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/layout/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageShell } from '@/components/layout/PageShell';
import { Section } from '@/components/layout/Section';
import { StatCard } from '@/components/layout/StatCard';
import { Badge } from '@/components/ui/badge';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { StatusPill } from '@/components/ui/status-pill';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, ShoppingBag, Ticket, Wallet, Users, Phone, Mail, Info, PhoneMissed, PhoneIncoming, PhoneOutgoing, Play, TrendingDown, ListTodo, Activity, DollarSign } from 'lucide-react';

interface PageProps {
  params: any;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (Number.isNaN(id)) return { title: 'Customer - Alliance Chemical' };

  const overview = await customerService.getOverviewById(id);
  if (!overview) return { title: 'Customer not found - Alliance Chemical' };

  const name = [overview.firstName, overview.lastName].filter(Boolean).join(' ') || 'Customer';
  return {
    title: `${name} - Customer 360`,
    description: `Orders, tickets, and identities for ${name}`,
  };
}

export default async function CustomerPage({ params }: PageProps) {
  const { id: idParam } = await params;

  // BYPASS AUTH
  // const { session, error } = await getServerSession();
  // if (error || !session?.user) {
  //   redirect(`/auth/signin?callbackUrl=/customers/${idParam}`);
  // }

  const id = Number(idParam);
  if (Number.isNaN(id)) {
    notFound();
  }

  const overview = await customerService.getOverviewById(id);
  if (!overview) {
    notFound();
  }

  const name = [overview.firstName, overview.lastName].filter(Boolean).join(' ') || 'Customer';
  const toTel = (phone?: string | null) => {
    if (!phone) return null;
    const digits = phone.replace(/[^\d+]/g, '');
    if (!digits) return null;
    return digits.startsWith('+') ? `tel:${digits}` : `tel:+${digits}`;
  };

  // Format duration as mm:ss
  const formatDuration = (seconds: number | null) => {
    if (seconds == null) return null;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Determine if a call was missed (inbound, ended, very short or no duration)
  const isMissedCall = (call: typeof overview.recentCalls[0]) => {
    if (call.direction !== 'inbound') return false;
    if (!call.endedAt) return false; // Still in progress
    if (call.durationSeconds == null || call.durationSeconds < 5) return true;
    return false;
  };

  const formatRiskLabel = (risk: 'low' | 'medium' | 'high' | null) => {
    if (!risk) return 'Unknown';
    return risk.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const getChurnTone = (risk: 'low' | 'medium' | 'high' | null) => {
    if (risk === 'low') return 'success';
    if (risk === 'medium') return 'warning';
    if (risk === 'high') return 'danger';
    return 'default';
  };

  // Format currency
  const formatCurrency = (value: string | null) => {
    if (!value) return '$0';
    const num = parseFloat(value);
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`;
    return `$${num.toFixed(0)}`;
  };

  // Task type labels
  const taskTypeLabels: Record<string, string> = {
    FOLLOW_UP: 'Follow Up',
    CHURN_WATCH: 'Churn Watch',
    VIP_TICKET: 'VIP Ticket',
    AR_OVERDUE: 'AR Overdue',
    SLA_BREACH: 'SLA Breach',
    MERGE_REVIEW: 'Duplicate Review',
    MERGE_REQUIRED: 'Merge Required',
  };

  const taskTypeTones: Record<string, 'neutral' | 'warning' | 'danger'> = {
    FOLLOW_UP: 'neutral',
    CHURN_WATCH: 'danger',
    VIP_TICKET: 'warning',
    AR_OVERDUE: 'warning',
    SLA_BREACH: 'danger',
    MERGE_REVIEW: 'warning',
    MERGE_REQUIRED: 'warning',
  };

  const mergeTask = overview.openTasks?.find(
    (task) => task.type === 'MERGE_REVIEW' || task.type === 'MERGE_REQUIRED'
  );

  return (
    <PageShell size="wide">
      <Breadcrumb
        items={[
          { label: 'Customers', href: '/customers' },
          { label: name },
        ]}
        className="mb-4"
      />
      <div className="space-y-3 border-b border-border/60 pb-5">
        <PageHeader
          eyebrow="Customer 360"
          title={name}
          description={overview.company || 'Customer record'}
          className="border-b-0 pb-0"
        />
        <div className="flex flex-wrap gap-2">
          {overview.primaryEmail && (
            <Badge variant="secondary" size="sm" asChild className="gap-1.5">
              <a href={`mailto:${overview.primaryEmail}`} className="max-w-[240px] truncate">
                <Mail className="h-3.5 w-3.5" />
                {overview.primaryEmail}
              </a>
            </Badge>
          )}
          {overview.primaryPhone && (
            <Badge variant="secondary" size="sm" asChild className="gap-1.5">
              <a href={toTel(overview.primaryPhone) || undefined} className="max-w-[180px] truncate">
                <Phone className="h-3.5 w-3.5" />
                {overview.primaryPhone}
              </a>
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-8">
          {overview.scores && (
            <Section
              title="Health and revenue"
              description="Signals pulled from service, revenue, and payment history."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  title="Health Score"
                  value={overview.scores.healthScore ?? '—'}
                  description="/100 score"
                  icon={Activity}
                />
                <StatCard
                  title="Churn Risk"
                  value={formatRiskLabel(overview.scores.churnRisk)}
                  description="90-day risk band"
                  icon={TrendingDown}
                  tone={getChurnTone(overview.scores.churnRisk)}
                />
                <StatCard
                  title="Lifetime Value"
                  value={formatCurrency(overview.scores.ltv)}
                  description="Total spend"
                  icon={DollarSign}
                />
                <StatCard
                  title="Last 12 Months"
                  value={formatCurrency(overview.scores.last12MonthsRevenue)}
                  description="Trailing revenue"
                  icon={DollarSign}
                />
              </div>
            </Section>
          )}

          <Section title="Operational snapshot" description="Recent activity and pipeline touchpoints.">
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle level={5} className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted/60 text-primary">
                      <Wallet className="h-4 w-4" />
                    </span>
                    AR Snapshot
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {overview.qboSnapshot ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Balance</span>
                        <span className="font-semibold text-foreground">
                          {overview.qboSnapshot.currency} {overview.qboSnapshot.balance}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Terms</span>
                        <span className="text-foreground/80">{overview.qboSnapshot.terms || '—'}</span>
                      </div>
                      <div className="border-t border-border/60 pt-2 text-xs text-muted-foreground">
                        Updated {new Date(overview.qboSnapshot.snapshotTakenAt).toLocaleDateString()}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No AR snapshot yet. Sync QBO to populate.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle level={5} className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted/60 text-primary">
                      <Ticket className="h-4 w-4" />
                    </span>
                    Open Tickets
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {overview.openTickets.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No open tickets. New tickets appear when inbox sync runs.
                    </p>
                  )}
                  {overview.openTickets.slice(0, 4).map(ticket => (
                    <Link
                      key={ticket.id}
                      href={`/tickets/${ticket.id}`}
                      className="block rounded-lg border border-border/60 bg-muted/30 p-3 transition-colors hover:border-border/80 hover:bg-muted/50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">#{ticket.id} — {ticket.title}</p>
                          <p className="text-xs text-muted-foreground">Updated {new Date(ticket.updatedAt).toLocaleDateString()}</p>
                        </div>
                        <StatusBadge status={ticket.status as any} size="sm" showIcon={false} />
                      </div>
                    </Link>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle level={5} className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted/60 text-primary">
                      <ShoppingBag className="h-4 w-4" />
                    </span>
                    Frequent Products
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {overview.frequentProducts.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No order history yet. Connect commerce sources to populate.
                    </p>
                  )}
                  {overview.frequentProducts.map((item) => (
                    <div key={`${item.sku || item.title || 'item'}-${item.quantity}`} className="flex items-center justify-between text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{item.title || item.sku || 'Unknown product'}</p>
                        {item.sku && <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>}
                      </div>
                      <Badge variant="secondary" size="sm">x{item.quantity}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle level={5} className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted/60 text-primary">
                      <Ticket className="h-4 w-4" />
                    </span>
                    Open Opportunities
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {overview.openOpportunities.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No open opportunities. Pipeline updates surface here.
                    </p>
                  )}
                  {overview.openOpportunities.slice(0, 5).map((opp) => (
                    <Link
                      key={opp.id}
                      href={`/opportunities/${opp.id}`}
                      className="block rounded-lg border border-border/60 bg-muted/30 p-3 transition-colors hover:border-border/80 hover:bg-muted/50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{opp.title}</p>
                          <p className="text-xs text-muted-foreground">{opp.stage}</p>
                        </div>
                        <Badge variant="outline" size="sm" className="text-xs shrink-0">
                          {opp.currency} {opp.estimatedValue ?? '—'}
                        </Badge>
                      </div>
                      {opp.ownerName && (
                        <p className="mt-1 text-xs text-muted-foreground">Owner: {opp.ownerName}</p>
                      )}
                    </Link>
                  ))}
                </CardContent>
              </Card>
            </div>
          </Section>

          <CustomerMemoryPanel customerId={id} />

          {mergeTask && (
            <CustomerMergeReviewPanel customerId={id} taskId={mergeTask.id} />
          )}

          {overview.openTasks.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted/60 text-primary">
                      <ListTodo className="h-4 w-4" />
                    </span>
                    Open Tasks
                  </CardTitle>
                  <StatusPill tone="warning" size="sm">
                    {overview.openTasks.length} pending
                  </StatusPill>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {overview.openTasks.map((task) => {
                  // Determine link destination based on task type
                  let href = '#';
                  let actionHint = '';

                  if (task.type === 'MERGE_REVIEW' || task.type === 'MERGE_REQUIRED') {
                    // Link merge tasks to the tasks page with type filter pre-selected
                    href = `/tasks?type=${task.type}`;
                    actionHint = 'Review duplicate identities to merge customer records.';
                  } else if (task.ticketId) {
                    href = `/tickets/${task.ticketId}`;
                  } else if (task.opportunityId) {
                    href = `/opportunities/${task.opportunityId}`;
                  }

                  const isMergeTask = task.type === 'MERGE_REVIEW' || task.type === 'MERGE_REQUIRED';

                  return (
                    <Link
                      key={task.id}
                      href={href}
                      className="block rounded-lg border border-border/60 bg-card p-3 transition-colors hover:border-border/80 hover:bg-muted/50"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <StatusPill tone={taskTypeTones[task.type] || 'neutral'} size="sm">
                            {taskTypeLabels[task.type] || task.type}
                          </StatusPill>
                          {task.reason && (
                            <span className="text-xs text-muted-foreground">{task.reason.replace(/_/g, ' ')}</span>
                          )}
                        </div>
                        {task.dueAt && (
                          <span className="text-xs text-muted-foreground">
                            Due {new Date(task.dueAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      {task.opportunityTitle && (
                        <p className="mt-1 text-sm text-foreground/80">{task.opportunityTitle}</p>
                      )}
                      {isMergeTask && actionHint && (
                        <p className="mt-1 text-xs text-muted-foreground italic">{actionHint}</p>
                      )}
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
          )}

          <Section title="Contacts and identities" description="Who we talk to and how they’re connected.">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted/60 text-primary">
                        <Users className="h-4 w-4" />
                      </span>
                      Contacts
                    </CardTitle>
                    <span className="text-xs text-muted-foreground">{overview.contacts.length} saved</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {overview.contacts.map((contact) => (
                    <div key={contact.id} className="rounded-lg border border-border/60 bg-muted/30 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-foreground">{contact.name}</span>
                        {contact.role && <Badge variant="secondary" size="sm">{contact.role}</Badge>}
                      </div>
                      <div className="space-y-1.5 text-sm">
                        {contact.email && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                            {contact.email}
                          </div>
                        )}
                        {contact.phone && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                            <a href={toTel(contact.phone) || undefined} className="hover:underline">
                              {contact.phone}
                            </a>
                          </div>
                        )}
                        {contact.notes && <p className="text-xs text-muted-foreground">{contact.notes}</p>}
                      </div>
                    </div>
                  ))}
                  {overview.contacts.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No contacts yet. Add one from a ticket or CRM import.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted/60 text-primary">
                        <Info className="h-4 w-4" />
                      </span>
                      Identities
                    </CardTitle>
                    <span className="text-xs text-muted-foreground">{overview.identities.length} linked</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {overview.identities.map((identity) => (
                    <div key={identity.id} className="rounded-lg border border-border/60 bg-muted/30 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium capitalize text-foreground">{identity.provider}</span>
                        {identity.externalId && (
                          <span className="text-xs text-muted-foreground truncate max-w-[140px] font-mono">
                            {identity.externalId}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 space-y-0.5 text-sm text-muted-foreground">
                        {identity.email && <p>{identity.email}</p>}
                        {identity.phone && <p>{identity.phone}</p>}
                      </div>
                    </div>
                  ))}
                  {overview.identities.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No identities linked yet. They appear after account syncs.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </Section>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted/60 text-primary">
                    <Phone className="h-4 w-4" />
                  </span>
                  Recent Calls
                </CardTitle>
                <span className="text-xs text-muted-foreground">{overview.recentCalls.length} loaded</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {overview.recentCalls.length === 0 ? (
                <EmptyState
                  title="No calls recorded"
                  description="Calls appear once 3CX sync is enabled."
                  icon={Phone}
                />
              ) : (
                overview.recentCalls.map((call) => {
                  const missed = isMissedCall(call);
                  const CallIcon = missed
                    ? PhoneMissed
                    : call.direction === 'inbound'
                      ? PhoneIncoming
                      : PhoneOutgoing;
                  const callTone = missed
                    ? 'danger'
                    : call.direction === 'inbound'
                      ? 'info'
                      : 'neutral';
                  const callLabel = missed
                    ? 'Missed'
                    : call.direction === 'inbound'
                      ? 'Inbound'
                      : 'Outbound';

                  return (
                    <div
                      key={call.id}
                      className={`rounded-lg border p-4 ${missed ? 'border-destructive/30 bg-destructive/10' : 'border-border/60 bg-muted/30'}`}
                    >
                      <div className="flex items-center justify-between">
                        <StatusPill tone={callTone} size="sm" icon={CallIcon}>
                          {callLabel}
                        </StatusPill>
                        <span className="text-xs text-muted-foreground">
                          {new Date(call.startedAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-2 text-sm text-foreground/80">
                        {call.direction === 'inbound' ? 'From' : 'To'}: {call.direction === 'inbound' ? call.fromNumber : call.toNumber}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {call.durationSeconds != null && (
                          <span>Duration: {formatDuration(call.durationSeconds)}</span>
                        )}
                        {call.contactName && <span>Contact: {call.contactName}</span>}
                      </div>
                      {call.recordingUrl && (
                        <a
                          href={call.recordingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          <Play className="h-3 w-3" /> Play recording
                        </a>
                      )}
                      {call.notes && (
                        <p className="mt-2 border-l-2 border-border pl-2 text-xs italic text-muted-foreground">
                          {call.notes}
                        </p>
                      )}
                      <div className="mt-2 flex gap-3 text-xs">
                        {call.ticketId && (
                          <Link href={`/tickets/${call.ticketId}`} className="text-primary hover:underline">
                            Ticket #{call.ticketId}
                          </Link>
                        )}
                        {call.opportunityId && (
                          <Link href={`/opportunities/${call.opportunityId}`} className="text-primary hover:underline">
                            Opportunity #{call.opportunityId}
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <UnifiedOrdersPanel orders={overview.recentOrders} />
        </div>

        <aside className="space-y-6">
          <CustomerSnapshotCard overview={overview} showCta={false} />
        </aside>
      </div>
    </PageShell>
  );
}
