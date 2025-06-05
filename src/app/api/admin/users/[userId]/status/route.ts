import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
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
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { userId } = await params;
    if (!userId) {
      return NextResponse.json({ message: 'User ID is required' }, { status: 400 });
    }

    const body = await request.json() as StatusUpdateRequestBody;
    const newStatus = body.status;

    if (!newStatus || !userApprovalStatusEnum.enumValues.includes(newStatus)) {
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
      .set({ approvalStatus: newStatus, updatedAt: new Date() })
      .where(eq(users.id, userId));

    // Optionally, send an email to the user upon approval/rejection here
    // For example, if newStatus === 'approved':
    // await sendEmail(userExists.email, 'Account Approved', '<p>Your account has been approved.</p>');

    return NextResponse.json({ message: `User status updated to ${newStatus}` });

  } catch (error) {
    console.error('Error updating user status:', error);
    if (error instanceof SyntaxError) { // JSON parsing error
        return NextResponse.json({ message: 'Invalid request body' }, { status: 400 });
    }
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
} 