'use client';

import React, { forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-white/20 bg-white/10 text-white hover:bg-white/20',
        primary: 'border-primary/30 bg-primary/20 text-primary-foreground hover:bg-primary/30',
        secondary: 'border-secondary/30 bg-secondary/20 text-secondary-foreground hover:bg-secondary/30',
        success: 'border-success/30 bg-success/20 text-success-foreground hover:bg-success/30',
        warning: 'border-warning/30 bg-warning/20 text-warning-foreground hover:bg-warning/30',
        danger: 'border-danger/30 bg-danger/20 text-danger-foreground hover:bg-danger/30',
        outline: 'border-2 border-white/30 bg-transparent text-white hover:bg-white/10',
        solid: 'border-white/20 bg-white text-gray-900 hover:bg-white/90'
      },
      size: {
        sm: 'text-xs px-2 py-0.5',
        default: 'text-xs px-2.5 py-0.5',
        lg: 'text-sm px-3 py-1'
      },
      interactive: {
        true: 'cursor-pointer hover:scale-105',
        false: ''
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
      interactive: false
    }
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  icon?: React.ReactNode;
  removable?: boolean;
  onRemove?: () => void;
  'aria-label'?: string;
}

const Badge = forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, size, interactive, icon, removable, onRemove, children, ...props }, ref) => {
    const isClickable = interactive || removable;
    
    return (
      <div
        ref={ref}
        className={cn(badgeVariants({ variant, size, interactive: isClickable, className }))}
        role={isClickable ? 'button' : undefined}
        tabIndex={isClickable ? 0 : undefined}
        onKeyDown={isClickable ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (removable && onRemove) {
              onRemove();
            } else if (props.onClick) {
              props.onClick(e as any);
            }
          }
        } : undefined}
        {...props}
      >
        {icon && <span className="flex-shrink-0" aria-hidden="true">{icon}</span>}
        <span>{children}</span>
        {removable && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove?.();
            }}
            className="flex-shrink-0 ml-1 hover:text-white/80 focus:outline-none focus:ring-1 focus:ring-ring rounded-sm"
            aria-label={`Remove ${children}`}
          >
            <i className="fas fa-times text-xs" />
          </button>
        )}
      </div>
    );
  }
);

Badge.displayName = 'Badge';

// Predefined status badges for common enterprise use cases
export const StatusBadge = ({ status, ...props }: { status: 'new' | 'open' | 'in_progress' | 'pending_customer' | 'closed' } & Omit<BadgeProps, 'variant'>) => {
  const statusConfig = {
    new: { variant: 'primary' as const, icon: <i className="fas fa-plus-circle" />, label: 'New' },
    open: { variant: 'warning' as const, icon: <i className="fas fa-envelope-open" />, label: 'Open' },
    in_progress: { variant: 'secondary' as const, icon: <i className="fas fa-spinner fa-spin" />, label: 'In Progress' },
    pending_customer: { variant: 'warning' as const, icon: <i className="fas fa-clock" />, label: 'Pending Customer' },
    closed: { variant: 'success' as const, icon: <i className="fas fa-check-circle" />, label: 'Closed' }
  };

  const config = statusConfig[status];
  
  return (
    <Badge
      variant={config.variant}
      icon={config.icon}
      aria-label={`Status: ${config.label}`}
      {...props}
    >
      {config.label}
    </Badge>
  );
};

export const PriorityBadge = ({ priority, ...props }: { priority: 'low' | 'medium' | 'high' | 'urgent' } & Omit<BadgeProps, 'variant'>) => {
  const priorityConfig = {
    low: { variant: 'success' as const, icon: <i className="fas fa-arrow-down" />, label: 'Low' },
    medium: { variant: 'warning' as const, icon: <i className="fas fa-minus" />, label: 'Medium' },
    high: { variant: 'danger' as const, icon: <i className="fas fa-arrow-up" />, label: 'High' },
    urgent: { variant: 'danger' as const, icon: <i className="fas fa-exclamation-triangle" />, label: 'Urgent' }
  };

  const config = priorityConfig[priority];
  
  return (
    <Badge
      variant={config.variant}
      icon={config.icon}
      aria-label={`Priority: ${config.label}`}
      {...props}
    >
      {config.label}
    </Badge>
  );
};

export { Badge, badgeVariants };