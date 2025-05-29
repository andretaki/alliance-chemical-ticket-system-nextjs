// src/lib/authOptions.ts
import CredentialsProvider from 'next-auth/providers/credentials';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '@/lib/db';
import {
    users,
    accounts,
    sessions,
    verificationTokens,
    userRoleEnum
} from '@/db/schema';
import bcrypt from 'bcryptjs';
import type { AdapterUser } from '@auth/core/adapters';
import type { Session, User, Account, Profile, AuthOptions, SessionStrategy } from 'next-auth';
import type { JWT } from 'next-auth/jwt';

// This is the shape of the user object your `authorize` callback will return
interface AuthorizeReturnUser {
  id: string; // From Drizzle schema, users.id is text (UUID)
  email: string | null;
  name: string | null;
  role: typeof userRoleEnum.enumValues[number];
  image: string | null;
}

// Augment NextAuth types
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: typeof userRoleEnum.enumValues[number];
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
  interface User {
    id: string;
    role: typeof userRoleEnum.enumValues[number];
    name?: string | null;
    email?: string | null;
    image?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: typeof userRoleEnum.enumValues[number];
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
  }),
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials.password) return null;
        
        const userFromDb = await db.query.users.findFirst({
          where: (dbUsers, { eq }) => eq(dbUsers.email, credentials.email),
        });

        if (!userFromDb || !userFromDb.password) return null;
        
        const isValidPassword = await bcrypt.compare(credentials.password, userFromDb.password);
        if (!isValidPassword) return null;

        return {
          id: userFromDb.id,
          email: userFromDb.email,
          name: userFromDb.name ?? null,
          role: userFromDb.role,
          image: userFromDb.image ?? null,
        };
      }
    })
  ],
  session: {
    strategy: 'jwt' as SessionStrategy,
  },
  callbacks: {
    async jwt({ token, user }: { token: JWT; user?: User }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.name = user.name ?? token.name;
        token.email = user.email ?? token.email;
        token.picture = user.image ?? token.picture;
      }
      return token;
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
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