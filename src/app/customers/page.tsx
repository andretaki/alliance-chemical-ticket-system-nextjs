import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getServerSession } from '@/lib/auth-helpers';
import { db, customers, orders } from '@/lib/db';
import { desc, count, eq, sql } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Customers - Alliance Chemical',
  description: 'Customer management and CRM',
};

export default async function CustomersPage() {
  const { session, error } = await getServerSession();
  if (error || !session?.user) {
    redirect('/auth/signin?callbackUrl=/customers');
  }

  // Fetch customers with aggregated stats
  const customerList = await db.query.customers.findMany({
    columns: {
      id: true,
      primaryEmail: true,
      primaryPhone: true,
      firstName: true,
      lastName: true,
      company: true,
      isVip: true,
      creditRiskLevel: true,
      createdAt: true,
    },
    with: {
      identities: {
        columns: { provider: true },
      },
      orders: {
        columns: { lateFlag: true },
      },
      tickets: {
        columns: { status: true },
      },
    },
    orderBy: [desc(customers.updatedAt)],
    limit: 100,
  });

  const stats = {
    total: customerList.length,
    withLateOrders: customerList.filter(c => c.orders?.some(o => o.lateFlag)).length,
    vip: customerList.filter(c => c.isVip).length,
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Customers</h1>
            <p className="text-slate-400 mt-1">Manage customer relationships and view history</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <kbd className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs">⌘K</kbd>
            <span>to search</span>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="bg-slate-900/60 border-slate-800">
            <CardHeader className="pb-2">
              <CardDescription className="text-slate-400">Total Customers</CardDescription>
              <CardTitle className="text-3xl text-white">{stats.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-slate-900/60 border-slate-800">
            <CardHeader className="pb-2">
              <CardDescription className="text-slate-400">Late AR</CardDescription>
              <CardTitle className="text-3xl text-rose-400">{stats.withLateOrders}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-slate-900/60 border-slate-800">
            <CardHeader className="pb-2">
              <CardDescription className="text-slate-400">VIP Customers</CardDescription>
              <CardTitle className="text-3xl text-amber-400">{stats.vip}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Customer Table */}
        <Card className="bg-slate-900/60 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">All Customers</CardTitle>
            <CardDescription className="text-slate-400">
              Click a customer to view their full profile
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-400">Name</TableHead>
                  <TableHead className="text-slate-400">Email</TableHead>
                  <TableHead className="text-slate-400">Company</TableHead>
                  <TableHead className="text-slate-400">Providers</TableHead>
                  <TableHead className="text-slate-400 text-center">Orders</TableHead>
                  <TableHead className="text-slate-400 text-center">Tickets</TableHead>
                  <TableHead className="text-slate-400">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customerList.map((customer) => {
                  const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'Unknown';
                  const providers = [...new Set(customer.identities?.map(i => i.provider) || [])];
                  const hasLate = customer.orders?.some(o => o.lateFlag);
                  const openTickets = customer.tickets?.filter(t => t.status !== 'closed').length || 0;

                  return (
                    <TableRow key={customer.id} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell>
                        <Link href={`/customers/${customer.id}`} className="font-medium text-white hover:text-emerald-400 transition">
                          {name}
                        </Link>
                        {customer.isVip && (
                          <Badge variant="outline" className="ml-2 text-[10px] bg-amber-500/15 text-amber-300 border-amber-500/30">
                            VIP
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-300">{customer.primaryEmail || '—'}</TableCell>
                      <TableCell className="text-slate-300">{customer.company || '—'}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {providers.map(p => (
                            <Badge key={p} variant="outline" className="text-[10px] capitalize bg-slate-800 text-slate-300 border-slate-700">
                              {p}
                            </Badge>
                          ))}
                          {providers.length === 0 && <span className="text-slate-500">—</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-slate-300">{customer.orders?.length || 0}</TableCell>
                      <TableCell className="text-center">
                        {openTickets > 0 ? (
                          <Badge variant="outline" className="bg-blue-500/15 text-blue-300 border-blue-500/30">
                            {openTickets} open
                          </Badge>
                        ) : (
                          <span className="text-slate-500">{customer.tickets?.length || 0}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {hasLate ? (
                          <Badge variant="outline" className="bg-rose-500/15 text-rose-300 border-rose-500/30">
                            Late AR
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                            Good
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {customerList.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-slate-400 py-8">
                      No customers found. Customers are created when tickets are processed.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
