import * as React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const toneVariant: Record<StatusTone, React.ComponentProps<typeof Badge>['variant']> = {
  neutral: 'outline',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  info: 'info',
};

export const statusToneIconClasses: Record<StatusTone, string> = {
  neutral: 'text-muted-foreground',
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-red-600 dark:text-red-400',
  info: 'text-blue-600 dark:text-blue-400',
};

interface StatusPillProps extends React.ComponentProps<'span'> {
  tone?: StatusTone;
  size?: React.ComponentProps<typeof Badge>['size'];
  icon?: React.ElementType;
}

export function StatusPill({
  tone = 'neutral',
  size = 'default',
  icon: Icon,
  className,
  children,
  ...props
}: StatusPillProps) {
  return (
    <Badge
      variant={toneVariant[tone]}
      size={size}
      className={cn(Icon && 'gap-1', className)}
      {...props}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </Badge>
  );
}
