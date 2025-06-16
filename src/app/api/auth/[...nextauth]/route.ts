import NextAuth from 'next-auth';
import { authOptions } from '@/lib/authOptions';

// This is the handler directly returned by NextAuth configured with your options.
// In the App Router, Next.js expects to be able to use this handler for GET and POST.
const handler = NextAuth(authOptions);

// Directly export the handler for GET and POST requests.
// This is the standard pattern for NextAuth.js v4 in the App Router.
export { handler as GET, handler as POST }; 