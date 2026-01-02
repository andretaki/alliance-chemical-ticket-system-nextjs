import type { NextRequest } from 'next/server';
import { getServerSession } from '@/lib/auth-helpers';
import { db } from '@/lib/db';
import { users } from '@/db/schema';
import { eq, or, and, sql } from 'drizzle-orm';
import { apiSuccess, apiError } from '@/lib/apiResponse';

export async function GET(request: NextRequest) {
  try {
    const { session, error } = await getServerSession();
    if (error) {
      return apiError('unauthorized', error, null, { status: 401 });
    }
    if (!session || session.user?.role !== 'admin') {
      return apiError('unauthorized', 'Unauthorized', null, { status: 401 });
    }

    const url = new URL(request.url);
    const statusFilter = url.searchParams.get('status') as 'pending' | 'approved' | 'rejected' | null;

    let queryConditions;
    if (statusFilter) {
      // Only show users who registered (not external users created from emails)
      // External users have isExternal=true, so we want isExternal=false OR null
      queryConditions = and(
        eq(users.approvalStatus, statusFilter),
        or(
          eq(users.isExternal, false),
          sql`${users.isExternal} IS NULL`
        )
      );
    } else {
      // Default to pending & approved users, but ONLY those who registered (not external email users)
      queryConditions = and(
        or(
          eq(users.approvalStatus, 'pending'),
          eq(users.approvalStatus, 'approved')
        ),
        or(
          eq(users.isExternal, false),
          sql`${users.isExternal} IS NULL`
        )
      );
    }

    const userList = await db.query.users.findMany({
      where: queryConditions,
      columns: {
        id: true,
        name: true,
        email: true,
        role: true,
        approvalStatus: true,
        createdAt: true,
      },
      orderBy: (users, { desc }) => [desc(users.createdAt)],
    });

    return apiSuccess(userList);

  } catch (error) {
    console.error('Error fetching users:', error);
    return apiError('internal_error', 'Internal server error', null, { status: 500 });
  }
} 