import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getServerSession } from '@/lib/auth-helpers';
import { customerService } from '@/services/crm/customerService';
import { CustomerSnapshotCard } from '@/components/customers/CustomerSnapshotCard';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params: paramsPromise }: PageProps): Promise<Metadata> {
  const params = await paramsPromise;
  const id = Number(params.id);
  if (Number.isNaN(id)) return { title: 'Customer - Alliance Chemical' };

  const overview = await customerService.getOverviewById(id);
  if (!overview) return { title: 'Customer not found - Alliance Chemical' };

  const name = [overview.firstName, overview.lastName].filter(Boolean).join(' ') || 'Customer';
  return {
    title: `${name} - Customer 360`,
    description: `Orders, tickets, and identities for ${name}`,
  };
}

export default async function CustomerPage({ params: paramsPromise }: PageProps) {
  const params = await paramsPromise;
  const { session, error } = await getServerSession();
  if (error || !session?.user) {
    redirect(`/auth/signin?callbackUrl=/customers/${params.id}`);
  }

  const id = Number(params.id);
  if (Number.isNaN(id)) {
    notFound();
  }

  const overview = await customerService.getOverviewById(id);
  if (!overview) {
    notFound();
  }

  const name = [overview.firstName, overview.lastName].filter(Boolean).join(' ') || 'Customer';

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Customer 360</p>
              <h1 className="text-3xl font-semibold">{name}</h1>
              {overview.company && <p className="text-slate-300">{overview.company}</p>}
              <div className="mt-2 flex flex-wrap gap-2 text-sm text-slate-300">
                {overview.primaryEmail && <span className="px-3 py-1 rounded-full bg-slate-800">{overview.primaryEmail}</span>}
                {overview.primaryPhone && <span className="px-3 py-1 rounded-full bg-slate-800">{overview.primaryPhone}</span>}
              </div>
            </div>
            <div className="w-full md:w-80">
              <CustomerSnapshotCard overview={overview} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">Identities</h2>
                <span className="text-xs text-slate-400">{overview.identities.length} linked</span>
              </div>
              <div className="space-y-3">
                {overview.identities.map((identity) => (
                  <div key={identity.id} className="rounded-lg border border-slate-800/80 bg-slate-900/70 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium capitalize">{identity.provider}</span>
                      {identity.externalId && <span className="text-xs text-slate-400 truncate max-w-[140px]">{identity.externalId}</span>}
                    </div>
                    <div className="mt-1 text-sm text-slate-300 space-y-1">
                      {identity.email && <p>{identity.email}</p>}
                      {identity.phone && <p>{identity.phone}</p>}
                    </div>
                  </div>
                ))}
                {overview.identities.length === 0 && (
                  <p className="text-sm text-slate-400">No identities linked yet.</p>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">Recent Tickets</h2>
                <span className="text-xs text-slate-400">{overview.tickets.length} loaded</span>
              </div>
              <div className="space-y-3">
                {overview.tickets.map(ticket => (
                  <Link
                    key={ticket.id}
                    href={`/tickets/${ticket.id}`}
                    className="block rounded-lg border border-slate-800/80 bg-slate-900/70 p-3 hover:bg-slate-800/60 transition"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">#{ticket.id} — {ticket.title}</p>
                        <p className="text-xs text-slate-400">Updated {new Date(ticket.updatedAt).toLocaleString()}</p>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-xs px-2 py-1 rounded-full bg-slate-800">{ticket.status}</span>
                        <span className="text-xs px-2 py-1 rounded-full bg-slate-800">{ticket.priority}</span>
                      </div>
                    </div>
                  </Link>
                ))}
                {overview.tickets.length === 0 && (
                  <p className="text-sm text-slate-400">No tickets yet.</p>
                )}
              </div>
            </section>
          </div>

          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Recent Orders</h2>
              <span className="text-xs text-slate-400">{overview.orders.length} loaded</span>
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-800">
              <table className="min-w-full divide-y divide-slate-800">
                <thead className="bg-slate-900/70 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-4 py-2 text-left">Order</th>
                    <th className="px-4 py-2 text-left">Provider</th>
                    <th className="px-4 py-2 text-left">Total</th>
                    <th className="px-4 py-2 text-left">Placed</th>
                    <th className="px-4 py-2 text-left">Due</th>
                    <th className="px-4 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/80 text-sm">
                  {overview.orders.map(order => (
                    <tr key={order.id} className="hover:bg-slate-900/50">
                      <td className="px-4 py-3 font-semibold text-white">{order.orderNumber || `Order ${order.id}`}</td>
                      <td className="px-4 py-3 capitalize text-slate-200">{order.provider}</td>
                      <td className="px-4 py-3 text-slate-200">
                        {order.currency} {order.total}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{order.placedAt ? new Date(order.placedAt).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-3 text-slate-300">{order.dueAt ? new Date(order.dueAt).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs ${order.lateFlag ? 'bg-rose-500/20 text-rose-200' : 'bg-slate-800 text-slate-200'}`}>
                          {order.financialStatus}{order.lateFlag ? ' • late' : ''}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {overview.orders.length === 0 && (
                    <tr>
                      <td className="px-4 py-3 text-slate-400" colSpan={6}>No orders yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
