import type { NextRequest } from 'next/server';
import { getServerSession } from '@/lib/auth-helpers';
import { db } from '@/lib/db';
import { users, userApprovalStatusEnum } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { apiSuccess, apiError } from '@/lib/apiResponse';

interface StatusUpdateRequestBody {
  status: typeof userApprovalStatusEnum.enumValues[number];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { session, error } = await getServerSession();
    if (error) {
      return apiError('unauthorized', error, null, { status: 401 });
    }
    if (!session || !session.user || (session.user.role !== 'admin' && session.user.role !== 'manager')) {
      return apiError('unauthorized', 'Unauthorized', null, { status: 401 });
    }

    const { userId } = await params;
    const { status } = await request.json();

    if (!userId || !status) {
      return apiError('validation_error', 'User ID and status are required', null, { status: 400 });
    }

    if (!userApprovalStatusEnum.enumValues.includes(status)) {
      return apiError('validation_error', 'Invalid status provided', null, { status: 400 });
    }

    // Check if user exists
    const userExists = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!userExists) {
      return apiError('not_found', 'User not found', null, { status: 404 });
    }

    await db.update(users)
      .set({ approvalStatus: status, updatedAt: new Date() })
      .where(eq(users.id, userId));

    return apiSuccess({ message: `User status updated to ${status}` });

  } catch (error) {
    console.error('Error updating user status:', error);
    if (error instanceof SyntaxError) {
      return apiError('validation_error', 'Invalid request body', null, { status: 400 });
    }
    return apiError('internal_error', 'Internal server error', null, { status: 500 });
  }
} 