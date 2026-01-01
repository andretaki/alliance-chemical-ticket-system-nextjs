import { Metadata } from 'next';
import {
  getCrmDashboardStats,
  getWhoToTalkToday,
  getPipelineHealth,
  getStaleOpportunities,
  getOpenTasks,
  getWinRateByStage,
} from '@/services/crm/crmDashboardService';
import CrmDashboardClient from '@/components/crm/CrmDashboardClient';

export const metadata: Metadata = {
  title: 'CRM - Alliance Chemical',
  description: 'Customer health, pipeline priorities, and action items.',
};

export const dynamic = 'force-dynamic';

export default async function CrmPage() {
  const [stats, whoToTalk, pipelineHealth, staleOpportunities, openTasks, winRate] = await Promise.all([
    getCrmDashboardStats(),
    getWhoToTalkToday({ churnRisk: 'high', limit: 15 }),
    getPipelineHealth(),
    getStaleOpportunities(10),
    getOpenTasks({ limit: 15 }),
    getWinRateByStage(90),
  ]);

  return (
    <CrmDashboardClient
      stats={stats}
      whoToTalk={whoToTalk}
      pipelineHealth={pipelineHealth}
      staleOpportunities={staleOpportunities}
      openTasks={openTasks}
      winRate={winRate}
    />
  );
}
