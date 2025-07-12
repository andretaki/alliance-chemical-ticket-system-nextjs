import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

interface AppUser {
  id: string;
  role?: string;
  email?: string;
  approvalStatus?: string;
}

// Better Auth middleware implementation
export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Skip auth check for API routes and static files
  if (pathname.startsWith('/api/auth') || 
      pathname.startsWith('/_next') || 
      pathname.startsWith('/favicon.ico') ||
      pathname.startsWith('/assets') ||
      pathname.startsWith('/public')) {
    return NextResponse.next();
  }

  // Get session from Better Auth
  let user: AppUser | null = null;
  let isAuthenticated = false;

  try {
    // Better Auth session validation
    const sessionToken = req.cookies.get('better-auth.session_token')?.value;
    if (sessionToken) {
      // Validate session with Better Auth
      const session = await auth.api.getSession({
        headers: {
          'cookie': req.headers.get('cookie') || '',
        },
      });
      
      if (session?.user) {
        user = session.user as AppUser;
        isAuthenticated = true;
      }
    }
  } catch (error) {
    console.error('Session validation error:', error);
  }

  console.log(`Middleware running for ${pathname}, auth status: ${isAuthenticated}`);

  // Define protected routes that require authentication
  const protectedRoutes = [
    '/dashboard',
    '/tickets',
    '/admin',
    '/manage-users',
    '/profile'
  ];

  // Check if the current path is a protected route
  const isProtectedRoute = protectedRoutes.some(route => 
    pathname.startsWith(route)
  );

  // If it's a protected route and user is not authenticated, redirect to sign in
  if (isProtectedRoute && !isAuthenticated) {
    console.log(`Redirecting unauthenticated user from ${pathname} to sign-in`);
    const signInUrl = new URL('/auth/signin', req.url);
    signInUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Define admin routes
  const isAdminRoute = pathname.startsWith('/admin') || pathname.startsWith('/manage-users');

  // Define quote creator routes
  const isQuoteCreatorRoute = pathname.startsWith('/quotes/create');

  // Check admin access
  if (isAdminRoute && isAuthenticated && user) {
    if (user.role !== 'admin') {
      console.log(`RBAC: User '${user.email}' (role: '${user.role}') denied access to admin route '${pathname}'.`);
      const homeUrl = new URL('/', req.url);
      homeUrl.searchParams.set('error', 'AccessDenied');
      return NextResponse.redirect(homeUrl);
    }
  }

  // Check quote creator access
  if (isQuoteCreatorRoute && isAuthenticated && user) {
    const allowedRoles = ['admin', 'user'];
    if (!user.role || !allowedRoles.includes(user.role)) {
      console.log(`RBAC: User '${user.email}' (role: '${user.role}') denied access to quote creator route '${pathname}'.`);
      const homeUrl = new URL('/', req.url);
      homeUrl.searchParams.set('error', 'AccessDenied');
      return NextResponse.redirect(homeUrl);
    }
  }

  // If user is authenticated and tries to access auth pages, redirect to dashboard
  if (isAuthenticated && pathname.startsWith('/auth')) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|assets|public).*)',
  ],
}; 