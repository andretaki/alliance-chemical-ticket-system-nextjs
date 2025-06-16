import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import type { Metadata } from 'next';
import TicketListClient from '@/components/TicketListClient';
import { authOptions } from '@/lib/authOptions';

export const metadata: Metadata = {
  title: 'All Tickets - Alliance Chemical Support',
  description: 'View and manage customer support tickets',
};

export default async function TicketsPage() {
  // Server-side authentication check
  const session = await getServerSession(authOptions);
  
  if (!session) {
    redirect('/auth/signin?callbackUrl=/tickets');
  }
  
  return (
    <main className="flex-grow-1" style={{ minHeight: '100vh' }}>
      <div className="pt-3 pb-2 mb-3">
        <h1 className="h2 fw-bold">All Tickets</h1>
      </div>
      <TicketListClient />
    </main>
  );
} 