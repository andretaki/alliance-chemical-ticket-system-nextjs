import * as React from 'react';
import { ChevronRight, Home } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbProps extends React.HTMLAttributes<HTMLElement> {
  items: BreadcrumbItem[];
  showHomeIcon?: boolean;
  separator?: React.ReactNode;
}

const Breadcrumb = React.forwardRef<HTMLElement, BreadcrumbProps>(
  ({ className, items, showHomeIcon = true, separator, ...props }, ref) => {
    return (
      <nav
        ref={ref}
        aria-label="Breadcrumb"
        className={cn('flex items-center text-sm', className)}
        {...props}
      >
        <ol className="flex items-center gap-1.5">
          {showHomeIcon && (
            <>
              <li>
                <Link
                  href="/dashboard"
                  className="flex items-center text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Home"
                >
                  <Home className="h-4 w-4" />
                </Link>
              </li>
              <li aria-hidden="true" className="text-muted-foreground/60">
                {separator || <ChevronRight className="h-4 w-4" />}
              </li>
            </>
          )}
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            return (
              <React.Fragment key={index}>
                <li>
                  {item.href && !isLast ? (
                    <Link
                      href={item.href}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <span
                      className={cn(
                        isLast ? 'font-medium text-foreground' : 'text-muted-foreground'
                      )}
                      aria-current={isLast ? 'page' : undefined}
                    >
                      {item.label}
                    </span>
                  )}
                </li>
                {!isLast && (
                  <li aria-hidden="true" className="text-muted-foreground/60">
                    {separator || <ChevronRight className="h-4 w-4" />}
                  </li>
                )}
              </React.Fragment>
            );
          })}
        </ol>
      </nav>
    );
  }
);
Breadcrumb.displayName = 'Breadcrumb';

export { Breadcrumb };
