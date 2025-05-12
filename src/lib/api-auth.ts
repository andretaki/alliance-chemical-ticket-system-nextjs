import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { NextResponse } from 'next/server';

/**
 * Helper function to handle authentication for API routes
 * This provides a consistent way to check if a user is authenticated
 * and handle errors gracefully.
 */
export async function getAuthenticatedSession() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return { 
        authenticated: false, 
        session: null,
        error: null 
      };
    }
    
    return { 
      authenticated: true, 
      session,
      error: null 
    };
  } catch (error) {
    console.error('Error getting session:', error);
    return { 
      authenticated: false, 
      session: null,
      error 
    };
  }
}

/**
 * Helper function to create a standardized API response for authentication errors
 */
export function createAuthErrorResponse(message = 'Unauthorized. Please sign in.') {
  return NextResponse.json(
    { error: 'Unauthorized', message },
    { status: 401 }
  );
}

/**
 * Helper function that implements a development-only fallback for API routes
 * In development, this returns fake data instead of 401 errors
 * In production, it will return a proper 401 error
 */
export function createDevFallbackResponse(fallbackData: any, message = 'Using development fallback data. Please sign in for real data.') {
  const isDev = process.env.NODE_ENV === 'development';
  
  if (isDev) {
    console.warn('AUTH BYPASS: Returning fallback data for unauthenticated request in development');
    return NextResponse.json(fallbackData);
  } else {
    return createAuthErrorResponse(message);
  }
} 