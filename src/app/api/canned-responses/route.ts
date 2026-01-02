import { db } from '@/lib/db';
import { getServerSession } from '@/lib/auth-helpers';
import { apiSuccess, apiError } from '@/lib/apiResponse';

export async function GET() {
  try {
    // Basic authentication check
    const { session, error } = await getServerSession();
    if (error) {
      return apiError('unauthorized', error, null, { status: 401 });
    }
    if (!session?.user?.id) {
      return apiError('unauthorized', 'Unauthorized', null, { status: 401 });
    }

    const responses = await db.query.cannedResponses.findMany({
      orderBy: (resp, { asc }) => [asc(resp.title)], // Order alphabetically
      columns: {
        id: true,
        title: true,
        content: true,
        category: true,
      }
    });

    return apiSuccess(responses);
  } catch (error) {
    console.error("API Error [GET /api/canned-responses]:", error);
    return apiError('internal_error', 'Failed to fetch canned responses', null, { status: 500 });
  }
}

// TODO: Add POST/PUT/DELETE later for managing canned responses via an admin UI 