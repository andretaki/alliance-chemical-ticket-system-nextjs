import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth-helpers';
import type { Metadata } from 'next';
import TicketListClient from '@/components/TicketListClient';

// Force dynamic rendering since client component uses useSearchParams
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'All Tickets - Alliance Chemical Support',
  description: 'View and manage customer support tickets',
};

export default async function TicketsPage() {
  // BYPASS AUTH
  // const { session, error } = await getServerSession();
  // if (error || !session) {
  //   redirect('/auth/signin?callbackUrl=/tickets');
  // }

  return (
    <main className="flex-grow-1" style={{ minHeight: '100vh' }}>
      <div className="pt-3 pb-2 mb-3">
        <h1 className="h2 fw-bold">All Tickets</h1>
      </div>
      <TicketListClient showSearch={true} />
    </main>
  );
} 