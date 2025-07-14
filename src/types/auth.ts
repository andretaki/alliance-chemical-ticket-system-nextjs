import type { User, Session } from "better-auth";

declare module "better-auth" {
  interface User {
    role: 'admin' | 'manager' | 'user';
    approvalStatus: 'pending' | 'approved' | 'rejected';
    ticketingRole?: string | null;
    isExternal: boolean;
  }
  
  interface Session {
    user: User & {
      role: 'admin' | 'manager' | 'user';
      approvalStatus: 'pending' | 'approved' | 'rejected';
      ticketingRole?: string | null;
      isExternal: boolean;
    };
  }
}

export {};