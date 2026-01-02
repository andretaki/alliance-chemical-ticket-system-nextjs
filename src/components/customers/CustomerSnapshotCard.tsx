'use client';

import Link from 'next/link';
import { Building2, Mail, Phone, ExternalLink, AlertCircle } from 'lucide-react';
import type { CustomerOverview } from '@/lib/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status-pill';

interface Props {
  overview: CustomerOverview;
  showCta?: boolean;
}

const formatProviderLabel = (provider: string) => provider.replace(/_/g, ' ');

export function CustomerSnapshotCard({ overview, showCta = true }: Props) {
  const name = [overview.firstName, overview.lastName].filter(Boolean).join(' ') || 'Unknown';
  const providers = Array.from(new Set(overview.identities.map(i => i.provider)));
  const hasLate = overview.lateOrdersCount > 0;
  const toTel = (phone?: string | null) => {
    if (!phone) return null;
    const digits = phone.replace(/[^\d+]/g, '');
    if (!digits) return null;
    return digits.startsWith('+') ? `tel:${digits}` : `tel:+${digits}`;
  };

  return (
    <Card>
      <CardHeader className="space-y-2 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Customer</p>
            <CardTitle level={4} className="truncate">{name}</CardTitle>
            {overview.company && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                {overview.company}
              </p>
            )}
          </div>
          {hasLate && (
            <StatusPill tone="danger" size="sm" icon={AlertCircle}>
              Late AR
            </StatusPill>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 text-sm">
          {overview.primaryEmail && (
            <Badge variant="secondary" size="sm" asChild className="gap-1.5">
              <a href={`mailto:${overview.primaryEmail}`} className="max-w-[220px] truncate">
                <Mail className="h-3.5 w-3.5" />
                {overview.primaryEmail}
              </a>
            </Badge>
          )}
          {overview.primaryPhone && (
            <Badge variant="secondary" size="sm" asChild className="gap-1.5">
              <a href={toTel(overview.primaryPhone) || undefined} className="max-w-[180px] truncate">
                <Phone className="h-3.5 w-3.5" />
                {overview.primaryPhone}
              </a>
            </Badge>
          )}
        </div>

        {providers.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {providers.map((provider) => (
              <Badge
                key={provider}
                variant="outline"
                size="sm"
                className="capitalize text-foreground/80"
              >
                {formatProviderLabel(provider)}
              </Badge>
            ))}
          </div>
        )}

        {overview.qboSnapshot && (
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">A/R Balance</p>
            <p className="mt-1 text-sm text-foreground">
              <span className="font-semibold">
                {overview.qboSnapshot.currency} {overview.qboSnapshot.balance}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Terms: {overview.qboSnapshot.terms || '—'}
            </p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
            <div className="text-xl font-semibold text-foreground">{overview.totalOrders}</div>
            <div className="text-xs text-muted-foreground">Orders</div>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
            <div className="text-xl font-semibold text-foreground">{overview.openTicketsCount}</div>
            <div className="text-xs text-muted-foreground">Tickets</div>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
            <div className={`text-xl font-semibold ${hasLate ? 'text-destructive' : 'text-foreground'}`}>
              {overview.lateOrdersCount}
            </div>
            <div className="text-xs text-muted-foreground">Late</div>
          </div>
        </div>

        {overview.openOpportunities.length > 0 && (
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Open Opportunities</p>
              <Badge variant="secondary" size="sm">
                {overview.openOpportunities.length}
              </Badge>
            </div>
            <div className="mt-2 space-y-2">
              {overview.openOpportunities.slice(0, 3).map((opp) => (
                <div key={opp.id} className="flex items-center justify-between text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{opp.title}</p>
                    <p className="text-xs text-muted-foreground">{opp.stage}</p>
                  </div>
                  <span className="text-xs font-medium text-foreground/80 whitespace-nowrap">
                    {opp.currency} {opp.estimatedValue ?? '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {showCta && (
          <Button asChild fullWidth>
            <Link href={`/customers/${overview.id}`} className="flex items-center gap-2">
              View customer 360
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
