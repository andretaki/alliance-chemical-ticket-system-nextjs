// BYPASS AUTH - Complete mock for development
// import { createAuthClient } from "better-auth/react";
// import "../types/auth";

// Mock user data structure
const mockUser = {
  id: 'dev-user',
  name: 'Dev User',
  email: 'dev@localhost',
  role: 'admin',
  approvalStatus: 'approved',
  image: null as string | null,
};

// Mock session data
const mockSession = {
  data: {
    user: mockUser,
    session: {
      id: 'dev-session',
      userId: 'dev-user',
    }
  },
  isPending: false,
  error: null,
};

// Mock auth functions that match Better Auth's API
export const useSession = () => mockSession;
export const getSession = async () => mockSession.data;

// signIn needs to have an 'email' method for email/password auth
export const signIn = {
  email: async (_options: { email: string; password: string; callbackURL?: string }) => ({
    error: null as { message: string } | null,
  }),
};

export const signUp = {
  email: async (_options: { email: string; password: string; name?: string }) => ({
    error: null as { message: string } | null,
  }),
};

// signOut takes no arguments in bypass mode
export const signOut = async (_options?: { fetchOptions?: { onSuccess?: () => void } }) => {
  _options?.fetchOptions?.onSuccess?.();
};

export const updateUser = async () => ({});
export const resetPassword = async () => ({});
export const forgetPassword = async () => ({});

export const authClient = {
  useSession,
  getSession,
  signIn,
  signUp,
  signOut,
  updateUser,
  resetPassword,
  forgetPassword,
};
