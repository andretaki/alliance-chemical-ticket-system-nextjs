import { createAuthClient } from "better-auth/react";
import "../types/auth"; // Import the type extensions

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001",
});

export const { 
  signIn, 
  signUp, 
  signOut, 
  useSession,
  getSession,
  updateUser,
  resetPassword,
  forgetPassword,
} = authClient; 