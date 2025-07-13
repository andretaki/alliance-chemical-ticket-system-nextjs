import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth-helpers';
import { db } from '@/lib/db';
import { users, userApprovalStatusEnum } from '@/db/schema';
import { eq } from 'drizzle-orm';

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
      return NextResponse.json({ error }, { status: 401 });
    }
    if (!session || !session.user || (session.user.role !== 'admin' && session.user.role !== 'manager')) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { userId } = await params;
    const { status } = await request.json();

    if (!userId || !status) {
      return NextResponse.json({ message: 'User ID and status are required' }, { status: 400 });
    }

    if (!userApprovalStatusEnum.enumValues.includes(status)) {
      return NextResponse.json({ message: 'Invalid status provided' }, { status: 400 });
    }

    // Check if user exists
    const userExists = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!userExists) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    await db.update(users)
      .set({ approvalStatus: status, updatedAt: new Date() })
      .where(eq(users.id, userId));

    // Optionally, send an email to the user upon approval/rejection here
    // For example, if approvalStatus === 'approved':
    // await sendEmail(userExists.email, 'Account Approved', '<p>Your account has been approved.</p>');

    return NextResponse.json({ message: `User status updated to ${status}` });

  } catch (error) {
    console.error('Error updating user status:', error);
    if (error instanceof SyntaxError) { // JSON parsing error
        return NextResponse.json({ message: 'Invalid request body' }, { status: 400 });
    }
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
} 