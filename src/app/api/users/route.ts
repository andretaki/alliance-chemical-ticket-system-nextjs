import { db, users } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { getServerSession } from '@/lib/auth-helpers';
import { apiSuccess, apiError } from '@/lib/apiResponse';

// GET /api/users - Fetches all users (for dropdowns, etc.)
export async function GET() {
  // Auth check - only authenticated users can view user list
  const { session, error } = await getServerSession();
  if (error || !session?.user?.id) {
    return apiError('unauthorized', 'Authentication required', null, { status: 401 });
  }

  try {
    // Wrap the database query in unstable_cache
    // This will cache the result for 60 seconds.
    // The cache is automatically revalidated if the data changes via a Vercel Data Cache feature.
    const getCachedUsers = unstable_cache(
      async () => {
        console.log('Fetching users from DB (cache miss)');
        const allUsers = await db.query.users.findMany({
          where: eq(users.isExternal, false), // Only return internal users (employees)
          columns: {
            // Select only the necessary columns to avoid sending sensitive data
            id: true,
            name: true,
            email: true,
            role: true, // Include role if useful for display or filtering later
          },
          orderBy: (users, { asc }) => [asc(users.name)], // Order alphabetically by name
        });
        return allUsers;
      },
      ['all-internal-users'], // A unique key for this cache entry
      { revalidate: 60 } // Cache for 60 seconds
    );

    const allUsers = await getCachedUsers();

    return apiSuccess(allUsers);
  } catch (error) {
    console.error('API Error [GET /api/users]:', error);
    return apiError('internal_error', 'Failed to fetch users', null, { status: 500 });
  }
}

// Optional: Add POST for creating users later if needed via API
// export async function POST(request: Request) { ... } 