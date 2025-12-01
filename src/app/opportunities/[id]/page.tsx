import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getOpportunityById } from '@/services/opportunityService';
import { OpportunityDetailClient } from '@/components/opportunities/OpportunityDetailClient';

interface PageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const id = Number(params.id);
  if (Number.isNaN(id)) return { title: 'Opportunity - Alliance Chemical' };
  const opp = await getOpportunityById(id);
  if (!opp) return { title: 'Opportunity not found' };
  return { title: `${opp.title} - Opportunity` };
}

export default async function OpportunityDetailPage({ params }: PageProps) {
  const id = Number(params.id);
  if (Number.isNaN(id)) notFound();
  const opportunity = await getOpportunityById(id);
  if (!opportunity) notFound();

  const serialized = {
    ...opportunity,
    createdAt: opportunity.createdAt instanceof Date ? opportunity.createdAt.toISOString() : opportunity.createdAt,
    updatedAt: opportunity.updatedAt instanceof Date ? opportunity.updatedAt.toISOString() : opportunity.updatedAt,
    closedAt: opportunity.closedAt instanceof Date ? opportunity.closedAt.toISOString() : opportunity.closedAt,
  };

  return (
    <div className="p-6">
      <OpportunityDetailClient opportunity={serialized as any} />
    </div>
  );
}
