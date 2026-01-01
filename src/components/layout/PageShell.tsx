import * as React from 'react';
import { cn } from '@/lib/utils';

type PageShellSize = 'wide' | 'default' | 'narrow';

const sizeClasses: Record<PageShellSize, string> = {
  wide: 'mx-auto max-w-7xl',
  default: 'mx-auto max-w-6xl',
  narrow: 'mx-auto max-w-4xl',
};

interface PageShellProps {
  children: React.ReactNode;
  className?: string;
  size?: PageShellSize;
}

export function PageShell({ children, className, size = 'default' }: PageShellProps) {
  return (
    <div className={cn('w-full space-y-8', sizeClasses[size], className)}>
      {children}
    </div>
  );
}
