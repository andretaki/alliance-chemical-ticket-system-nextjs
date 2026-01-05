import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getOpportunityById } from '@/services/opportunityService';
import { getOpenTasksForOpportunity } from '@/services/crm/crmDashboardService';
import { OpportunityDetailClient } from '@/components/opportunities/OpportunityDetailClient';
import { PageShell } from '@/components/layout/PageShell';
import { Breadcrumb } from '@/components/ui/breadcrumb';

interface PageProps {
  params: any;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (Number.isNaN(id)) return { title: 'Opportunity - Alliance Chemical' };
  const opp = await getOpportunityById(id);
  if (!opp) return { title: 'Opportunity not found' };
  return { title: `${opp.title} - Opportunity` };
}

export default async function OpportunityDetailPage({ params }: PageProps) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (Number.isNaN(id)) notFound();

  const [opportunity, openTasks] = await Promise.all([
    getOpportunityById(id),
    getOpenTasksForOpportunity(id),
  ]);

  if (!opportunity) notFound();

  const serialized = {
    ...opportunity,
    createdAt: opportunity.createdAt instanceof Date ? opportunity.createdAt.toISOString() : opportunity.createdAt,
    updatedAt: opportunity.updatedAt instanceof Date ? opportunity.updatedAt.toISOString() : opportunity.updatedAt,
    closedAt: opportunity.closedAt instanceof Date ? opportunity.closedAt.toISOString() : opportunity.closedAt,
    stageChangedAt: opportunity.stageChangedAt instanceof Date ? opportunity.stageChangedAt.toISOString() : opportunity.stageChangedAt,
  };

  const serializedTasks = openTasks.map((t) => ({
    ...t,
    dueAt: t.dueAt instanceof Date ? t.dueAt.toISOString() : t.dueAt ? String(t.dueAt) : null,
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
  }));

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3 border-b bg-muted/30">
        <Breadcrumb
          items={[
            { label: 'Opportunities', href: '/opportunities' },
            { label: opportunity.title },
          ]}
        />
      </div>
      <PageShell size="wide">
        <OpportunityDetailClient opportunity={serialized as any} openTasks={serializedTasks} />
      </PageShell>
    </div>
  );
}
