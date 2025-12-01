import React from 'react';
import { Metadata } from 'next';
import DashboardStatsSection from '@/components/DashboardStatsSection';
import StatusChartClient from '@/components/charts/StatusChartClient';
import PriorityChartClient from '@/components/charts/PriorityChartClient';
import TypeChartClient from '@/components/charts/TypeChartClient';
import TicketListClient from '@/components/TicketListClient';
import EmailProcessingButton from '@/components/EmailProcessingButton';
import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth-helpers';
import DashboardClient from '@/components/DashboardClient';

export const metadata: Metadata = {
  title: 'Dashboard - Issue Tracker',
  description: 'Overview of tickets, statuses, priorities, and types.',
};

export default async function DashboardPage() {
  // BYPASS AUTH - Skip session check
  // const { session, error } = await getServerSession();
  // if (error || !session) {
  //   redirect('/auth/signin?callbackUrl=/dashboard');
  // }

  return (
    <main className="flex-grow-1" style={{ minHeight: '100vh' }}>
      <DashboardClient />
    </main>
  );
}