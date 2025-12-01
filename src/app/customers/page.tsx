import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { db, customers } from '@/lib/db';
import { desc } from 'drizzle-orm';

// Force dynamic rendering since we need database access
export const dynamic = 'force-dynamic';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Users,
  AlertTriangle,
  Crown,
  Plus,
  Search,
  ArrowRight,
  Building2,
  Mail,
  Ticket,
  Package,
  TrendingUp,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Customers - Alliance Chemical',
  description: 'Customer management and CRM',
};

export default async function CustomersPage() {
  // BYPASS AUTH
  // const { session, error } = await getServerSession();
  // if (error || !session?.user) {
  //   redirect('/auth/signin?callbackUrl=/customers');
  // }

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
      // Note: tickets link via senderEmail, not a direct FK
    },
    orderBy: [desc(customers.updatedAt)],
    limit: 100,
  });

  const stats = {
    total: customerList.length,
    withLateOrders: customerList.filter((c) => c.orders?.some((o) => o.lateFlag)).length,
    vip: customerList.filter((c) => c.isVip).length,
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">Customers</h1>
              <p className="mt-1 text-sm text-white/50">
                Manage customer relationships and view history
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-white/40">
                <kbd className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-xs">
                  ⌘K
                </kbd>
                <span>to search</span>
              </div>
              <Button size="sm" className="gap-2 bg-indigo-600 hover:bg-indigo-500" asChild>
                <Link href="/admin/customers/create">
                  <Plus className="h-4 w-4" />
                  Add Customer
                </Link>
              </Button>
            </div>
          </div>
        </header>

        {/* Stats Grid */}
        <section className="mb-8 grid gap-4 sm:grid-cols-3">
          <Card className="group relative overflow-hidden border-white/[0.06] bg-white/[0.02] transition-all hover:border-white/[0.1] hover:bg-white/[0.04]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-white/60">Total Customers</CardTitle>
              <div className="rounded-lg bg-white/[0.04] p-2 text-indigo-400">
                <Users className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums text-white">{stats.total}</span>
              </div>
              <p className="mt-1 text-xs text-white/40">Active accounts</p>
            </CardContent>
          </Card>

          <Card className="group relative overflow-hidden border-white/[0.06] bg-white/[0.02] transition-all hover:border-white/[0.1] hover:bg-white/[0.04]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-white/60">Late AR</CardTitle>
              <div className="rounded-lg bg-red-500/10 p-2 text-red-400">
                <AlertTriangle className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums text-red-400">
                  {stats.withLateOrders}
                </span>
              </div>
              <p className="mt-1 text-xs text-white/40">Customers with overdue payments</p>
            </CardContent>
          </Card>

          <Card className="group relative overflow-hidden border-white/[0.06] bg-white/[0.02] transition-all hover:border-white/[0.1] hover:bg-white/[0.04]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-white/60">VIP Customers</CardTitle>
              <div className="rounded-lg bg-amber-500/10 p-2 text-amber-400">
                <Crown className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums text-amber-400">{stats.vip}</span>
              </div>
              <p className="mt-1 text-xs text-white/40">High-value accounts</p>
            </CardContent>
          </Card>
        </section>

        {/* Customer Table */}
        <Card className="border-white/[0.06] bg-white/[0.02]">
          <CardHeader className="border-b border-white/[0.06] pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-medium text-white">All Customers</CardTitle>
                <CardDescription className="mt-1 text-white/40">
                  Click a customer to view their full profile
                </CardDescription>
              </div>
              <Link
                href="/customers"
                className="flex items-center gap-1 text-xs text-white/40 transition-colors hover:text-white/70"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/[0.06] hover:bg-transparent">
                    <TableHead className="text-white/40">Customer</TableHead>
                    <TableHead className="text-white/40">Email</TableHead>
                    <TableHead className="text-white/40">Company</TableHead>
                    <TableHead className="text-white/40">Integrations</TableHead>
                    <TableHead className="text-center text-white/40">Orders</TableHead>
                    <TableHead className="text-center text-white/40">Tickets</TableHead>
                    <TableHead className="text-white/40">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customerList.map((customer) => {
                    const name =
                      [customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'Unknown';
                    const providers = [
                      ...new Set(customer.identities?.map((i) => i.provider) || []),
                    ];
                    const hasLate = customer.orders?.some((o) => o.lateFlag);

                    return (
                      <TableRow
                        key={customer.id}
                        className="group border-white/[0.04] transition-colors hover:bg-white/[0.02]"
                      >
                        <TableCell>
                          <Link
                            href={`/customers/${customer.id}`}
                            className="flex items-center gap-3"
                          >
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="bg-white/[0.08] text-sm text-white/60">
                                {name.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <span className="font-medium text-white transition-colors group-hover:text-indigo-400">
                                {name}
                              </span>
                              {customer.isVip && (
                                <Badge
                                  variant="outline"
                                  className="ml-2 border-amber-500/30 bg-amber-500/15 text-[10px] text-amber-400"
                                >
                                  <Crown className="mr-1 h-2.5 w-2.5" />
                                  VIP
                                </Badge>
                              )}
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-white/60">
                            {customer.primaryEmail || '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          {customer.company ? (
                            <div className="flex items-center gap-2 text-sm text-white/60">
                              <Building2 className="h-3.5 w-3.5 text-white/30" />
                              {customer.company}
                            </div>
                          ) : (
                            <span className="text-white/30">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {providers.map((p) => (
                              <Badge
                                key={p}
                                variant="outline"
                                className="border-white/10 bg-white/[0.04] text-[10px] capitalize text-white/50"
                              >
                                {p}
                              </Badge>
                            ))}
                            {providers.length === 0 && (
                              <span className="text-xs text-white/30">—</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Package className="h-3.5 w-3.5 text-white/30" />
                            <span className="text-sm text-white/60">
                              {customer.orders?.length || 0}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm text-white/30">—</span>
                        </TableCell>
                        <TableCell>
                          {hasLate ? (
                            <Badge
                              variant="outline"
                              className="border-red-500/30 bg-red-500/15 text-red-400"
                            >
                              <AlertTriangle className="mr-1 h-3 w-3" />
                              Late AR
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
                            >
                              <TrendingUp className="mr-1 h-3 w-3" />
                              Good
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {customerList.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-16 text-center">
                        <div className="flex flex-col items-center">
                          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.04]">
                            <Users className="h-6 w-6 text-white/20" />
                          </div>
                          <p className="text-sm font-medium text-white/60">No customers found</p>
                          <p className="mt-1 text-xs text-white/40">
                            Customers are created when tickets are processed
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
