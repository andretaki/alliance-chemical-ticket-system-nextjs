/**
 * Authentication utilities for role-based access control
 * Temporary solution until Better Auth session types are properly resolved
 */

import { db } from '@/lib/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth-helpers';

export interface UserWithRole {
  id: string;
  email: string;
  name?: string;
  role: 'admin' | 'manager' | 'user';
  approvalStatus: 'pending' | 'approved' | 'rejected';
  ticketingRole?: string;
  isExternal: boolean;
}

/**
 * Get current user with full role information from database
 */
export async function getCurrentUserWithRole(): Promise<UserWithRole | null> {
  try {
    const { session, error } = await getServerSession();
    
    if (error || !session?.user?.id) {
      return null;
    }

    const user = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        approvalStatus: users.approvalStatus,
        ticketingRole: users.ticketingRole,
        isExternal: users.isExternal,
      })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    if (!user.length) {
      return null;
    }

    return user[0] as UserWithRole;
  } catch (error) {
    console.error('Error fetching user with role:', error);
    return null;
  }
}

/**
 * Check if current user has admin privileges
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const user = await getCurrentUserWithRole();
  return user?.role === 'admin' && user?.approvalStatus === 'approved';
}

/**
 * Check if current user has manager or admin privileges
 */
export async function isCurrentUserManager(): Promise<boolean> {
  const user = await getCurrentUserWithRole();
  return (user?.role === 'manager' || user?.role === 'admin') && user?.approvalStatus === 'approved';
}

/**
 * Require authentication and specific role
 */
export async function requireRole(requiredRole: 'admin' | 'manager' | 'user') {
  const user = await getCurrentUserWithRole();
  
  if (!user) {
    return { error: 'Unauthorized', status: 401 };
  }
  
  if (user.approvalStatus !== 'approved') {
    return { error: 'Account not approved', status: 403 };
  }
  
  // Admin can access everything
  if (user.role === 'admin') {
    return { user };
  }
  
  // Manager can access manager and user level
  if (requiredRole === 'manager' && user.role === 'manager') {
    return { user };
  }
  
  // User level access
  if (requiredRole === 'user') {
    return { user };
  }
  
  return { error: 'Insufficient privileges', status: 403 };
}

/**
 * Require admin access
 */
export async function requireAdmin() {
  return requireRole('admin');
}

/**
 * Require manager or admin access
 */
export async function requireManager() {
  return requireRole('manager');
}