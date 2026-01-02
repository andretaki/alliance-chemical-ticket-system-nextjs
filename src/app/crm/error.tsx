'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function CrmError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('[CrmError]', error);
  }, [error]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center p-8">
      <div className="mx-auto max-w-md text-center">
        <div className="mb-4 flex justify-center">
          <div className="rounded-full bg-destructive/10 p-3">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
        </div>

        <h2 className="mb-2 text-xl font-semibold">CRM Dashboard Error</h2>

        <p className="mb-6 text-sm text-muted-foreground">
          Failed to load the CRM dashboard. This may be due to a data sync issue.
        </p>

        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={reset}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
          <Link href="/dashboard">
            <Button variant="default">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
