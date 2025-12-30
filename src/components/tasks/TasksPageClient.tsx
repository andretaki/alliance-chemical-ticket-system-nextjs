'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
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

const taskTypeColors: Record<string, string> = {
  FOLLOW_UP: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  CHURN_WATCH: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400',
  VIP_TICKET: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  AR_OVERDUE: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  SLA_BREACH: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400',
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
          ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600 dark:hover:bg-gray-700'
      )}
    >
      <div className={cn('rounded-lg bg-gray-100 p-2 dark:bg-gray-700', taskTypeColors[task.type]?.split(' ')[2] || 'text-gray-500 dark:text-gray-400')}>
        <Icon className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn('text-[10px]', taskTypeColors[task.type] || 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400')}
          >
            {taskTypeLabels[task.type] || task.type}
          </Badge>
          {task.reason && (
            <span className="text-xs text-gray-500 dark:text-gray-400">{task.reason.replace(/_/g, ' ')}</span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <Link
            href={href}
            className="text-sm font-medium text-gray-800 hover:text-gray-900 hover:underline dark:text-gray-200 dark:hover:text-white"
          >
            {linkLabel}
          </Link>
          <ArrowRight className="h-3 w-3 text-gray-400 dark:text-gray-500" />
        </div>
        {task.assigneeName && (
          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Assigned to {task.assigneeName}</div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className={cn('text-xs', isOverdue ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400')}>
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
            className="h-8 w-8 p-0 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300"
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
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <header className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">Tasks</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {tasks.length} open tasks requiring action
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            asChild
          >
            <Link href="/crm">
              <Target className="h-4 w-4" />
              Back to CRM
            </Link>
          </Button>
        </div>
      </header>

      {/* Filter Pills */}
      <div className="mb-6 flex flex-wrap gap-2">
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

      {/* Tasks List */}
      {filteredTasks.length === 0 ? (
        <Card className="border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle2 className="mb-4 h-12 w-12 text-emerald-500/50 dark:text-emerald-400/50" />
            <p className="text-lg font-medium text-gray-700 dark:text-gray-300">All caught up!</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              No open tasks need your attention right now. Tasks are auto-generated from customer activity, SLA breaches, and pipeline events.
            </p>
          </CardContent>
        </Card>
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
    </div>
  );
}
