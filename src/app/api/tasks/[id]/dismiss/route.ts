import { NextResponse } from 'next/server';
import { dismissTask } from '@/services/crm/crmDashboardService';

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

    await dismissTask(taskId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to dismiss task:', error);
    return NextResponse.json({ error: 'Failed to dismiss task' }, { status: 500 });
  }
}
