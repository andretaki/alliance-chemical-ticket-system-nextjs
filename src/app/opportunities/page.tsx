import { listOpportunities } from '@/services/opportunityService';
import { getPipelineHealth } from '@/services/crm/crmDashboardService';
import { OpportunitiesListClient } from '@/components/opportunities/OpportunitiesListClient';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageShell } from '@/components/layout/PageShell';

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
    <PageShell size="wide">
      <PageHeader
        title="Opportunities"
        description="Track pipeline health, stale quotes, and owner performance."
      />
      <OpportunitiesListClient
        initial={initial as any}
        pipelineHealth={pipelineHealth}
      />
    </PageShell>
  );
}
