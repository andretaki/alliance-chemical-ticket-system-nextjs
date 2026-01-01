import { Metadata } from 'next';
import { getOpenTasks, completeTask, dismissTask } from '@/services/crm/crmDashboardService';
import TasksPageClient from '@/components/tasks/TasksPageClient';

export const metadata: Metadata = {
  title: 'Tasks - Alliance Chemical',
  description: 'CRM tasks and action items.',
};

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  const tasks = await getOpenTasks({ limit: 100 });

  return (
    <TasksPageClient initialTasks={tasks} />
  );
}
