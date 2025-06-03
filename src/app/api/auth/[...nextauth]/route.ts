import NextAuth from 'next-auth';
import { authOptions } from '@/lib/authOptions'; // Correct path to your options

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST }; 