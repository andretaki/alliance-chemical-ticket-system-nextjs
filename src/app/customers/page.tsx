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
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">Customers</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Manage customer relationships and view history
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
                <kbd className="rounded border border-gray-200 bg-gray-100 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800">
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
          <Card className="group relative overflow-hidden border-gray-200 bg-white shadow-sm transition-all hover:border-gray-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Customers</CardTitle>
              <div className="rounded-lg bg-indigo-100 p-2 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                <Users className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums text-gray-900 dark:text-white">{stats.total}</span>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Active accounts</p>
            </CardContent>
          </Card>

          <Card className="group relative overflow-hidden border-gray-200 bg-white shadow-sm transition-all hover:border-gray-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">Late AR</CardTitle>
              <div className="rounded-lg bg-red-100 p-2 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums text-red-600 dark:text-red-400">
                  {stats.withLateOrders}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Customers with overdue payments</p>
            </CardContent>
          </Card>

          <Card className="group relative overflow-hidden border-gray-200 bg-white shadow-sm transition-all hover:border-gray-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">VIP Customers</CardTitle>
              <div className="rounded-lg bg-amber-100 p-2 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                <Crown className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums text-amber-600 dark:text-amber-400">{stats.vip}</span>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">High-value accounts</p>
            </CardContent>
          </Card>
        </section>

        {/* Customer Table */}
        <Card className="border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <CardHeader className="border-b border-gray-100 pb-4 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-medium text-gray-900 dark:text-white">All Customers</CardTitle>
                <CardDescription className="mt-1 text-gray-500 dark:text-gray-400">
                  Click a customer to view their full profile
                </CardDescription>
              </div>
              <Link
                href="/customers"
                className="flex items-center gap-1 text-xs text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-100 hover:bg-transparent dark:border-gray-700">
                    <TableHead className="text-gray-500 dark:text-gray-400">Customer</TableHead>
                    <TableHead className="text-gray-500 dark:text-gray-400">Email</TableHead>
                    <TableHead className="text-gray-500 dark:text-gray-400">Company</TableHead>
                    <TableHead className="text-gray-500 dark:text-gray-400">Integrations</TableHead>
                    <TableHead className="text-center text-gray-500 dark:text-gray-400">Orders</TableHead>
                    <TableHead className="text-center text-gray-500 dark:text-gray-400">Tickets</TableHead>
                    <TableHead className="text-gray-500 dark:text-gray-400">Status</TableHead>
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
                        className="group border-gray-50 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50"
                      >
                        <TableCell>
                          <Link
                            href={`/customers/${customer.id}`}
                            className="flex items-center gap-3"
                          >
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="bg-gray-100 text-sm text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                                {name.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <span className="font-medium text-gray-900 transition-colors group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-400">
                                {name}
                              </span>
                              {customer.isVip && (
                                <Badge
                                  variant="outline"
                                  className="ml-2 border-amber-200 bg-amber-50 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                                >
                                  <Crown className="mr-1 h-2.5 w-2.5" />
                                  VIP
                                </Badge>
                              )}
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-gray-600 dark:text-gray-300">
                            {customer.primaryEmail || '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          {customer.company ? (
                            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                              <Building2 className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
                              {customer.company}
                            </div>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {providers.map((p) => (
                              <Badge
                                key={p}
                                variant="outline"
                                className="border-gray-200 bg-gray-50 text-[10px] capitalize text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
                              >
                                {p}
                              </Badge>
                            ))}
                            {providers.length === 0 && (
                              <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Package className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
                            <span className="text-sm text-gray-600 dark:text-gray-300">
                              {customer.orders?.length || 0}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm text-gray-400 dark:text-gray-500">—</span>
                        </TableCell>
                        <TableCell>
                          {hasLate ? (
                            <Badge
                              variant="outline"
                              className="border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400"
                            >
                              <AlertTriangle className="mr-1 h-3 w-3" />
                              Late AR
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
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
                          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
                            <Users className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                          </div>
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No customers found</p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Customers are created when tickets are processed or imported from integrations
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
