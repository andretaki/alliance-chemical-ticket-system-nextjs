-- OAuth Token Locks table for distributed token refresh locking
-- Prevents race conditions when multiple instances try to refresh tokens simultaneously

CREATE TABLE "ticketing_prod"."oauth_token_locks" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" varchar(32) NOT NULL,
	"access_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_lock_until" timestamp with time zone,
	"lock_holder_id" text,
	"refresh_started_at" timestamp with time zone,
	"last_refreshed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_token_locks_provider_unique" UNIQUE("provider")
);--> statement-breakpoint
CREATE INDEX "idx_oauth_token_locks_provider" ON "ticketing_prod"."oauth_token_locks" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "idx_oauth_token_locks_expires" ON "ticketing_prod"."oauth_token_locks" USING btree ("access_token_expires_at");
