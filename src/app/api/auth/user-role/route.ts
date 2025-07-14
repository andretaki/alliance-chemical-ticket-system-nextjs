import { NextResponse } from 'next/server';
import { getCurrentUserWithRole } from '@/lib/auth-utils';

export async function GET() {
  try {
    const user = await getCurrentUserWithRole();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    return NextResponse.json({
      role: user.role,
      approvalStatus: user.approvalStatus,
      isExternal: user.isExternal
    });
  } catch (error) {
    console.error('Error fetching user role:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}