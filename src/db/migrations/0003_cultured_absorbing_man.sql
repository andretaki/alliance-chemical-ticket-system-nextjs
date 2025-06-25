CREATE TYPE "ticketing_prod"."ai_suggested_action_enum" AS ENUM('CREATE_QUOTE', 'CHECK_ORDER_STATUS', 'DOCUMENT_REQUEST', 'GENERAL_REPLY');--> statement-breakpoint
CREATE TABLE "ticketing_prod"."business_hours" (
	"id" serial PRIMARY KEY NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "business_hours_day_of_week_unique" UNIQUE("day_of_week")
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."sla_policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"priority" "ticketing_prod"."ticket_priority_enum" NOT NULL,
	"first_response_minutes" integer NOT NULL,
	"resolution_minutes" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sla_policies_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "ticketing_prod"."tickets" ADD COLUMN "merged_into_ticket_id" integer;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."tickets" ADD COLUMN "sla_policy_id" integer;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."tickets" ADD COLUMN "first_response_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."tickets" ADD COLUMN "first_response_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."tickets" ADD COLUMN "resolution_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."tickets" ADD COLUMN "sla_breached" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."tickets" ADD COLUMN "sla_notified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."tickets" ADD COLUMN "ai_suggested_action" "ticketing_prod"."ai_suggested_action_enum";--> statement-breakpoint
ALTER TABLE "ticketing_prod"."tickets" ADD CONSTRAINT "tickets_merged_into_ticket_id_tickets_id_fk" FOREIGN KEY ("merged_into_ticket_id") REFERENCES "ticketing_prod"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."tickets" ADD CONSTRAINT "tickets_sla_policy_id_sla_policies_id_fk" FOREIGN KEY ("sla_policy_id") REFERENCES "ticketing_prod"."sla_policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_tickets_merged_into" ON "ticketing_prod"."tickets" USING btree ("merged_into_ticket_id");--> statement-breakpoint
CREATE INDEX "idx_tickets_sla_policy_id" ON "ticketing_prod"."tickets" USING btree ("sla_policy_id");--> statement-breakpoint
CREATE INDEX "idx_tickets_sla_status" ON "ticketing_prod"."tickets" USING btree ("status","sla_breached");