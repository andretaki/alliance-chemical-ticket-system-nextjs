import { NextResponse } from 'next/server';
import { db, users } from '@/lib/db';
import { eq, asc } from 'drizzle-orm';
import { unstable_cache } from 'next/cache'; // Import the cache helper

// GET /api/users - Fetches all users (for dropdowns, etc.)
export async function GET() {
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

    return NextResponse.json(allUsers);
  } catch (error) {
    console.error('API Error [GET /api/users]:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

// Optional: Add POST for creating users later if needed via API
// export async function POST(request: Request) { ... } 