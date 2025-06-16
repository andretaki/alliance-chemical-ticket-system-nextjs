CREATE SCHEMA "ticketing_prod";
--> statement-breakpoint
CREATE TYPE "ticketing_prod"."quarantine_status_enum" AS ENUM('pending_review', 'approved_ticket', 'approved_comment', 'rejected_spam', 'rejected_vendor', 'deleted');--> statement-breakpoint
CREATE TYPE "ticketing_prod"."ticket_priority_enum" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "ticketing_prod"."ticket_sentiment_enum" AS ENUM('positive', 'neutral', 'negative');--> statement-breakpoint
CREATE TYPE "ticketing_prod"."ticket_status_enum" AS ENUM('new', 'open', 'in_progress', 'pending_customer', 'closed');--> statement-breakpoint
CREATE TYPE "ticketing_prod"."ticket_type_ecommerce_enum" AS ENUM('Return', 'Shipping Issue', 'Order Issue', 'New Order', 'Credit Request', 'COA Request', 'COC Request', 'SDS Request', 'Quote Request', 'Purchase Order', 'General Inquiry', 'Test Entry', 'International Shipping');--> statement-breakpoint
CREATE TYPE "ticketing_prod"."ticketing_role_enum" AS ENUM('Admin', 'Project Manager', 'Developer', 'Submitter', 'Viewer', 'Other');--> statement-breakpoint
CREATE TYPE "ticketing_prod"."user_approval_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "ticketing_prod"."user_role" AS ENUM('admin', 'manager', 'user');--> statement-breakpoint
CREATE TABLE "ticketing_prod"."accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."agent_product_variants" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_product_id" bigint NOT NULL,
	"variant_id_shopify" bigint NOT NULL,
	"sku" varchar(100) NOT NULL,
	"variant_title" varchar(512) NOT NULL,
	"display_name" varchar(512),
	"price" numeric(12, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"inventory_quantity" bigint,
	"weight" varchar(50),
	"weight_unit" varchar(20),
	"taxable" boolean DEFAULT true,
	"requires_shipping" boolean DEFAULT true,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_product_variants_variant_id_shopify_unique" UNIQUE("variant_id_shopify"),
	CONSTRAINT "agent_product_variants_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."agent_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id_shopify" bigint NOT NULL,
	"name" varchar(512) NOT NULL,
	"handle_shopify" varchar(512),
	"description" text,
	"product_type" varchar(256),
	"vendor" varchar(256),
	"tags" text,
	"status" varchar(50) DEFAULT 'active',
	"page_url" text,
	"primary_image_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_products_product_id_shopify_unique" UNIQUE("product_id_shopify")
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."canned_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(100) NOT NULL,
	"content" text NOT NULL,
	"category" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by_id" text,
	CONSTRAINT "canned_responses_title_unique" UNIQUE("title")
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."credit_applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_name" varchar(255) NOT NULL,
	"contact_name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"address" text NOT NULL,
	"city" varchar(100) NOT NULL,
	"state" varchar(100) NOT NULL,
	"zip_code" varchar(20) NOT NULL,
	"tax_id" varchar(50),
	"credit_limit" numeric(10, 2),
	"bank_references" text,
	"trade_references" text,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"notes" text,
	"application_form" text
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."quarantined_emails" (
	"id" serial PRIMARY KEY NOT NULL,
	"original_graph_message_id" text NOT NULL,
	"internet_message_id" text NOT NULL,
	"sender_email" varchar(255) NOT NULL,
	"sender_name" varchar(255),
	"subject" varchar(500) NOT NULL,
	"body_preview" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"ai_classification" boolean NOT NULL,
	"ai_reason" text,
	"status" "ticketing_prod"."quarantine_status_enum" DEFAULT 'pending_review' NOT NULL,
	"reviewer_id" text,
	"reviewed_at" timestamp with time zone,
	"review_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quarantined_emails_original_graph_message_id_unique" UNIQUE("original_graph_message_id"),
	CONSTRAINT "quarantined_emails_internet_message_id_unique" UNIQUE("internet_message_id")
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."sds" (
	"id" double precision PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	""Metafield: custom.safety_data_sheet [file_reference]"" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"resource" text NOT NULL,
	"change_type" text NOT NULL,
	"notification_url" text NOT NULL,
	"expiration_datetime" timestamp with time zone NOT NULL,
	"client_state" text,
	"creator_id" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"renewal_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_subscription_id_unique" UNIQUE("subscription_id")
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."ticket_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"filename" varchar(255) NOT NULL,
	"original_filename" varchar(255) NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"storage_path" varchar(500) NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ticket_id" integer,
	"comment_id" integer,
	"uploader_id" text
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."ticket_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"comment_text" text NOT NULL,
	"commenter_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_from_customer" boolean DEFAULT false NOT NULL,
	"is_internal_note" boolean DEFAULT false NOT NULL,
	"is_outgoing_reply" boolean DEFAULT false NOT NULL,
	"external_message_id" varchar(255),
	CONSTRAINT "ticket_comments_external_message_id_unique" UNIQUE("external_message_id"),
	CONSTRAINT "ticket_comments_mailgun_message_id_key" UNIQUE("external_message_id")
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"status" "ticketing_prod"."ticket_status_enum" DEFAULT 'new' NOT NULL,
	"priority" "ticketing_prod"."ticket_priority_enum" DEFAULT 'medium' NOT NULL,
	"type" "ticketing_prod"."ticket_type_ecommerce_enum",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assignee_id" text,
	"reporter_id" text NOT NULL,
	"order_number" varchar(255),
	"tracking_number" varchar(255),
	"sender_email" varchar(255),
	"sender_name" varchar(255),
	"sender_phone" varchar(20),
	"external_message_id" varchar(255),
	"conversation_id" text,
	"sentiment" "ticketing_prod"."ticket_sentiment_enum",
	"ai_summary" text,
	"ai_suggested_assignee_id" text,
	"sender_company" varchar(255),
	"shipping_name" varchar(255),
	"shipping_company" varchar(255),
	"shipping_country" varchar(100),
	"shipping_address_line1" varchar(255),
	"shipping_address_line2" varchar(255),
	"shipping_address_line3" varchar(255),
	"shipping_city" varchar(100),
	"shipping_state" varchar(100),
	"shipping_postal_code" varchar(20),
	"shipping_phone" varchar(20),
	"shipping_email" varchar(255),
	CONSTRAINT "tickets_external_message_id_unique" UNIQUE("external_message_id"),
	CONSTRAINT "tickets_mailgun_message_id_key" UNIQUE("external_message_id")
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."user_signatures" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"signature" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password" varchar(255),
	"name" varchar(255),
	"email_verified" timestamp,
	"image" text,
	"created_at" timestamp DEFAULT now(),
	"role" "ticketing_prod"."user_role" DEFAULT 'user' NOT NULL,
	"approval_status" "ticketing_prod"."user_approval_status" DEFAULT 'pending' NOT NULL,
	"reset_token" varchar(255),
	"reset_token_expiry" timestamp,
	"ticketing_role" "ticketing_prod"."ticketing_role_enum",
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_external" boolean DEFAULT false NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "ticketing_prod"."verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "ticketing_prod"."accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "ticketing_prod"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."agent_product_variants" ADD CONSTRAINT "agent_product_variants_agent_product_id_agent_products_id_fk" FOREIGN KEY ("agent_product_id") REFERENCES "ticketing_prod"."agent_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."canned_responses" ADD CONSTRAINT "canned_responses_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "ticketing_prod"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."credit_applications" ADD CONSTRAINT "credit_applications_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "ticketing_prod"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."quarantined_emails" ADD CONSTRAINT "quarantined_emails_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "ticketing_prod"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "ticketing_prod"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."subscriptions" ADD CONSTRAINT "subscriptions_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "ticketing_prod"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."ticket_attachments" ADD CONSTRAINT "ticket_attachments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "ticketing_prod"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."ticket_attachments" ADD CONSTRAINT "ticket_attachments_comment_id_ticket_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "ticketing_prod"."ticket_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."ticket_attachments" ADD CONSTRAINT "ticket_attachments_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "ticketing_prod"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."ticket_comments" ADD CONSTRAINT "ticket_comments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "ticketing_prod"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."ticket_comments" ADD CONSTRAINT "ticket_comments_commenter_id_users_id_fk" FOREIGN KEY ("commenter_id") REFERENCES "ticketing_prod"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."tickets" ADD CONSTRAINT "tickets_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "ticketing_prod"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."tickets" ADD CONSTRAINT "tickets_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "ticketing_prod"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."tickets" ADD CONSTRAINT "tickets_ai_suggested_assignee_id_users_id_fk" FOREIGN KEY ("ai_suggested_assignee_id") REFERENCES "ticketing_prod"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketing_prod"."user_signatures" ADD CONSTRAINT "user_signatures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "ticketing_prod"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_credit_applications_email" ON "ticketing_prod"."credit_applications" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_credit_applications_status" ON "ticketing_prod"."credit_applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_credit_applications_submitted_at" ON "ticketing_prod"."credit_applications" USING btree ("submitted_at");--> statement-breakpoint
CREATE INDEX "idx_ticket_attachments_ticket_id" ON "ticketing_prod"."ticket_attachments" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "idx_ticket_attachments_comment_id" ON "ticketing_prod"."ticket_attachments" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "idx_attachment_uploader_id" ON "ticketing_prod"."ticket_attachments" USING btree ("uploader_id");--> statement-breakpoint
CREATE INDEX "idx_ticket_comments_ticket_id" ON "ticketing_prod"."ticket_comments" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "idx_ticket_comments_created_at" ON "ticketing_prod"."ticket_comments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_ticket_comments_commenter_id" ON "ticketing_prod"."ticket_comments" USING btree ("commenter_id");--> statement-breakpoint
CREATE INDEX "idx_tickets_conversation_id" ON "ticketing_prod"."tickets" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_tickets_status" ON "ticketing_prod"."tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_tickets_priority" ON "ticketing_prod"."tickets" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "idx_tickets_type" ON "ticketing_prod"."tickets" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_tickets_assignee_id" ON "ticketing_prod"."tickets" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "idx_tickets_reporter_id" ON "ticketing_prod"."tickets" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "idx_tickets_created_at" ON "ticketing_prod"."tickets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_tickets_updated_at" ON "ticketing_prod"."tickets" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_tickets_status_priority" ON "ticketing_prod"."tickets" USING btree ("status","priority");--> statement-breakpoint
CREATE INDEX "idx_tickets_assignee_status" ON "ticketing_prod"."tickets" USING btree ("assignee_id","status");--> statement-breakpoint
CREATE INDEX "idx_tickets_reporter_status" ON "ticketing_prod"."tickets" USING btree ("reporter_id","status");--> statement-breakpoint
CREATE INDEX "idx_users_role" ON "ticketing_prod"."users" USING btree ("role");