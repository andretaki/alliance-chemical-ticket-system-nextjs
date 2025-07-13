import type { User } from "better-auth";

declare module "better-auth" {
  interface User {
    role: 'admin' | 'manager' | 'user';
    approvalStatus: 'pending' | 'approved' | 'rejected';
    ticketingRole?: string | null;
    isExternal: boolean;
  }
}

export {};