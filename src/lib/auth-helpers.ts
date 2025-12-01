/**
 * Better Auth Helper Functions
 * Provides compatibility layer for migration from NextAuth to Better Auth
 */

// BYPASS AUTH - commented out for development
// import { auth } from '@/lib/auth';
// import { headers } from 'next/headers';

// Mock session for development
const mockSession = {
  user: {
    id: 'dev-user',
    name: 'Dev User',
    email: 'dev@localhost',
    role: 'admin',
    approvalStatus: 'approved',
  },
  session: {
    id: 'dev-session',
    userId: 'dev-user',
  }
};

/**
 * Get the current server session (replacement for getServerSession)
 * BYPASS AUTH - returns mock session
 */
export async function getServerSession() {
  // Always return mock session for development
  return { session: mockSession, error: null };

  // Original implementation:
  // try {
  //   const headersList = await headers();
  //   const session = await auth.api.getSession({
  //     headers: headersList
  //   });
  //   return { session, error: null };
  // } catch (error) {
  //   console.error('Error getting server session:', error);
  //   return { session: null, error: error instanceof Error ? error.message : 'Authentication error' };
  // }
}

/**
 * Check if user is authenticated and has required role
 */
export async function requireAuth(requiredRole?: 'admin' | 'manager' | 'user') {
  const { session, error } = await getServerSession();
  
  if (error) {
    return { error, status: 401 };
  }
  
  if (!session?.user) {
    return { error: 'Unauthorized', status: 401 };
  }
  
  if (requiredRole && session.user.role !== requiredRole && session.user.role !== 'admin') {
    return { error: 'Forbidden', status: 403 };
  }
  
  return { session };
}

/**
 * Check if user has admin privileges
 */
export async function requireAdmin() {
  const { session, error } = await getServerSession();
  
  if (error) {
    return { error, status: 401 };
  }
  
  if (!session?.user || session.user.role !== 'admin') {
    return { error: 'Admin access required', status: 403 };
  }
  
  return { session };
}

/**
 * Check if user has manager or admin privileges
 */
export async function requireManager() {
  const { session, error } = await getServerSession();
  
  if (error) {
    return { error, status: 401 };
  }
  
  if (!session?.user || (session.user.role !== 'admin' && session.user.role !== 'manager')) {
    return { error: 'Manager access required', status: 403 };
  }
  
  return { session };
}

/**
 * Get user ID from session
 */
export async function getUserId(): Promise<string | null> {
  const { session } = await getServerSession();
  return session?.user?.id || null;
}

/**
 * Get user role from session
 */
export async function getUserRole(): Promise<'admin' | 'manager' | 'user' | null> {
  const { session } = await getServerSession();
  return (session?.user?.role as 'admin' | 'manager' | 'user') || null;
}