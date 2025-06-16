ALTER TABLE "ticketing_prod"."tickets" ADD COLUMN "merged_into_ticket_id" integer;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticketing_prod"."tickets" ADD CONSTRAINT "tickets_merged_into_ticket_id_tickets_id_fk" FOREIGN KEY ("merged_into_ticket_id") REFERENCES "ticketing_prod"."tickets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX "idx_tickets_merged_into" ON "ticketing_prod"."tickets" ("merged_into_ticket_id"); 