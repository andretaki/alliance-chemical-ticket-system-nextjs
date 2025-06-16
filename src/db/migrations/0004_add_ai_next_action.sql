CREATE TYPE "ticketing_prod"."ai_suggested_action_enum" AS ENUM ('CREATE_QUOTE', 'CHECK_ORDER_STATUS', 'DOCUMENT_REQUEST', 'GENERAL_REPLY');
--> statement-breakpoint
ALTER TABLE "ticketing_prod"."tickets" ADD COLUMN "ai_suggested_action" "ticketing_prod"."ai_suggested_action_enum"; 