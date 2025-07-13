import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth-helpers';

export async function GET(request: NextRequest) {
  try {
    // Get session information
    const { session, error } = await getServerSession();
    
    if (error) {
      return NextResponse.json({ error }, { status: 401 });
    }
    
    // Check environment variables (without exposing sensitive values)
    const envCheck = {
      NEXTAUTH_URL: !!process.env.NEXTAUTH_URL ? process.env.NEXTAUTH_URL : 'NOT SET',
      NEXTAUTH_SECRET: !!process.env.NEXTAUTH_SECRET ? 'SET' : 'NOT SET',
      DATABASE_URL: !!process.env.DATABASE_URL ? 'SET' : 'NOT SET',
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_URL: process.env.VERCEL_URL || 'NOT SET',
    };

    // Test database connection
    let dbConnection = 'UNKNOWN';
    try {
      const { db } = await import('@/lib/db');
      await db.query.users.findFirst();
      dbConnection = 'CONNECTED';
    } catch (error: any) {
      dbConnection = `ERROR: ${error.message}`;
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      session: session ? {
        userId: session.user?.id,
        userEmail: session.user?.email,
        userRole: session.user?.role,
        isAuthenticated: true
      } : {
        isAuthenticated: false
      },
      environment: envCheck,
      database: dbConnection,
      host: request.headers.get('host'),
      userAgent: request.headers.get('user-agent'),
      protocol: request.headers.get('x-forwarded-proto') || 'http',
    });

  } catch (error: any) {
    return NextResponse.json({
      error: 'Debug endpoint failed',
      message: error.message,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
} 