// Temporary stub - Replace with shadcn/ui scroll-area
import React from 'react';

export function ScrollArea({ children, className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`overflow-auto ${className}`} {...props}>{children}</div>;
}
