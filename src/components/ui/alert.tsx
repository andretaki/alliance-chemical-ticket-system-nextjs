// Temporary stub - Replace with shadcn/ui alert
import React from 'react';

export function Alert({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className="rounded-lg border p-4" {...props}>{children}</div>;
}

export function AlertDescription({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p {...props}>{children}</p>;
}
