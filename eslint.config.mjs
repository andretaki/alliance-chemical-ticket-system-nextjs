import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals"),

  // Domain layer boundary enforcement - CRITICAL for architecture
  // The domain layer must be pure: no DB, no network, no Next.js, no side effects
  {
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            // No Next.js imports in domain
            { group: ["next/*", "next"], message: "Domain must not import Next.js - use dependency injection" },
            // No database/ORM imports
            { group: ["drizzle-orm", "drizzle-orm/*", "postgres", "pg"], message: "Domain must not import database code - use repository ports" },
            // No infrastructure imports
            { group: ["@/infra/*", "@infra/*"], message: "Domain cannot import infrastructure - invert the dependency" },
            // No app/route imports
            { group: ["@/app/*"], message: "Domain cannot import from app layer" },
            // No services (they're imperative shell)
            { group: ["@/services/*"], message: "Domain cannot import services - services call domain, not vice versa" },
            // No external API clients
            { group: ["axios", "node-fetch", "openai", "@anthropic-ai/*"], message: "Domain must not make HTTP calls - use ports" },
            // No environment access
            { group: ["@/lib/env*"], message: "Domain must not access environment - inject configuration" },
          ],
          paths: [
            // No direct Date/Math.random - use Clock/IdGenerator ports
            { name: "crypto", message: "Use IdGenerator port instead of crypto.randomUUID()" },
          ],
        },
      ],
    },
  },

  // Application layer - can orchestrate but not access UI
  {
    files: ["src/application/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            // No React/UI in application layer
            { group: ["react", "react/*", "react-dom/*"], message: "Application layer must not import React" },
            // No Next.js UI features
            { group: ["next/navigation", "next/headers", "next/image"], message: "Application layer must not use Next.js UI features" },
            // No UI components
            { group: ["@/components/*"], message: "Application layer must not import UI components" },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
