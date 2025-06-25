-- Check if enum exists, create if not
DO $$ BEGIN
    CREATE TYPE "ticketing_prod"."ai_suggested_action_enum" AS ENUM ('CREATE_QUOTE', 'CHECK_ORDER_STATUS', 'DOCUMENT_REQUEST', 'GENERAL_REPLY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "ticketing_prod"."tickets" ADD COLUMN IF NOT EXISTS "ai_suggested_action" "ticketing_prod"."ai_suggested_action_enum"; 