import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/lib/db";
import { 
  users, 
  accounts, 
  sessions, 
  verificationTokens,
  userRoleEnum,
  userApprovalStatusEnum 
} from "@/db/schema";
import bcrypt from "bcryptjs";
import "../types/auth"; // Import the type extensions

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      account: accounts,
      session: sessions,
      verification: verificationTokens,
    },
  }),
  
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Set to true if you want email verification
    async sendResetPassword(data) {
      // TODO: Implement password reset email sending
      console.log("Password reset requested for:", data.email);
    },
  },
  
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "user",
        input: false, // Don't accept from user input
      },
      approvalStatus: {
        type: "string", 
        defaultValue: "pending",
        input: false, // Don't accept from user input
      },
      ticketingRole: {
        type: "string",
        required: false,
      },
      isExternal: {
        type: "boolean",
        defaultValue: false,
        input: false, // Don't accept from user input
      },
    },
  },
  
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  
  plugins: [
    {
      id: "custom-approval",
      hooks: {
        after: [
          {
            matcher(context: any) {
              return context.type === "credential" && context.method === "signIn";
            },
            handler: async (ctx: any) => {
              // Check approval status after sign-in
              const user = ctx.user;
              if (user?.approvalStatus !== "approved") {
                console.log(`Login attempt for user ${user?.email} with status ${user?.approvalStatus}. Access denied.`);
                
                if (user?.approvalStatus === "pending") {
                  throw new Error("ACCOUNT_PENDING_APPROVAL");
                } else if (user?.approvalStatus === "rejected") {
                  throw new Error("ACCOUNT_REJECTED");
                }
                throw new Error("ACCOUNT_NOT_APPROVED");
              }
            },
          },
        ],
        before: [
          {
            matcher(context: any) {
              return context.type === "credential" && context.method === "signUp";
            },
            handler: async (ctx: any) => {
              // Hash password before saving
              if (ctx.body?.password) {
                ctx.body.password = await bcrypt.hash(ctx.body.password, 12);
              }
              
              // Set default values (these are now handled by additionalFields defaults)
              // but we can ensure they're set here too
              if (!ctx.body?.role) ctx.body.role = "user";
              if (!ctx.body?.approvalStatus) ctx.body.approvalStatus = "pending";
              if (ctx.body?.isExternal === undefined) ctx.body.isExternal = false;
            },
          },
        ],
      },
    },
  ],
  
  trustedOrigins: [
    process.env.NEXTAUTH_URL || "http://localhost:3001",
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001",
  ],
  
  secret: process.env.NEXTAUTH_SECRET || process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.NEXTAUTH_URL || process.env.BETTER_AUTH_URL || "http://localhost:3001",
}); 