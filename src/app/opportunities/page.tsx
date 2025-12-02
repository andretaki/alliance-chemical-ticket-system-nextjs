import { listOpportunities } from '@/services/opportunityService';
import { OpportunitiesListClient } from '@/components/opportunities/OpportunitiesListClient';
import type { Metadata } from 'next';

// Force dynamic rendering since we fetch from database
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Opportunities - Alliance Chemical CRM',
};

export default async function OpportunitiesPage() {
  const initialRaw = await listOpportunities();
  const initial = initialRaw.map((o: any) => ({
    ...o,
    createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt,
  }));
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-white mb-4">Opportunities</h1>
      <OpportunitiesListClient initial={initial as any} />
    </div>
  );
}
