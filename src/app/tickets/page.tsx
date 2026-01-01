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
    <div className="min-h-screen bg-background">
      <TicketListClient showSearch={true} />
    </div>
  );
} 