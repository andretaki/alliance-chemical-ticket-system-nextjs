import { NextResponse } from 'next/server';
import { completeTask } from '@/services/crm/crmDashboardService';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const taskId = parseInt(id, 10);

    if (isNaN(taskId)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
    }

    await completeTask(taskId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to complete task:', error);
    return NextResponse.json({ error: 'Failed to complete task' }, { status: 500 });
  }
}
