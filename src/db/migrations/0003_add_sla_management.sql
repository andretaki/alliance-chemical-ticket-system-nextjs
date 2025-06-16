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

CREATE TABLE "ticketing_prod"."business_hours" (
	"id" serial PRIMARY KEY NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "business_hours_day_of_week_unique" UNIQUE("day_of_week")
);

ALTER TABLE "ticketing_prod"."tickets" ADD COLUMN "sla_policy_id" integer;

ALTER TABLE "ticketing_prod"."tickets" ADD COLUMN "first_response_at" timestamp with time zone;

ALTER TABLE "ticketing_prod"."tickets" ADD COLUMN "first_response_due_at" timestamp with time zone;

ALTER TABLE "ticketing_prod"."tickets" ADD COLUMN "resolution_due_at" timestamp with time zone;

ALTER TABLE "ticketing_prod"."tickets" ADD COLUMN "sla_breached" boolean DEFAULT false NOT NULL;

ALTER TABLE "ticketing_prod"."tickets" ADD COLUMN "sla_notified" boolean DEFAULT false NOT NULL;

DO $$ BEGIN
 ALTER TABLE "ticketing_prod"."tickets" ADD CONSTRAINT "tickets_sla_policy_id_sla_policies_id_fk" FOREIGN KEY ("sla_policy_id") REFERENCES "ticketing_prod"."sla_policies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX "idx_tickets_sla_policy_id" ON "ticketing_prod"."tickets" ("sla_policy_id");

CREATE INDEX "idx_tickets_sla_status" ON "ticketing_prod"."tickets" ("status","sla_breached"); 