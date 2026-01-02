'use client';

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { ErrorBoundary } from '@/components/errors/ErrorBoundary';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface CrmDashboardErrorBoundaryProps {
  children: React.ReactNode;
}

export default function CrmDashboardErrorBoundary({ children }: CrmDashboardErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              CRM Dashboard Error
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              We hit an unexpected error while loading CRM signals. Retry to reload the dashboard.
            </p>
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              {error.message}
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={reset}>
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
