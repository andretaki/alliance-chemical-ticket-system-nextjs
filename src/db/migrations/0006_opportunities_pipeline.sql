-- Enum for opportunity stage
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'opportunity_stage_enum') THEN
        CREATE TYPE ticketing_prod.opportunity_stage_enum AS ENUM ('lead', 'quote_sent', 'won', 'lost');
    END IF;
END$$;

-- Opportunities table
CREATE TABLE IF NOT EXISTS ticketing_prod.opportunities (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES ticketing_prod.customers(id) ON DELETE CASCADE,
    contact_id INTEGER REFERENCES ticketing_prod.contacts(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    stage ticketing_prod.opportunity_stage_enum NOT NULL DEFAULT 'lead',
    source VARCHAR(64),
    division VARCHAR(32),
    estimated_value NUMERIC(14,2),
    currency VARCHAR(8) NOT NULL DEFAULT 'USD',
    owner_id TEXT REFERENCES ticketing_prod.users(id) ON DELETE SET NULL,
    shopify_draft_order_id TEXT,
    qbo_estimate_id TEXT,
    closed_at TIMESTAMPTZ,
    lost_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opportunities_customer ON ticketing_prod.opportunities(customer_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_owner ON ticketing_prod.opportunities(owner_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON ticketing_prod.opportunities(stage);
CREATE INDEX IF NOT EXISTS idx_opportunities_division ON ticketing_prod.opportunities(division);

-- Optional link from tickets to opportunities
ALTER TABLE ticketing_prod.tickets
    ADD COLUMN IF NOT EXISTS opportunity_id INTEGER REFERENCES ticketing_prod.opportunities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_opportunity_id ON ticketing_prod.tickets(opportunity_id);
