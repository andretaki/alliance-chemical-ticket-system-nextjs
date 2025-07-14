import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth-helpers';

/**
 * Debug endpoint to check what's actually in the session
 */
export async function GET(request: NextRequest) {
  try {
    const { session, error } = await getServerSession();
    
    return NextResponse.json({
      success: true,
      data: {
        session,
        error,
        sessionKeys: session ? Object.keys(session) : null,
        userKeys: session?.user ? Object.keys(session.user) : null,
        user: session?.user,
      }
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Session debug failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}