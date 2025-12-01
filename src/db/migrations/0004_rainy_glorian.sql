CREATE TYPE "ticketing_prod"."financial_status_enum" AS ENUM('paid', 'partially_paid', 'unpaid', 'void');--> statement-breakpoint
CREATE TYPE "ticketing_prod"."interaction_channel_enum" AS ENUM('email', 'ticket', 'self_id_form', 'amazon_api', 'shopify_webhook', 'klaviyo', 'telephony');--> statement-breakpoint
CREATE TYPE "ticketing_prod"."interaction_direction_enum" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "ticketing_prod"."opportunity_stage_enum" AS ENUM('lead', 'quote_sent', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "ticketing_prod"."order_status_enum" AS ENUM('open', 'closed', 'cancelled', 'fulfilled', 'partial');--> statement-breakpoint
CREATE TYPE "ticketing_prod"."provider_enum" AS ENUM('shopify', 'qbo', 'amazon', 'manual', 'self_reported', 'klaviyo');--> statement-breakpoint
CREATE TABLE "ticketing_prod"."calls" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer,
	"contact_id" integer,
	"opportunity_id" integer,
	"ticket_id" integer,
	"provider" text NOT NULL,
	"provider_call_id" text,
	"direction" "ticketing_prod"."interaction_direction_enum" DEFAULT 'inbound' NOT NULL,
	"from_number" varchar(32) NOT NULL,
	"to_number" varchar(32) NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer,
	"recording_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_calls_provider_call" UNIQUE("provider","provider_call_id")
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255),
	"phone" varchar(32),
	"role" varchar(64),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."customer_identities" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"provider" "ticketing_prod"."provider_enum" NOT NULL,
	"external_id" varchar(255),
	"email" varchar(255),
	"phone" varchar(32),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"primary_email" varchar(255),
	"primary_phone" varchar(32),
	"first_name" varchar(255),
	"last_name" varchar(255),
	"company" varchar(255),
	"is_vip" boolean DEFAULT false NOT NULL,
	"credit_risk_level" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."interactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"ticket_id" integer,
	"comment_id" integer,
	"channel" "ticketing_prod"."interaction_channel_enum" NOT NULL,
	"direction" "ticketing_prod"."interaction_direction_enum" DEFAULT 'inbound' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."opportunities" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"contact_id" integer,
	"title" varchar(255) NOT NULL,
	"description" text,
	"stage" "ticketing_prod"."opportunity_stage_enum" DEFAULT 'lead' NOT NULL,
	"source" varchar(64),
	"division" varchar(32),
	"estimated_value" numeric(14, 2),
	"currency" varchar(8) DEFAULT 'USD' NOT NULL,
	"owner_id" text,
	"shopify_draft_order_id" text,
	"qbo_estimate_id" text,
	"closed_at" timestamp with time zone,
	"lost_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"sku" varchar(255),
	"product_id_external" varchar(255),
	"title" varchar(512),
	"quantity" integer DEFAULT 1 NOT NULL,
	"price" numeric(14, 2) DEFAULT '0' NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"provider" "ticketing_prod"."provider_enum" NOT NULL,
	"external_id" varchar(255),
	"order_number" varchar(255),
	"status" "ticketing_prod"."order_status_enum" DEFAULT 'open' NOT NULL,
	"financial_status" "ticketing_prod"."financial_status_enum" DEFAULT 'unpaid' NOT NULL,
	"currency" varchar(8) DEFAULT 'USD' NOT NULL,
	"total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"placed_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"late_flag" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_orders_provider_external" UNIQUE("provider","external_id")
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."outbox_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"topic" varchar(128) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."qbo_customer_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"qbo_customer_id" text NOT NULL,
	"terms" text,
	"balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" varchar(8) DEFAULT 'USD' NOT NULL,
	"last_invoice_date" timestamp with time zone,
	"last_payment_date" timestamp with time zone,
	"snapshot_taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_qbo_snapshots_customer" UNIQUE("customer_id")
);
--> statement-breakpoint
DROP INDEX "ticketing_prod"."idx_tickets_status";--> statement-breakpoint
DROP INDEX "ticketing_prod"."idx_tickets_assignee_id";--> statement-breakpoint
DROP INDEX "ticketing_prod"."idx_tickets_reporter_id";--> statement-breakpoint
ALTER TABLE "ticketing_prod"."tickets" ADD COLUMN "customer_id" integer;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."tickets" ADD COLUMN "opportunity_id" integer;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."calls" ADD CONSTRAINT "calls_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "ticketing_prod"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."calls" ADD CONSTRAINT "calls_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "ticketing_prod"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."calls" ADD CONSTRAINT "calls_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "ticketing_prod"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."calls" ADD CONSTRAINT "calls_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "ticketing_prod"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."contacts" ADD CONSTRAINT "contacts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "ticketing_prod"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."customer_identities" ADD CONSTRAINT "customer_identities_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "ticketing_prod"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."interactions" ADD CONSTRAINT "interactions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "ticketing_prod"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."interactions" ADD CONSTRAINT "interactions_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "ticketing_prod"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."interactions" ADD CONSTRAINT "interactions_comment_id_ticket_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "ticketing_prod"."ticket_comments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."opportunities" ADD CONSTRAINT "opportunities_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "ticketing_prod"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."opportunities" ADD CONSTRAINT "opportunities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "ticketing_prod"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."opportunities" ADD CONSTRAINT "opportunities_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "ticketing_prod"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "ticketing_prod"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "ticketing_prod"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."qbo_customer_snapshots" ADD CONSTRAINT "qbo_customer_snapshots_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "ticketing_prod"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_calls_customer" ON "ticketing_prod"."calls" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_calls_contact" ON "ticketing_prod"."calls" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "idx_calls_provider_call" ON "ticketing_prod"."calls" USING btree ("provider_call_id");--> statement-breakpoint
CREATE INDEX "idx_calls_started_at" ON "ticketing_prod"."calls" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_contacts_customer" ON "ticketing_prod"."contacts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_contacts_email" ON "ticketing_prod"."contacts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_customer_identities_provider_ext" ON "ticketing_prod"."customer_identities" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "idx_customer_identities_email" ON "ticketing_prod"."customer_identities" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_customer_identities_phone" ON "ticketing_prod"."customer_identities" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "idx_customer_identities_customer" ON "ticketing_prod"."customer_identities" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_customers_primary_email" ON "ticketing_prod"."customers" USING btree ("primary_email");--> statement-breakpoint
CREATE INDEX "idx_customers_primary_phone" ON "ticketing_prod"."customers" USING btree ("primary_phone");--> statement-breakpoint
CREATE INDEX "idx_customers_company" ON "ticketing_prod"."customers" USING btree ("company");--> statement-breakpoint
CREATE INDEX "idx_interactions_customer" ON "ticketing_prod"."interactions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_interactions_ticket" ON "ticketing_prod"."interactions" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "idx_interactions_channel" ON "ticketing_prod"."interactions" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "idx_opportunities_customer" ON "ticketing_prod"."opportunities" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_opportunities_owner" ON "ticketing_prod"."opportunities" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_opportunities_stage" ON "ticketing_prod"."opportunities" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "idx_opportunities_division" ON "ticketing_prod"."opportunities" USING btree ("division");--> statement-breakpoint
CREATE INDEX "idx_order_items_order" ON "ticketing_prod"."order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_orders_provider_ext" ON "ticketing_prod"."orders" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "idx_orders_order_number" ON "ticketing_prod"."orders" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "idx_orders_customer" ON "ticketing_prod"."orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_orders_late_flag" ON "ticketing_prod"."orders" USING btree ("late_flag");--> statement-breakpoint
CREATE INDEX "idx_outbox_status" ON "ticketing_prod"."outbox_jobs" USING btree ("status","next_run_at");--> statement-breakpoint
CREATE INDEX "idx_outbox_topic" ON "ticketing_prod"."outbox_jobs" USING btree ("topic");--> statement-breakpoint
CREATE INDEX "idx_qbo_snapshots_qbo_id" ON "ticketing_prod"."qbo_customer_snapshots" USING btree ("qbo_customer_id");--> statement-breakpoint
ALTER TABLE "ticketing_prod"."tickets" ADD CONSTRAINT "tickets_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "ticketing_prod"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."tickets" ADD CONSTRAINT "tickets_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "ticketing_prod"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_tickets_customer" ON "ticketing_prod"."tickets" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_tickets_sender_email" ON "ticketing_prod"."tickets" USING btree ("sender_email");--> statement-breakpoint
CREATE INDEX "idx_tickets_opportunity_id" ON "ticketing_prod"."tickets" USING btree ("opportunity_id");