'use client';

import Link from 'next/link';
import type { CustomerOverview } from '@/services/crm/customerService';

interface Props {
  overview: CustomerOverview;
}

const badgeColors: Record<string, string> = {
  shopify: 'bg-emerald-500/15 text-emerald-300',
  amazon: 'bg-orange-500/15 text-orange-300',
  qbo: 'bg-sky-500/15 text-sky-200',
  klaviyo: 'bg-purple-500/15 text-purple-200',
  manual: 'bg-slate-500/15 text-slate-200',
  self_reported: 'bg-lime-500/15 text-lime-200',
};

export function CustomerSnapshotCard({ overview }: Props) {
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
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Customer</p>
          <h3 className="text-lg font-semibold text-white">{name}</h3>
          {overview.company && <p className="text-slate-300 text-sm">{overview.company}</p>}
        </div>
        {hasLate && (
          <span className="rounded-full bg-rose-500/20 text-rose-200 text-xs px-3 py-1 font-semibold">
            Late AR
          </span>
        )}
      </div>

      <div className="mt-3 space-y-2 text-sm text-slate-200">
        {overview.primaryEmail && <p className="truncate">{overview.primaryEmail}</p>}
        {overview.primaryPhone && (
          <a href={toTel(overview.primaryPhone) || undefined} className="truncate text-indigo-200 hover:underline">
            {overview.primaryPhone}
          </a>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {providers.map(p => (
          <span key={p} className={`text-xs px-2 py-1 rounded-full border border-slate-800 ${badgeColors[p] || 'text-slate-200'}`}>
            {p}
          </span>
        ))}
      </div>

      {overview.qboSnapshot && (
        <div className="mt-3 rounded-lg border border-slate-800/80 bg-slate-900/70 p-3">
          <div className="text-xs uppercase tracking-[0.15em] text-slate-500">AR</div>
          <div className="text-sm text-slate-200">
            Balance: <span className="font-semibold text-emerald-300">{overview.qboSnapshot.currency} {overview.qboSnapshot.balance}</span>
          </div>
          <div className="text-xs text-slate-400">Terms: {overview.qboSnapshot.terms || '—'}</div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm text-slate-300">
        <div className="rounded-lg border border-slate-800/80 bg-slate-900/70 p-2">
          <div className="text-lg font-semibold text-white">{overview.totalOrders}</div>
          <div className="text-xs text-slate-400">Orders</div>
        </div>
        <div className="rounded-lg border border-slate-800/80 bg-slate-900/70 p-2">
          <div className="text-lg font-semibold text-white">{overview.openTicketsCount}</div>
          <div className="text-xs text-slate-400">Open tickets</div>
        </div>
        <div className="rounded-lg border border-slate-800/80 bg-slate-900/70 p-2">
          <div className={`text-lg font-semibold ${hasLate ? 'text-rose-300' : 'text-white'}`}>
            {overview.lateOrdersCount}
          </div>
          <div className="text-xs text-slate-400">Late</div>
        </div>
        <div className="rounded-lg border border-slate-800/80 bg-slate-900/70 p-2 col-span-3 text-left">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase tracking-[0.15em] text-slate-500">Open opportunities</div>
            <span className="text-xs text-slate-400">{overview.openOpportunities.length}</span>
          </div>
          {overview.openOpportunities.length === 0 ? (
            <p className="text-sm text-slate-400">No open opportunities</p>
          ) : (
            <div className="space-y-2">
              {overview.openOpportunities.slice(0, 3).map((opp) => (
                <div key={opp.id} className="flex items-center justify-between text-sm text-slate-200">
                  <div className="truncate">
                    <p className="truncate font-medium">{opp.title}</p>
                    <p className="text-xs text-slate-500">{opp.stage}</p>
                  </div>
                  <span className="text-xs text-slate-300">
                    {opp.currency} {opp.estimatedValue ?? '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4">
        <Link
          href={`/customers/${overview.id}`}
          className="inline-flex items-center justify-center w-full rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium text-white py-2 transition"
        >
          View customer 360
        </Link>
      </div>
    </div>
  );
}
