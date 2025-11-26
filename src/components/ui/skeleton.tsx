// Temporary stub - Replace with shadcn/ui skeleton
import React from 'react';

export function Skeleton({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`animate-pulse bg-muted rounded ${className}`} {...props} />;
}
