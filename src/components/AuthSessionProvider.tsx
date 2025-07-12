'use client';

import React from 'react';

interface AuthSessionProviderProps {
  children: React.ReactNode;
}

export default function AuthSessionProvider({ children }: AuthSessionProviderProps) {
  // Better Auth doesn't require a provider wrapper like NextAuth
  // The client handles authentication state internally
  return <>{children}</>;
}
