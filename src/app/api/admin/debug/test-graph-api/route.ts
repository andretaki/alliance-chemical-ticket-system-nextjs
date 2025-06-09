import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { graphClient, userEmail } from '@/lib/graphService';

export async function POST(request: Request) {
  try {
    // Security Check: Ensure only an admin can run this test
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    console.log(`[API Test] Attempting to fetch from shared mailbox: ${userEmail}`);

    // This is the same core logic that fails in the cron job.
    // We are testing if the application, with its current credentials on Vercel, can access this resource.
    const response = await graphClient
      .api(`/users/${userEmail}/messages`)
      .select('id,subject,from') // Select a few fields to test read access
      .top(1)
      .get();

    console.log('[API Test] Successfully fetched mail from Graph API.');

    return NextResponse.json({
      success: true,
      message: 'Successfully connected to Graph API and fetched mail.',
      mailbox: userEmail,
      data: response.value,
    });

  } catch (error: any) {
    console.error('[API Test] Graph API test failed:', error);

    // Provide detailed error information in the response for debugging
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to connect to Graph API or fetch mail.',
        mailbox: userEmail,
        error: {
          name: error.name,
          statusCode: error.statusCode,
          code: error.code, // e.g., 'ErrorItemNotFound' or 'Authorization_RequestDenied'
          message: error.message,
          body: error.body ? JSON.parse(error.body) : 'No body in error',
        },
      },
      { status: 500 }
    );
  }
} 