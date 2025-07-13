import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth-helpers';
import { db, quarantinedEmails } from '@/lib/db';
import { eq, desc, sql } from 'drizzle-orm';

export async function GET() {
  try {
    const { session, error } = await getServerSession();

        if (error) {
      return NextResponse.json({ error }, { status: 401 });
    }
    if (!session || session.user.role !== 'admin') {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const emails = await db.query.quarantinedEmails.findMany({
      where: eq(quarantinedEmails.status, 'pending_review'),
      orderBy: (quarantinedEmails, { desc }) => [desc(quarantinedEmails.receivedAt)],
    });

    return NextResponse.json(emails);
  } catch (error) {
    console.error('Error fetching quarantined emails:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 