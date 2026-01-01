import * as React from 'react';
import { cn } from '@/lib/utils';
import { StatusPill } from '@/components/ui/status-pill';
import { Circle, Clock, CheckCircle2, AlertCircle, Pause } from 'lucide-react';

type TicketStatus = 'new' | 'open' | 'in_progress' | 'pending_customer' | 'closed';
type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

interface StatusBadgeProps {
  status: TicketStatus;
  className?: string;
  showIcon?: boolean;
  size?: 'sm' | 'default';
}

interface PriorityBadgeProps {
  priority: TicketPriority;
  className?: string;
  showIcon?: boolean;
  size?: 'sm' | 'default';
}

const statusConfig: Record<TicketStatus, { label: string; tone: 'info' | 'warning' | 'success'; icon: React.ElementType }> = {
  new: {
    label: 'New',
    tone: 'info',
    icon: Circle,
  },
  open: {
    label: 'Open',
    tone: 'info',
    icon: Clock,
  },
  in_progress: {
    label: 'In Progress',
    tone: 'info',
    icon: Clock,
  },
  pending_customer: {
    label: 'Pending',
    tone: 'warning',
    icon: Pause,
  },
  closed: {
    label: 'Closed',
    tone: 'success',
    icon: CheckCircle2,
  },
};

const priorityConfig: Record<TicketPriority, { label: string; tone: 'neutral' | 'info' | 'warning' | 'danger'; icon: React.ElementType }> = {
  low: {
    label: 'Low',
    tone: 'neutral',
    icon: Circle,
  },
  medium: {
    label: 'Medium',
    tone: 'info',
    icon: Circle,
  },
  high: {
    label: 'High',
    tone: 'warning',
    icon: AlertCircle,
  },
  urgent: {
    label: 'Urgent',
    tone: 'danger',
    icon: AlertCircle,
  },
};

export function StatusBadge({ status, className, showIcon = true, size = 'default' }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.new;

  return (
    <StatusPill
      tone={config.tone}
      size={size}
      icon={showIcon ? config.icon : undefined}
      className={className}
    >
      {config.label}
    </StatusPill>
  );
}

export function PriorityBadge({ priority, className, showIcon = true, size = 'default' }: PriorityBadgeProps) {
  const config = priorityConfig[priority] || priorityConfig.medium;

  return (
    <StatusPill
      tone={config.tone}
      size={size}
      icon={showIcon ? config.icon : undefined}
      className={className}
    >
      {config.label}
    </StatusPill>
  );
}

// Priority indicator dot for compact displays
export function PriorityDot({ priority, className }: { priority: TicketPriority; className?: string }) {
  const colors: Record<TicketPriority, string> = {
    low: 'bg-emerald-400',
    medium: 'bg-amber-400',
    high: 'bg-orange-400',
    urgent: 'bg-red-400 animate-pulse',
  };

  return (
    <span
      className={cn('inline-block h-2 w-2 rounded-full', colors[priority], className)}
      title={priority}
    />
  );
}
