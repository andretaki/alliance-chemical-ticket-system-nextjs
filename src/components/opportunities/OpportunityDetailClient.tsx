'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status-pill';
import { opportunityStageEnum } from '@/db/schema';
import { Clock, AlertTriangle, ListTodo, User, Building2, DollarSign, ExternalLink } from 'lucide-react';

type OpportunityDetail = {
  id: number;
  title: string;
  description: string | null;
  stage: string;
  source: string | null;
  division: string | null;
  estimatedValue: any;
  currency: string;
  ownerId: string | null;
  shopifyDraftOrderId: string | null;
  qboEstimateId: string | null;
  closedAt: any;
  createdAt: any;
  updatedAt: any;
  stageChangedAt: any;
  customerId: number;
  contactId: number | null;
  lostReason: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
};

type OpenTask = {
  id: number;
  type: string;
  reason: string | null;
  customerId: number | null;
  customerName: string | null;
  opportunityId: number | null;
  opportunityTitle: string | null;
  ticketId: number | null;
  dueAt: string | null;
  assigneeName: string | null;
  createdAt: string;
};

function getDaysInStage(stageChangedAt: string | null): number {
  if (!stageChangedAt) return 0;
  const changedDate = new Date(stageChangedAt);
  const now = new Date();
  return Math.floor((now.getTime() - changedDate.getTime()) / (1000 * 60 * 60 * 24));
}

function StageButtons({ id, currentStage, onUpdated }: { id: number; currentStage: string; onUpdated: (stage: string) => void; }) {
  const [pending, startTransition] = useTransition();

  const setStage = (stage: string) => {
    startTransition(async () => {
      await fetch(`/api/opportunities/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      });
      onUpdated(stage);
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      {opportunityStageEnum.enumValues.map((stage) => (
        <Button
          key={stage}
          variant={stage === currentStage ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStage(stage)}
          disabled={pending}
        >
          {stage}
        </Button>
      ))}
    </div>
  );
}

export function OpportunityDetailClient({ opportunity, openTasks = [] }: { opportunity: OpportunityDetail; openTasks?: OpenTask[] }) {
  const [stage, setStage] = useState(opportunity.stage);
  const taskTypeTones: Record<string, 'neutral' | 'warning' | 'danger'> = {
    FOLLOW_UP: 'neutral',
    CHURN_WATCH: 'danger',
    VIP_TICKET: 'warning',
    AR_OVERDUE: 'warning',
    SLA_BREACH: 'danger',
  };

  const daysInStage = getDaysInStage(opportunity.stageChangedAt);
  const isStale = stage === 'quote_sent' && daysInStage > 14;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="border-b border-border/60">
          <CardTitle className="text-foreground flex items-center justify-between">
            <span className="text-xl font-semibold">{opportunity.title}</span>
            <div className="flex items-center gap-3">
              <Badge variant="outline" size="sm" className="text-xs">{stage}</Badge>
              <span
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                  isStale
                    ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
                    : 'bg-muted/60 text-muted-foreground'
                }`}
              >
                <Clock className="h-3.5 w-3.5" />
                {daysInStage}d in stage
                {isStale && <AlertTriangle className="h-3.5 w-3.5" />}
              </span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 text-sm pt-5">
          {/* Customer Link */}
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted/60 rounded-lg">
              <Building2 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Customer</span>
              <Link href={`/customers/${opportunity.customerId}`} className="block text-primary hover:underline font-medium">
                {opportunity.customerName || opportunity.customerEmail || `Customer ${opportunity.customerId}`}
              </Link>
            </div>
          </div>

          {opportunity.contactId && (
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted/60 rounded-lg">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Contact</span>
                <p className="text-foreground font-medium">
                  {opportunity.contactName} {opportunity.contactEmail ? `(${opportunity.contactEmail})` : ''}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted/60 rounded-lg">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
            <div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Value</span>
              <p className="text-foreground font-semibold text-lg">
                {opportunity.currency} {opportunity.estimatedValue ?? '—'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 rounded-lg border border-border bg-muted/40 px-4 py-4">
            <div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Division</span>
              <p className="mt-0.5 font-medium text-foreground">{opportunity.division || '—'}</p>
            </div>
            <div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Source</span>
              <p className="mt-0.5 font-medium text-foreground">{opportunity.source || '—'}</p>
            </div>
            <div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Owner</span>
              <p className="mt-0.5 font-medium text-foreground">{opportunity.ownerName || '—'}</p>
            </div>
          </div>

          {opportunity.shopifyDraftOrderId && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="font-medium text-muted-foreground">Shopify Draft Order:</span>
              <span className="rounded border border-border bg-muted/60 px-2 py-0.5 font-mono text-sm text-foreground">
                {opportunity.shopifyDraftOrderId}
              </span>
            </div>
          )}
          {opportunity.qboEstimateId && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="font-medium text-muted-foreground">QBO Estimate:</span>
              <span className="rounded border border-border bg-muted/60 px-2 py-0.5 font-mono text-sm text-foreground">
                {opportunity.qboEstimateId}
              </span>
            </div>
          )}
          {opportunity.description && (
            <div className="pt-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</span>
              <p className="mt-2 whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 text-foreground">
                {opportunity.description}
              </p>
            </div>
          )}

          <div className="space-y-3 border-t border-border/60 pt-4">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Update Stage</span>
            <StageButtons id={opportunity.id} currentStage={stage} onUpdated={setStage} />
          </div>
        </CardContent>
      </Card>

      {/* Open Tasks for this Opportunity */}
      {openTasks.length > 0 && (
        <Card>
          <CardHeader className="border-b border-border/60">
            <CardTitle className="flex items-center gap-2 text-lg text-foreground">
              <div className="rounded bg-muted/60 p-1.5">
                <ListTodo className="h-4 w-4 text-muted-foreground" />
              </div>
              Open Tasks
              <Badge variant="outline" size="sm" className="ml-auto text-xs">
                {openTasks.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-3">
              {openTasks.map((task) => (
                <div key={task.id} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex items-center gap-3">
                    <StatusPill
                      tone={taskTypeTones[task.type] || 'neutral'}
                      size="sm"
                      className="text-xs font-medium"
                    >
                      {task.type}
                    </StatusPill>
                    <div>
                      <div className="text-sm font-medium text-foreground">{task.reason || task.type}</div>
                      {task.assigneeName && (
                        <div className="text-xs text-muted-foreground">Assigned to: {task.assigneeName}</div>
                      )}
                    </div>
                  </div>
                  {task.dueAt && (
                    <span className="rounded bg-muted/60 px-2 py-1 text-xs text-muted-foreground">
                      Due: {new Date(task.dueAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 border-t border-border/60 pt-4">
              <Link href="/tasks" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                View all tasks
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
