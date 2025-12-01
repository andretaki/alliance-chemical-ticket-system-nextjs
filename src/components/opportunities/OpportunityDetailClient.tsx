'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { opportunityStageEnum } from '@/db/schema';

type OpportunityDetail = {
  id: number;
  title: string;
  description: string | null;
  stage: string;
  source: string | null;
  division: string | null;
  estimatedValue: any;
  currency: string;
  ownerId: string | null;
  shopifyDraftOrderId: string | null;
  qboEstimateId: string | null;
  closedAt: any;
  createdAt: any;
  updatedAt: any;
  customerId: number;
  contactId: number | null;
  lostReason: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
};

function StageButtons({ id, currentStage, onUpdated }: { id: number; currentStage: string; onUpdated: (stage: string) => void; }) {
  const [pending, startTransition] = useTransition();

  const setStage = (stage: string) => {
    startTransition(async () => {
      await fetch(`/api/opportunities/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      });
      onUpdated(stage);
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      {opportunityStageEnum.enumValues.map((stage) => (
        <Button
          key={stage}
          variant={stage === currentStage ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStage(stage)}
          disabled={pending}
          className={stage === currentStage ? 'bg-indigo-600 hover:bg-indigo-500' : 'text-white border-slate-700'}
        >
          {stage}
        </Button>
      ))}
    </div>
  );
}

export function OpportunityDetailClient({ opportunity }: { opportunity: OpportunityDetail }) {
  const [stage, setStage] = useState(opportunity.stage);

  return (
    <Card className="border-slate-800 bg-slate-900/60">
      <CardHeader>
        <CardTitle className="text-white flex items-center justify-between">
          <span>{opportunity.title}</span>
          <Badge variant="outline" className="bg-slate-800 border-slate-700 text-xs">{stage}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-slate-200">
        <div className="flex items-center gap-2 text-slate-300">
          <span className="font-semibold">Customer:</span>
          <Link href={`/customers/${opportunity.customerId}`} className="text-indigo-300 hover:underline">
            {opportunity.customerName || opportunity.customerEmail || `Customer ${opportunity.customerId}`}
          </Link>
        </div>
        {opportunity.contactId && (
          <div className="text-slate-300">
            <span className="font-semibold">Contact: </span>
            {opportunity.contactName} {opportunity.contactEmail ? `(${opportunity.contactEmail})` : ''}
          </div>
        )}
        <div className="text-slate-300">
          <span className="font-semibold">Value: </span>
          {opportunity.currency} {opportunity.estimatedValue ?? '—'}
        </div>
        <div className="flex gap-6 text-slate-300">
          <div><span className="font-semibold">Division:</span> {opportunity.division || '—'}</div>
          <div><span className="font-semibold">Source:</span> {opportunity.source || '—'}</div>
          <div><span className="font-semibold">Owner:</span> {opportunity.ownerName || '—'}</div>
        </div>
        {opportunity.shopifyDraftOrderId && (
          <div className="text-slate-300">
            <span className="font-semibold">Shopify Draft Order:</span> {opportunity.shopifyDraftOrderId}
          </div>
        )}
        {opportunity.qboEstimateId && (
          <div className="text-slate-300">
            <span className="font-semibold">QBO Estimate:</span> {opportunity.qboEstimateId}
          </div>
        )}
        {opportunity.description && (
          <div className="text-slate-200">
            <span className="font-semibold">Description:</span>
            <p className="mt-1 text-slate-300 whitespace-pre-wrap">{opportunity.description}</p>
          </div>
        )}

        <div className="space-y-2">
          <span className="font-semibold text-slate-200">Update stage</span>
          <StageButtons id={opportunity.id} currentStage={stage} onUpdated={setStage} />
        </div>
      </CardContent>
    </Card>
  );
}
