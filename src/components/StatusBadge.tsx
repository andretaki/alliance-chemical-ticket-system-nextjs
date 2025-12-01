import * as React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Circle, Clock, CheckCircle2, AlertCircle, Pause, XCircle } from 'lucide-react';

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

const statusConfig: Record<TicketStatus, { label: string; className: string; icon: React.ElementType }> = {
  new: {
    label: 'New',
    className: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
    icon: Circle,
  },
  open: {
    label: 'Open',
    className: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
    icon: Clock,
  },
  in_progress: {
    label: 'In Progress',
    className: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    icon: Clock,
  },
  pending_customer: {
    label: 'Pending',
    className: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    icon: Pause,
  },
  closed: {
    label: 'Closed',
    className: 'bg-white/[0.06] text-white/50 border-white/10',
    icon: CheckCircle2,
  },
};

const priorityConfig: Record<TicketPriority, { label: string; className: string; icon: React.ElementType }> = {
  low: {
    label: 'Low',
    className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    icon: Circle,
  },
  medium: {
    label: 'Medium',
    className: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    icon: Circle,
  },
  high: {
    label: 'High',
    className: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    icon: AlertCircle,
  },
  urgent: {
    label: 'Urgent',
    className: 'bg-red-500/15 text-red-400 border-red-500/30 animate-pulse',
    icon: AlertCircle,
  },
};

export function StatusBadge({ status, className, showIcon = true, size = 'default' }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.new;
  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={cn(
        config.className,
        size === 'sm' ? 'text-[10px] px-1.5 py-0' : 'text-xs px-2 py-0.5',
        className
      )}
    >
      {showIcon && <Icon className={cn('mr-1', size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3')} />}
      {config.label}
    </Badge>
  );
}

export function PriorityBadge({ priority, className, showIcon = true, size = 'default' }: PriorityBadgeProps) {
  const config = priorityConfig[priority] || priorityConfig.medium;
  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={cn(
        config.className,
        size === 'sm' ? 'text-[10px] px-1.5 py-0' : 'text-xs px-2 py-0.5',
        className
      )}
    >
      {showIcon && <Icon className={cn('mr-1', size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3')} />}
      {config.label}
    </Badge>
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
