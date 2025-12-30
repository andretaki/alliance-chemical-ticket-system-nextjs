import { listOpportunities } from '@/services/opportunityService';
import { getPipelineHealth } from '@/services/crm/crmDashboardService';
import { OpportunitiesListClient } from '@/components/opportunities/OpportunitiesListClient';
import type { Metadata } from 'next';

// Force dynamic rendering since we fetch from database
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Opportunities - Alliance Chemical CRM',
};

export default async function OpportunitiesPage() {
  const [initialRaw, pipelineHealth] = await Promise.all([
    listOpportunities(),
    getPipelineHealth(),
  ]);

  const initial = initialRaw.map((o: any) => ({
    ...o,
    createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt,
    stageChangedAt: o.stageChangedAt instanceof Date ? o.stageChangedAt.toISOString() : o.stageChangedAt,
  }));

  return (
    <div className="min-h-screen bg-background p-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">Opportunities</h1>
      <OpportunitiesListClient
        initial={initial as any}
        pipelineHealth={pipelineHealth}
      />
    </div>
  );
}
