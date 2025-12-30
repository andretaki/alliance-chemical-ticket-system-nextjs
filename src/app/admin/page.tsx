import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth-helpers';
import type { Metadata } from 'next';
import Link from 'next/link';
import WebhookStatus from '@/components/admin/WebhookStatus';
import SubscriptionManager from '@/components/admin/SubscriptionManager';
import GraphApiTester from '@/components/admin/GraphApiTester';
import CustomerAutoCreateManager from '@/components/admin/CustomerAutoCreateManager';
import SlaPolicyManager from '@/components/admin/SlaPolicyManager';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, UserPlus, Mail, Settings, Shield, ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Admin Dashboard - Alliance Chemical Support',
  description: 'Administrative controls and system management',
};

export default async function AdminPage() {
  // BYPASS AUTH
  // const { session, error } = await getServerSession();
  // if (error || !session) {
  //   redirect('/auth/signin?callbackUrl=/admin');
  // }
  // if (session.user?.role !== 'admin') {
  //   redirect('/?error=AccessDenied');
  // }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
              <Shield className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
                Admin Dashboard
              </h1>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                System management and administrative controls
              </p>
            </div>
          </div>
        </header>

        {/* API Tester Card */}
        <section className="mb-6">
          <GraphApiTester />
        </section>

        {/* Webhook Status Card */}
        <section className="mb-6">
          <Card className="border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <CardHeader className="border-b border-gray-100 pb-4 dark:border-gray-700">
              <CardTitle className="text-base font-medium text-gray-900 dark:text-white">
                System Status
              </CardTitle>
            </CardHeader>
            <CardContent className="py-4">
              <WebhookStatus />
            </CardContent>
          </Card>
        </section>

        {/* Subscription Manager Card */}
        <section className="mb-6">
          <Card className="border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <CardHeader className="border-b border-gray-100 pb-4 dark:border-gray-700">
              <CardTitle className="text-base font-medium text-gray-900 dark:text-white">
                Email Subscription Manager
              </CardTitle>
            </CardHeader>
            <CardContent className="py-4">
              <SubscriptionManager />
            </CardContent>
          </Card>
        </section>

        {/* Customer Auto-Create Manager */}
        <section className="mb-6">
          <Card className="border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <CardContent className="py-4">
              <CustomerAutoCreateManager />
            </CardContent>
          </Card>
        </section>

        {/* SLA Policy Manager */}
        <section className="mb-6">
          <Card className="border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <SlaPolicyManager />
          </Card>
        </section>

        {/* Quick Access Cards */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="group border-gray-200 bg-white shadow-sm transition-all hover:border-gray-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600">
            <CardContent className="p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                <Users className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white">User Management</h3>
              <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
                Manage system users, roles, and permissions.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-4 -ml-2 gap-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:text-blue-300 dark:hover:bg-blue-900/20"
                asChild
              >
                <Link href="/manage-users">
                  Manage Users
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="group border-gray-200 bg-white shadow-sm transition-all hover:border-gray-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600">
            <CardContent className="p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                <UserPlus className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Customer Management</h3>
              <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
                Create and manage customers in the system.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-4 -ml-2 gap-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:text-emerald-300 dark:hover:bg-emerald-900/20"
                asChild
              >
                <Link href="/admin/customers/create">
                  Create Customer
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="group border-gray-200 bg-white shadow-sm transition-all hover:border-gray-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600">
            <CardContent className="p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400">
                <Mail className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Email Processing</h3>
              <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
                Configure and monitor automated email processing.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-4 -ml-2 gap-1.5 text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:text-purple-400 dark:hover:text-purple-300 dark:hover:bg-purple-900/20"
                asChild
              >
                <Link href="/admin/email-processing">
                  Email Settings
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="group border-gray-200 bg-white shadow-sm transition-all hover:border-gray-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600">
            <CardContent className="p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
                <Settings className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white">System Settings</h3>
              <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
                Configure global system settings and preferences.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-4 -ml-2 gap-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:text-amber-300 dark:hover:bg-amber-900/20"
                asChild
              >
                <Link href="/admin/settings">
                  System Settings
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
