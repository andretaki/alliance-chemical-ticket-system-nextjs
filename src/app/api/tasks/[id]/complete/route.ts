import { apiError, apiSuccess } from '@/lib/apiResponse';
import { getServerSession } from '@/lib/auth-helpers';
import { completeTask } from '@/services/crm/crmDashboardService';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  // Auth check
  const { session, error } = await getServerSession();
  if (error || !session?.user?.id) {
    return apiError('unauthorized', 'Authentication required', undefined, { status: 401 });
  }

  try {
    const { id } = await params;
    const taskId = parseInt(id, 10);

    if (isNaN(taskId) || taskId <= 0) {
      return apiError('invalid_request', 'Invalid task ID', undefined, { status: 400 });
    }

    await completeTask(taskId);

    return apiSuccess({ taskId, status: 'completed' });
  } catch (error) {
    console.error('Failed to complete task:', error);
    return apiError('server_error', 'Failed to complete task', undefined, { status: 500 });
  }
}
