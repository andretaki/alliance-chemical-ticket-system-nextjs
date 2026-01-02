import { Metadata } from 'next';
import { getOpenTasks, completeTask, dismissTask } from '@/services/crm/crmDashboardService';
import TasksPageClient from '@/components/tasks/TasksPageClient';

export const metadata: Metadata = {
  title: 'Tasks - Alliance Chemical',
  description: 'CRM tasks and action items.',
};

export const dynamic = 'force-dynamic';

interface TasksPageProps {
  searchParams: Promise<{ type?: string }>;
}

export default async function TasksPage({ searchParams }: TasksPageProps) {
  const params = await searchParams;
  const tasks = await getOpenTasks({ limit: 100 });

  return (
    <TasksPageClient initialTasks={tasks} initialFilter={params.type || null} />
  );
}
