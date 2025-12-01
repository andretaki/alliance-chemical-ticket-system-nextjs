import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getServerSession } from '@/lib/auth-helpers';
import { customerService } from '@/services/crm/customerService';
import { CustomerSnapshotCard } from '@/components/customers/CustomerSnapshotCard';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, ShoppingBag, Ticket, Wallet, Users, Phone, Mail, Info } from 'lucide-react';

interface PageProps {
  params: { id: string };
}

export async function generateMetadata({ params: paramsPromise }: PageProps): Promise<Metadata> {
  const id = Number(paramsPromise.id);
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
  const { session, error } = await getServerSession();
  if (error || !session?.user) {
    redirect(`/auth/signin?callbackUrl=/customers/${paramsPromise.id}`);
  }

  const id = Number(paramsPromise.id);
  if (Number.isNaN(id)) {
    notFound();
  }

  const overview = await customerService.getOverviewById(id);
  if (!overview) {
    notFound();
  }

  const name = [overview.firstName, overview.lastName].filter(Boolean).join(' ') || 'Customer';
  const toTel = (phone?: string | null) => {
    if (!phone) return null;
    const digits = phone.replace(/[^\d+]/g, '');
    if (!digits) return null;
    return digits.startsWith('+') ? `tel:${digits}` : `tel:+${digits}`;
  };

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
                {overview.primaryPhone && (
                  <a href={toTel(overview.primaryPhone) || undefined} className="px-3 py-1 rounded-full bg-slate-800 hover:bg-slate-700">
                    {overview.primaryPhone}
                  </a>
                )}
              </div>
            </div>
            <div className="w-full md:w-80">
              <CustomerSnapshotCard overview={overview} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card className="border-slate-800 bg-slate-900/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Wallet className="h-4 w-4 text-emerald-300" />
                  AR Snapshot
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-slate-200">
                {overview.qboSnapshot ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span>Balance</span>
                      <span className="font-semibold">{overview.qboSnapshot.currency} {overview.qboSnapshot.balance}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Terms</span>
                      <span className="text-slate-300">{overview.qboSnapshot.terms || '—'}</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      Snapshot: {new Date(overview.qboSnapshot.snapshotTakenAt).toLocaleString()}
                    </div>
                  </>
                ) : (
                  <p className="text-slate-400 text-sm">No AR snapshot yet.</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Ticket className="h-4 w-4 text-indigo-300" />
                  Open Tickets
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {overview.openTickets.length === 0 && (
                  <p className="text-sm text-slate-400">No open tickets.</p>
                )}
                {overview.openTickets.slice(0, 4).map(ticket => (
                  <Link key={ticket.id} href={`/tickets/${ticket.id}`} className="block rounded-lg border border-slate-800/80 bg-slate-900/70 p-3 hover:bg-slate-800/60 transition">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">#{ticket.id} — {ticket.title}</p>
                        <p className="text-xs text-slate-400">Updated {new Date(ticket.updatedAt).toLocaleString()}</p>
                      </div>
                      <Badge variant="outline" className="text-xs bg-slate-800 border-slate-700">{ticket.status}</Badge>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <ShoppingBag className="h-4 w-4 text-amber-300" />
                  Frequent Products
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {overview.frequentProducts.length === 0 && (
                  <p className="text-sm text-slate-400">No order history yet.</p>
                )}
                {overview.frequentProducts.map((item) => (
                  <div key={`${item.sku || item.title || 'item'}-${item.quantity}`} className="flex items-center justify-between text-sm text-slate-200">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.title || item.sku || 'Unknown product'}</p>
                      {item.sku && <p className="text-xs text-slate-500">SKU: {item.sku}</p>}
                    </div>
                    <Badge variant="outline" className="bg-slate-800 border-slate-700 text-xs">x{item.quantity}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Ticket className="h-4 w-4 text-emerald-200" />
                  Open Opportunities
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {overview.openOpportunities.length === 0 && (
                  <p className="text-sm text-slate-400">No open opportunities.</p>
                )}
                {overview.openOpportunities.slice(0, 5).map((opp) => (
                  <Link key={opp.id} href={`/opportunities/${opp.id}`} className="block rounded-lg border border-slate-800/80 bg-slate-900/70 p-3 hover:bg-slate-800/60 transition">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold truncate">{opp.title}</p>
                        <p className="text-xs text-slate-400">{opp.stage}</p>
                      </div>
                      <Badge variant="outline" className="text-xs bg-slate-800 border-slate-700">
                        {opp.currency} {opp.estimatedValue ?? '—'}
                      </Badge>
                    </div>
                    {opp.ownerName && <p className="text-xs text-slate-400 mt-1">Owner: {opp.ownerName}</p>}
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold flex items-center gap-2"><Users className="h-4 w-4 text-sky-300" /> Contacts</h2>
                <span className="text-xs text-slate-400">{overview.contacts.length} saved</span>
              </div>
              <div className="space-y-3">
                {overview.contacts.map((contact) => (
                  <div key={contact.id} className="rounded-lg border border-slate-800/80 bg-slate-900/70 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{contact.name}</span>
                      {contact.role && <Badge variant="outline" className="bg-slate-800 border-slate-700 text-xs">{contact.role}</Badge>}
                    </div>
                    <div className="mt-1 text-sm text-slate-300 space-y-1">
                      {contact.email && <div className="flex items-center gap-2 text-slate-300"><Mail className="h-3 w-3" /> {contact.email}</div>}
                      {contact.phone && (
                        <div className="flex items-center gap-2 text-slate-300">
                          <Phone className="h-3 w-3" />
                          <a href={toTel(contact.phone) || undefined} className="hover:underline">
                            {contact.phone}
                          </a>
                        </div>
                      )}
                      {contact.notes && <p className="text-xs text-slate-400">{contact.notes}</p>}
                    </div>
                  </div>
                ))}
                {overview.contacts.length === 0 && (
                  <p className="text-sm text-slate-400">No contacts yet.</p>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold flex items-center gap-2"><Info className="h-4 w-4 text-indigo-300" /> Identities</h2>
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
          </div>

          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold flex items-center gap-2"><Phone className="h-4 w-4 text-emerald-300" /> Recent Calls</h2>
              <span className="text-xs text-slate-400">{overview.recentCalls.length} loaded</span>
            </div>
            <div className="space-y-3">
              {overview.recentCalls.length === 0 && (
                <p className="text-sm text-slate-400">No calls recorded yet.</p>
              )}
              {overview.recentCalls.map((call) => (
                <div key={call.id} className="rounded-lg border border-slate-800/80 bg-slate-900/70 p-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="bg-slate-800 border-slate-700 text-xs capitalize">
                      {call.direction}
                    </Badge>
                    <span className="text-xs text-slate-400">
                      {new Date(call.startedAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-slate-200">
                    {call.direction === 'inbound' ? 'From' : 'To'}: {call.direction === 'inbound' ? call.fromNumber : call.toNumber}
                  </div>
                  {call.durationSeconds != null && (
                    <p className="text-xs text-slate-400">Duration: {call.durationSeconds}s</p>
                  )}
                  {call.contactName && <p className="text-xs text-slate-400">Contact: {call.contactName}</p>}
                  <div className="mt-2 flex gap-3 text-xs">
                    {call.ticketId && (
                      <Link href={`/tickets/${call.ticketId}`} className="text-indigo-300 hover:underline">
                        Ticket #{call.ticketId}
                      </Link>
                    )}
                    {call.opportunityId && (
                      <Link href={`/opportunities/${call.opportunityId}`} className="text-indigo-300 hover:underline">
                        Opportunity #{call.opportunityId}
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold flex items-center gap-2"><Package className="h-4 w-4 text-amber-300" /> Recent Orders</h2>
              <span className="text-xs text-slate-400">{overview.recentOrders.length} loaded</span>
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-800">
              <table className="min-w-full divide-y divide-slate-800">
                <thead className="bg-slate-900/70 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-4 py-2 text-left">Order</th>
                    <th className="px-4 py-2 text-left">Total</th>
                    <th className="px-4 py-2 text-left">Placed</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Items</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/80 text-sm">
                  {overview.recentOrders.map(order => (
                    <tr key={order.id} className="hover:bg-slate-900/50">
                      <td className="px-4 py-3 font-semibold text-white">{order.orderNumber || `Order ${order.id}`}</td>
                      <td className="px-4 py-3 text-slate-200">
                        {order.currency} {order.total}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{order.placedAt ? new Date(order.placedAt).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs ${order.lateFlag ? 'bg-rose-500/20 text-rose-200' : 'bg-slate-800 text-slate-200'}`}>
                          {order.financialStatus}{order.lateFlag ? ' • late' : ''}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {order.items.length > 0 ? order.items.map(i => `${i.title || i.sku || 'Item'} x${i.quantity}`).join(', ') : '—'}
                      </td>
                    </tr>
                  ))}
                  {overview.recentOrders.length === 0 && (
                    <tr>
                      <td className="px-4 py-3 text-slate-400" colSpan={5}>No orders yet.</td>
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
