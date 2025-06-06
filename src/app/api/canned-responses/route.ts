import { NextResponse } from 'next/server';
import { db, cannedResponses } from '@/lib/db';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';

export async function GET(request: Request) {
  try {
    // Basic authentication check
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    return NextResponse.json(responses);
  } catch (error) {
    console.error("API Error [GET /api/canned-responses]:", error);
    return NextResponse.json({ error: 'Failed to fetch canned responses' }, { status: 500 });
  }
}

// TODO: Add POST/PUT/DELETE later for managing canned responses via an admin UI 