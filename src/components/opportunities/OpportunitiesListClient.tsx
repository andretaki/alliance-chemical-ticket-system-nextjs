'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { opportunityStageEnum } from '@/db/schema';

type OpportunityRow = {
  id: number;
  title: string;
  stage: string;
  division: string | null;
  source: string | null;
  estimatedValue: string | null;
  currency: string;
  ownerName: string | null;
  customerId: number;
  customerName: string | null;
  customerEmail: string | null;
  createdAt: string;
};

interface Props {
  initial: OpportunityRow[];
}

const stageOptions = opportunityStageEnum.enumValues;

export function OpportunitiesListClient({ initial }: Props) {
  const [data, setData] = useState<OpportunityRow[]>(initial);
  const [stage, setStage] = useState<string>('all');
  const [division, setDivision] = useState<string>('all');
  const [ownerId, setOwnerId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [owners, setOwners] = useState<{ id: string; name: string | null; email: string; }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/users')
      .then(res => res.json())
      .then(setOwners)
      .catch(() => {});
  }, []);

  const refresh = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (stage !== 'all') params.append('stage', stage);
    if (division !== 'all') params.append('division', division);
    if (ownerId !== 'all') params.append('ownerId', ownerId);
    if (search.trim()) params.append('search', search.trim());

    const res = await fetch(`/api/opportunities?${params.toString()}`);
    const json = await res.json();
    setData(json.data || []);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, division, ownerId]);

  return (
    <Card className="border-slate-800 bg-slate-900/60">
      <CardHeader>
        <CardTitle className="text-white">Opportunities</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-3 mb-4">
          <Input
            placeholder="Search title"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && refresh()}
            className="max-w-xs bg-slate-900 text-white border-slate-800"
          />
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="w-40 rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-white text-sm"
          >
            <option value="all">All stages</option>
            {stageOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select
            value={division}
            onChange={(e) => setDivision(e.target.value)}
            className="w-40 rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-white text-sm"
          >
            <option value="all">All divisions</option>
            <option value="gov">gov</option>
            <option value="local">local</option>
            <option value="other">other</option>
          </select>

          <select
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            className="w-48 rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-white text-sm"
          >
            <option value="all">All owners</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>{o.name || o.email}</option>
            ))}
          </select>

          <Button onClick={refresh} disabled={loading} className="bg-indigo-600 hover:bg-indigo-500">
            Refresh
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-white">
            <thead className="bg-slate-900/70 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-2 text-left">Title</th>
                <th className="px-4 py-2 text-left">Customer</th>
                <th className="px-4 py-2 text-left">Stage</th>
                <th className="px-4 py-2 text-left">Value</th>
                <th className="px-4 py-2 text-left">Owner</th>
                <th className="px-4 py-2 text-left">Division</th>
                <th className="px-4 py-2 text-left">Source</th>
                <th className="px-4 py-2 text-left">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {data.map((opp) => (
                <tr key={opp.id} className="hover:bg-slate-900/40">
                  <td className="px-4 py-3 font-semibold">
                    <Link href={`/opportunities/${opp.id}`} className="hover:text-indigo-300">
                      {opp.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {opp.customerName || opp.customerEmail || `Customer ${opp.customerId}`}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="bg-slate-800 border-slate-700 text-xs">{opp.stage}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {opp.currency} {opp.estimatedValue ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {opp.ownerName || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{opp.division || '—'}</td>
                  <td className="px-4 py-3 text-slate-300">{opp.source || '—'}</td>
                  <td className="px-4 py-3 text-slate-400">{new Date(opp.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td className="px-4 py-3 text-slate-400" colSpan={8}>No opportunities found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
