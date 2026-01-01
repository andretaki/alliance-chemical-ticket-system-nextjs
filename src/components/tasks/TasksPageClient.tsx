'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/layout/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageShell } from '@/components/layout/PageShell';
import { Section } from '@/components/layout/Section';
import { StatusPill, statusToneIconClasses } from '@/components/ui/status-pill';
import {
  ListTodo,
  CheckCircle2,
  X,
  ArrowRight,
  Building2,
  Target,
  Ticket,
  Clock,
} from 'lucide-react';
import type { OpenTask } from '@/services/crm/crmDashboardService';

interface TasksPageClientProps {
  initialTasks: OpenTask[];
}

// Task type display config
const taskTypeLabels: Record<string, string> = {
  FOLLOW_UP: 'Follow Up',
  CHURN_WATCH: 'Churn Watch',
  VIP_TICKET: 'VIP Ticket',
  AR_OVERDUE: 'AR Overdue',
  SLA_BREACH: 'SLA Breach',
};

const taskTypeTones: Record<string, 'neutral' | 'warning' | 'danger'> = {
  FOLLOW_UP: 'neutral',
  CHURN_WATCH: 'danger',
  VIP_TICKET: 'warning',
  AR_OVERDUE: 'warning',
  SLA_BREACH: 'danger',
};

const taskTypeIcons: Record<string, React.ElementType> = {
  FOLLOW_UP: Clock,
  CHURN_WATCH: Building2,
  VIP_TICKET: Ticket,
  AR_OVERDUE: Clock,
  SLA_BREACH: Ticket,
};

// Format date relative
function timeAgo(date: Date | string | null): string {
  if (!date) return 'No due date';
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.floor(diff / 86400000);

  if (days < -7) return `${Math.abs(days)}d overdue`;
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return `In ${days}d`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function TaskRow({
  task,
  onComplete,
  onDismiss,
}: {
  task: OpenTask;
  onComplete: (id: number) => void;
  onDismiss: (id: number) => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const Icon = taskTypeIcons[task.type] || ListTodo;
  const tone = taskTypeTones[task.type] || 'neutral';

  // Determine link destination
  let href = '#';
  let linkLabel = '';
  if (task.customerId) {
    href = `/customers/${task.customerId}`;
    linkLabel = task.customerName || 'Customer';
  }
  if (task.opportunityId) {
    href = `/opportunities/${task.opportunityId}`;
    linkLabel = task.opportunityTitle || 'Opportunity';
  }
  if (task.ticketId) {
    href = `/tickets/${task.ticketId}`;
    linkLabel = `Ticket #${task.ticketId}`;
  }

  const handleComplete = async () => {
    setIsLoading(true);
    try {
      await fetch(`/api/tasks/${task.id}/complete`, { method: 'POST' });
      onComplete(task.id);
    } catch (error) {
      console.error('Failed to complete task:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismiss = async () => {
    setIsLoading(true);
    try {
      await fetch(`/api/tasks/${task.id}/dismiss`, { method: 'POST' });
      onDismiss(task.id);
    } catch (error) {
      console.error('Failed to dismiss task:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const isOverdue = task.dueAt && new Date(task.dueAt) < new Date();

  return (
    <div
      className={cn(
        'group flex items-center gap-4 rounded-lg border px-4 py-4 transition-all',
        isOverdue
          ? 'border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-900/20'
          : 'border-border bg-card hover:border-border/80 hover:bg-muted/60'
      )}
    >
      <div className={cn('rounded-lg bg-muted/60 p-2', statusToneIconClasses[tone])}>
        <Icon className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <StatusPill tone={tone} size="sm" className="text-[10px]">
            {taskTypeLabels[task.type] || task.type}
          </StatusPill>
          {task.reason && (
            <span className="text-xs text-muted-foreground">{task.reason.replace(/_/g, ' ')}</span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <Link
            href={href}
            className="text-sm font-medium text-foreground hover:underline"
          >
            {linkLabel}
          </Link>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
        </div>
        {task.assigneeName && (
          <div className="mt-1 text-xs text-muted-foreground">Assigned to {task.assigneeName}</div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className={cn('text-xs', isOverdue ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')}>
          {timeAgo(task.dueAt)}
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-300"
            onClick={handleComplete}
            disabled={isLoading}
            title="Mark complete"
          >
            <CheckCircle2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={handleDismiss}
            disabled={isLoading}
            title="Dismiss"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function TasksPageClient({ initialTasks }: TasksPageClientProps) {
  const [tasks, setTasks] = useState<OpenTask[]>(initialTasks);
  const [filter, setFilter] = useState<string | null>(null);

  const handleComplete = (id: number) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const handleDismiss = (id: number) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  // Get unique task types for filtering
  const taskTypes = Array.from(new Set(tasks.map((t) => t.type)));

  // Filter tasks
  const filteredTasks = filter ? tasks.filter((t) => t.type === filter) : tasks;

  // Group by type
  const groupedTasks = filteredTasks.reduce((acc, task) => {
    const type = task.type;
    if (!acc[type]) acc[type] = [];
    acc[type].push(task);
    return acc;
  }, {} as Record<string, OpenTask[]>);

  return (
    <PageShell size="narrow">
      <PageHeader
        title="Tasks"
        description={`${tasks.length} open tasks requiring action.`}
        actions={
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <Link href="/crm">
              <Target className="h-4 w-4" />
              Back to CRM
            </Link>
          </Button>
        }
      />

      <Section title="Filter tasks" description="Slice by type or view all.">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={filter === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(null)}
          >
            All ({tasks.length})
          </Button>
          {taskTypes.map((type) => {
            const count = tasks.filter((t) => t.type === type).length;
            return (
              <Button
                key={type}
                variant={filter === type ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter(type)}
              >
                {taskTypeLabels[type] || type} ({count})
              </Button>
            );
          })}
        </div>
      </Section>

      <Section
        title="Open tasks"
        description="Tasks appear when churn risk spikes, invoices go overdue, or SLAs breach."
      >
        {filteredTasks.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="No open tasks"
            description="Tasks are generated from customer activity, SLA breaches, and pipeline events. Check back after the next sync."
            action={
              <Button variant="outline" size="sm" asChild>
                <Link href="/crm">Back to CRM</Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {filteredTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onComplete={handleComplete}
                onDismiss={handleDismiss}
              />
            ))}
          </div>
        )}
      </Section>
    </PageShell>
  );
}
