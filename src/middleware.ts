import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

// Simpler direct middleware implementation without withAuth wrapper
export async function middleware(req: NextRequest) {
  const token = await getToken({ req });
  const isAuthenticated = !!token;
  const pathname = req.nextUrl.pathname;

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

  // Check admin access
  if (isAdminRoute && isAuthenticated) {
    // @ts-ignore - token.role might not be explicitly typed
    if (token.role !== 'admin') {
      console.log(`RBAC: User '${token.email}' (role: '${token.role}') denied access to admin route '${pathname}'.`);
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