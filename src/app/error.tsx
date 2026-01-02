'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log to error reporting service
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center p-8">
      <div className="mx-auto max-w-md text-center">
        <div className="mb-4 flex justify-center">
          <div className="rounded-full bg-destructive/10 p-3">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
        </div>

        <h2 className="mb-2 text-xl font-semibold">Something went wrong</h2>

        <p className="mb-6 text-sm text-muted-foreground">
          An unexpected error occurred. Our team has been notified.
          {error.digest && (
            <span className="mt-1 block text-xs opacity-50">
              Error ID: {error.digest}
            </span>
          )}
        </p>

        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={reset}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Try again
          </Button>
          <Button variant="default" onClick={() => window.location.href = '/dashboard'}>
            <Home className="mr-2 h-4 w-4" />
            Go home
          </Button>
        </div>
      </div>
    </div>
  );
}
