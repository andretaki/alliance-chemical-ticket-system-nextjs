CREATE TYPE "ticketing_prod"."churn_risk_enum" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "ticketing_prod"."rag_ingestion_status_enum" AS ENUM('pending', 'processing', 'completed', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "ticketing_prod"."rag_sensitivity" AS ENUM('public', 'internal');--> statement-breakpoint
CREATE TYPE "ticketing_prod"."rag_source_type" AS ENUM('ticket', 'ticket_comment', 'email', 'interaction', 'qbo_invoice', 'qbo_estimate', 'qbo_customer', 'shopify_order', 'shopify_customer', 'amazon_customer', 'amazon_order', 'amazon_shipment', 'shipstation_customer', 'shipstation_shipment', 'order');--> statement-breakpoint
CREATE TYPE "ticketing_prod"."shipment_provider_enum" AS ENUM('shipstation', 'amazon_fba', 'amazon_mfn', 'shopify_fulfillment');--> statement-breakpoint
ALTER TYPE "ticketing_prod"."provider_enum" ADD VALUE 'shipstation';--> statement-breakpoint
CREATE TABLE "ticketing_prod"."amazon_sp_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"marketplace_id" text NOT NULL,
	"refresh_token" text NOT NULL,
	"access_token" text,
	"access_token_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "amazon_sp_tokens_marketplace_id_unique" UNIQUE("marketplace_id")
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."crm_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer,
	"opportunity_id" integer,
	"ticket_id" integer,
	"type" varchar(64) NOT NULL,
	"reason" varchar(64),
	"status" varchar(32) DEFAULT 'open' NOT NULL,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"assigned_to_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."customer_scores" (
	"customer_id" integer PRIMARY KEY NOT NULL,
	"r_score" integer NOT NULL,
	"f_score" integer NOT NULL,
	"m_score" integer NOT NULL,
	"ltv" numeric(14, 2) DEFAULT '0' NOT NULL,
	"last_12_months_revenue" numeric(14, 2) DEFAULT '0' NOT NULL,
	"health_score" integer NOT NULL,
	"churn_risk" "ticketing_prod"."churn_risk_enum" NOT NULL,
	"previous_churn_risk" "ticketing_prod"."churn_risk_enum",
	"last_calculated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."qbo_estimates" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer,
	"qbo_estimate_id" text NOT NULL,
	"qbo_customer_id" text,
	"doc_number" text,
	"status" text,
	"total_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" varchar(8) DEFAULT 'USD' NOT NULL,
	"txn_date" timestamp with time zone,
	"expiration_date" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qbo_estimates_qbo_estimate_id_unique" UNIQUE("qbo_estimate_id")
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."qbo_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer,
	"qbo_invoice_id" text NOT NULL,
	"qbo_customer_id" text,
	"doc_number" text,
	"status" text,
	"total_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" varchar(8) DEFAULT 'USD' NOT NULL,
	"txn_date" timestamp with time zone,
	"due_date" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qbo_invoices_qbo_invoice_id_unique" UNIQUE("qbo_invoice_id")
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."rag_chunks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_id" uuid NOT NULL,
	"chunk_index" smallint NOT NULL,
	"chunk_count" smallint NOT NULL,
	"chunk_text" text NOT NULL,
	"chunk_hash" text NOT NULL,
	"token_count" smallint,
	"embedding" vector(1536),
	"embedded_at" timestamp with time zone,
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', chunk_text)) STORED,
	CONSTRAINT "uq_rag_chunks_source_index" UNIQUE("source_id","chunk_index"),
	CONSTRAINT "chk_rag_chunks_index" CHECK ("ticketing_prod"."rag_chunks"."chunk_index" >= 0 AND "ticketing_prod"."rag_chunks"."chunk_index" < "ticketing_prod"."rag_chunks"."chunk_count")
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."rag_ingestion_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_type" "ticketing_prod"."rag_source_type" NOT NULL,
	"source_id" text NOT NULL,
	"operation" varchar(16) NOT NULL,
	"status" "ticketing_prod"."rag_ingestion_status_enum" DEFAULT 'pending' NOT NULL,
	"priority" smallint DEFAULT 0 NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"max_attempts" smallint DEFAULT 5 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"error_message" text,
	"error_code" text,
	"result_source_id" uuid,
	"result_chunk_count" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."rag_query_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"query_text" text NOT NULL,
	"query_intent" text,
	"customer_id" integer,
	"ticket_id" integer,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"top_k" integer DEFAULT 10 NOT NULL,
	"returned_count" integer DEFAULT 0 NOT NULL,
	"confidence" text,
	"fts_latency_ms" integer,
	"vector_latency_ms" integer,
	"structured_latency_ms" integer,
	"rerank_latency_ms" integer,
	"debug_info" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."rag_sources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_type" "ticketing_prod"."rag_source_type" NOT NULL,
	"source_id" text NOT NULL,
	"source_uri" text NOT NULL,
	"customer_id" integer,
	"ticket_id" integer,
	"thread_id" text,
	"parent_id" uuid,
	"sensitivity" "ticketing_prod"."rag_sensitivity" DEFAULT 'public' NOT NULL,
	"owner_user_id" text,
	"title" text,
	"content_text" text NOT NULL,
	"content_hash" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_created_at" timestamp with time zone NOT NULL,
	"source_updated_at" timestamp with time zone,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reindexed_at" timestamp with time zone,
	CONSTRAINT "uq_rag_sources_source" UNIQUE("source_type","source_id")
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."rag_sync_cursors" (
	"source_type" "ticketing_prod"."rag_source_type" PRIMARY KEY NOT NULL,
	"cursor_value" jsonb,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"items_synced" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."shipments" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer,
	"order_id" integer,
	"provider" "ticketing_prod"."shipment_provider_enum" NOT NULL,
	"external_id" text NOT NULL,
	"order_number" text,
	"tracking_number" text,
	"carrier_code" text,
	"service_code" text,
	"ship_date" timestamp with time zone,
	"estimated_delivery_date" timestamp with time zone,
	"actual_delivery_date" timestamp with time zone,
	"status" text,
	"cost" numeric(12, 2),
	"weight" numeric(10, 3),
	"weight_unit" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_shipments_provider_external" UNIQUE("provider","external_id")
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."shipstation_shipments" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer,
	"shipstation_shipment_id" bigint NOT NULL,
	"shipstation_order_id" bigint,
	"order_number" text,
	"tracking_number" text,
	"carrier_code" text,
	"service_code" text,
	"ship_date" timestamp with time zone,
	"delivery_date" timestamp with time zone,
	"status" text,
	"cost" numeric(12, 2),
	"weight" numeric(10, 3),
	"weight_unit" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"order_id" integer,
	CONSTRAINT "shipstation_shipments_shipstation_shipment_id_unique" UNIQUE("shipstation_shipment_id")
);
--> statement-breakpoint
ALTER TABLE "ticketing_prod"."opportunities" ADD COLUMN "stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."opportunities" ADD COLUMN "expected_close_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."crm_tasks" ADD CONSTRAINT "crm_tasks_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "ticketing_prod"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."crm_tasks" ADD CONSTRAINT "crm_tasks_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "ticketing_prod"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."crm_tasks" ADD CONSTRAINT "crm_tasks_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "ticketing_prod"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."crm_tasks" ADD CONSTRAINT "crm_tasks_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "ticketing_prod"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."customer_scores" ADD CONSTRAINT "customer_scores_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "ticketing_prod"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."qbo_estimates" ADD CONSTRAINT "qbo_estimates_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "ticketing_prod"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."qbo_invoices" ADD CONSTRAINT "qbo_invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "ticketing_prod"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."rag_chunks" ADD CONSTRAINT "rag_chunks_source_id_rag_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "ticketing_prod"."rag_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."rag_ingestion_jobs" ADD CONSTRAINT "rag_ingestion_jobs_result_source_id_rag_sources_id_fk" FOREIGN KEY ("result_source_id") REFERENCES "ticketing_prod"."rag_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."rag_sources" ADD CONSTRAINT "rag_sources_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "ticketing_prod"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."rag_sources" ADD CONSTRAINT "rag_sources_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "ticketing_prod"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."rag_sources" ADD CONSTRAINT "rag_sources_parent_id_rag_sources_id_fk" FOREIGN KEY ("parent_id") REFERENCES "ticketing_prod"."rag_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."rag_sources" ADD CONSTRAINT "rag_sources_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "ticketing_prod"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."shipments" ADD CONSTRAINT "shipments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "ticketing_prod"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "ticketing_prod"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."shipstation_shipments" ADD CONSTRAINT "shipstation_shipments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "ticketing_prod"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."shipstation_shipments" ADD CONSTRAINT "shipstation_shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "ticketing_prod"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_crm_tasks_customer" ON "ticketing_prod"."crm_tasks" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_crm_tasks_status" ON "ticketing_prod"."crm_tasks" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "idx_crm_tasks_assignee" ON "ticketing_prod"."crm_tasks" USING btree ("assigned_to_id");--> statement-breakpoint
CREATE INDEX "idx_customer_scores_health" ON "ticketing_prod"."customer_scores" USING btree ("health_score");--> statement-breakpoint
CREATE INDEX "idx_customer_scores_churn_risk" ON "ticketing_prod"."customer_scores" USING btree ("churn_risk");--> statement-breakpoint
CREATE INDEX "idx_qbo_estimates_id" ON "ticketing_prod"."qbo_estimates" USING btree ("qbo_estimate_id");--> statement-breakpoint
CREATE INDEX "idx_qbo_estimates_doc_number" ON "ticketing_prod"."qbo_estimates" USING btree ("doc_number");--> statement-breakpoint
CREATE INDEX "idx_qbo_estimates_customer" ON "ticketing_prod"."qbo_estimates" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_qbo_estimates_qbo_customer" ON "ticketing_prod"."qbo_estimates" USING btree ("qbo_customer_id");--> statement-breakpoint
CREATE INDEX "idx_qbo_invoices_id" ON "ticketing_prod"."qbo_invoices" USING btree ("qbo_invoice_id");--> statement-breakpoint
CREATE INDEX "idx_qbo_invoices_doc_number" ON "ticketing_prod"."qbo_invoices" USING btree ("doc_number");--> statement-breakpoint
CREATE INDEX "idx_qbo_invoices_customer" ON "ticketing_prod"."qbo_invoices" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_qbo_invoices_qbo_customer" ON "ticketing_prod"."qbo_invoices" USING btree ("qbo_customer_id");--> statement-breakpoint
CREATE INDEX "idx_rag_chunks_source" ON "ticketing_prod"."rag_chunks" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "idx_rag_chunks_hash" ON "ticketing_prod"."rag_chunks" USING btree ("chunk_hash");--> statement-breakpoint
CREATE INDEX "idx_rag_jobs_status" ON "ticketing_prod"."rag_ingestion_jobs" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX "idx_rag_jobs_source" ON "ticketing_prod"."rag_ingestion_jobs" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "idx_rag_sources_customer" ON "ticketing_prod"."rag_sources" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_rag_sources_ticket" ON "ticketing_prod"."rag_sources" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "idx_rag_sources_thread" ON "ticketing_prod"."rag_sources" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "idx_rag_sources_source_type" ON "ticketing_prod"."rag_sources" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX "idx_rag_sources_type_created" ON "ticketing_prod"."rag_sources" USING btree ("source_type","source_created_at");--> statement-breakpoint
CREATE INDEX "idx_shipments_customer" ON "ticketing_prod"."shipments" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_shipments_order" ON "ticketing_prod"."shipments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_shipments_order_number" ON "ticketing_prod"."shipments" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "idx_shipments_tracking" ON "ticketing_prod"."shipments" USING btree ("tracking_number");--> statement-breakpoint
CREATE INDEX "idx_shipments_provider" ON "ticketing_prod"."shipments" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "idx_shipments_status" ON "ticketing_prod"."shipments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_shipments_ship_date" ON "ticketing_prod"."shipments" USING btree ("ship_date");--> statement-breakpoint
CREATE INDEX "idx_shipments_updated_at" ON "ticketing_prod"."shipments" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_shipstation_shipments_order_number" ON "ticketing_prod"."shipstation_shipments" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "idx_shipstation_shipments_tracking" ON "ticketing_prod"."shipstation_shipments" USING btree ("tracking_number");--> statement-breakpoint
CREATE INDEX "idx_shipstation_shipments_customer" ON "ticketing_prod"."shipstation_shipments" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_shipstation_shipments_order_id" ON "ticketing_prod"."shipstation_shipments" USING btree ("shipstation_order_id");--> statement-breakpoint
CREATE INDEX "idx_shipstation_shipments_order_fk" ON "ticketing_prod"."shipstation_shipments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_opportunities_stage_changed" ON "ticketing_prod"."opportunities" USING btree ("stage_changed_at");