// src/lib/authOptions.ts
import CredentialsProvider from 'next-auth/providers/credentials';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '@/lib/db';
import {
    users,
    accounts,
    sessions,
    verificationTokens,
    userRoleEnum,
    userApprovalStatusEnum
} from '@/db/schema';
import bcrypt from 'bcryptjs';
import type { Adapter } from 'next-auth/adapters';
import type { Session, User, Account, Profile, AuthOptions, SessionStrategy } from 'next-auth';
import type { JWT } from 'next-auth/jwt';

// This is the shape of the user object your `authorize` callback will return
interface AuthorizeReturnUser {
  id: string; // From Drizzle schema, users.id is text (UUID)
  email: string | null;
  name: string | null;
  role: typeof userRoleEnum.enumValues[number];
  approvalStatus: typeof userApprovalStatusEnum.enumValues[number];
  image: string | null;
}

// Augment NextAuth types
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: typeof userRoleEnum.enumValues[number];
      approvalStatus: typeof userApprovalStatusEnum.enumValues[number];
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
  interface User {
    id: string;
    role: typeof userRoleEnum.enumValues[number];
    approvalStatus: typeof userApprovalStatusEnum.enumValues[number];
    name?: string | null;
    email?: string | null;
    image?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: typeof userRoleEnum.enumValues[number];
    approvalStatus: typeof userApprovalStatusEnum.enumValues[number];
    name?: string | null;
    email?: string | null;
    picture?: string | null;
  }
}

export const authOptions: AuthOptions = {
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }) as Adapter,
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, req): Promise<AuthorizeReturnUser | null> {
        if (!credentials?.email || !credentials.password) return null;
        
        const userFromDb = await db.query.users.findFirst({
          where: (dbUsers, { eq }) => eq(dbUsers.email, credentials.email),
        });

        if (!userFromDb || !userFromDb.password) return null;
        
        const isValidPassword = await bcrypt.compare(credentials.password, userFromDb.password);
        if (!isValidPassword) return null;

        // Check approval status and provide specific error handling
        if (userFromDb.approvalStatus !== 'approved') {
          console.log(`Login attempt for user ${userFromDb.email} with status ${userFromDb.approvalStatus}. Access denied.`);
          
          // Throw a specific error that we can catch in the UI
          if (userFromDb.approvalStatus === 'pending') {
            throw new Error('ACCOUNT_PENDING_APPROVAL');
          } else if (userFromDb.approvalStatus === 'rejected') {
            throw new Error('ACCOUNT_REJECTED');
          }
          return null;
        }

        return {
          id: userFromDb.id,
          email: userFromDb.email,
          name: userFromDb.name ?? null,
          role: userFromDb.role,
          approvalStatus: userFromDb.approvalStatus,
          image: userFromDb.image ?? null,
        };
      }
    })
  ],
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production' ? `__Secure-next-auth.session-token` : `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        // domain: process.env.NODE_ENV === 'production' ? '.yourproductiondomain.com' : undefined,
      },
    },
    // Example for callbackUrl cookie, if you want to customize it
    // callbackUrl: {
    //   name: process.env.NODE_ENV === 'production' ? `__Secure-next-auth.callback-url` : `next-auth.callback-url`,
    //   options: {
    //     httpOnly: true,
    //     sameSite: 'lax',
    //     path: '/',
    //     secure: process.env.NODE_ENV === 'production',
    //   }
    // },
    // Example for CSRF token cookie, if you want to customize it
    // csrfToken: {
    //   name: process.env.NODE_ENV === 'production' ? `__Host-next-auth.csrf-token` : `next-auth.csrf-token`,
    //   options: {
    //     httpOnly: true,
    //     sameSite: 'lax',
    //     path: '/',
    //     secure: process.env.NODE_ENV === 'production',
    //   }
    // }
  },
  session: {
    strategy: 'jwt' as SessionStrategy,
  },
  callbacks: {
    async jwt({ token, user, account, profile, isNewUser }) {
      if (user) {
        token.id = user.id;
        if ('role' in user) {
          token.role = user.role;
        }
        token.approvalStatus = (user as User).approvalStatus;
        token.name = user.name ?? token.name;
        token.email = user.email ?? token.email;
        token.picture = user.image ?? token.picture;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.approvalStatus = token.approvalStatus;
        session.user.name = token.name ?? undefined;
        session.user.email = token.email ?? undefined;
        session.user.image = token.picture ?? undefined;
      }
      return session;
    }
  },
  pages: {
    signIn: '/auth/signin',
  },
  secret: process.env.NEXTAUTH_SECRET,
};