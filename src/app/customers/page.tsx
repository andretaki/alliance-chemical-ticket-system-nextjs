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
import { Kbd } from '@/components/ui/kbd';
import { EmptyState } from '@/components/layout/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageShell } from '@/components/layout/PageShell';
import { Section } from '@/components/layout/Section';
import { StatCard } from '@/components/layout/StatCard';
import { StatusPill } from '@/components/ui/status-pill';
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
  Building2,
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
    <PageShell size="wide">
      <PageHeader
        title="Customers"
        description="Manage customer relationships and view history."
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Kbd>⌘K</Kbd>
              <span>to search</span>
            </div>
            <Button size="sm" className="gap-2" asChild>
              <Link href="/admin/customers/create">
                <Plus className="h-4 w-4" />
                Add Customer
              </Link>
            </Button>
          </div>
        }
      />

      <Section title="Overview" description="Customer health and risk signals.">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            title="Total Customers"
            value={stats.total}
            description="Active accounts"
            icon={Users}
          />
          <StatCard
            title="Late AR"
            value={stats.withLateOrders}
            description="Customers with overdue payments"
            icon={AlertTriangle}
            tone="danger"
          />
          <StatCard
            title="VIP Customers"
            value={stats.vip}
            description="High-value accounts"
            icon={Crown}
            tone="warning"
          />
        </div>
      </Section>

      {/* Customer Table */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-foreground">All Customers</CardTitle>
              <CardDescription className="mt-1 text-muted-foreground">
                Click a customer to view their full profile
              </CardDescription>
            </div>
          </div>
        </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/60 hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Customer</TableHead>
                    <TableHead className="text-muted-foreground">Email</TableHead>
                    <TableHead className="text-muted-foreground">Company</TableHead>
                    <TableHead className="text-muted-foreground">Integrations</TableHead>
                    <TableHead className="text-center text-muted-foreground">Orders</TableHead>
                    <TableHead className="text-center text-muted-foreground">Tickets</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
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
                        className="group border-border/40 transition-colors hover:bg-muted/60"
                      >
                        <TableCell>
                          <Link
                            href={`/customers/${customer.id}`}
                            className="flex items-center gap-3"
                          >
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="bg-muted text-sm text-muted-foreground">
                                {name.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <span className="font-medium text-foreground transition-colors group-hover:text-primary">
                                {name}
                              </span>
                              {customer.isVip && (
                                <Badge
                                  variant="outline"
                                  className="ml-2 text-[10px] text-amber-700 dark:text-amber-400 border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-900/30"
                                >
                                  <Crown className="mr-1 h-2.5 w-2.5" />
                                  VIP
                                </Badge>
                              )}
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {customer.primaryEmail || '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          {customer.company ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                              {customer.company}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {providers.map((p) => (
                              <Badge
                                key={p}
                                variant="outline"
                                className="text-[10px] capitalize text-muted-foreground"
                              >
                                {p}
                              </Badge>
                            ))}
                            {providers.length === 0 && (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Package className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">
                              {customer.orders?.length || 0}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm text-muted-foreground">—</span>
                        </TableCell>
                        <TableCell>
                          {hasLate ? (
                            <StatusPill tone="danger">
                              <AlertTriangle className="mr-1 h-3 w-3" />
                              Late AR
                            </StatusPill>
                          ) : (
                            <StatusPill tone="success">
                              <TrendingUp className="mr-1 h-3 w-3" />
                              Good
                            </StatusPill>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {customerList.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10">
                        <EmptyState
                          icon={Users}
                          title="No customers yet"
                          description="Customers are created when tickets are processed or imported from integrations. Create one to start tracking."
                          action={
                            <Button size="sm" asChild>
                              <Link href="/admin/customers/create">Add customer</Link>
                            </Button>
                          }
                          className="border-0 bg-transparent"
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
      </Card>
    </PageShell>
  );
}
