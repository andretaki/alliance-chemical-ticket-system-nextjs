-- Add telephony channel to interaction enum
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'interaction_channel_enum' AND n.nspname = 'ticketing_prod'
    ) THEN
        CREATE TYPE ticketing_prod.interaction_channel_enum AS ENUM ('email', 'ticket', 'self_id_form', 'amazon_api', 'shopify_webhook', 'klaviyo', 'telephony');
    ELSE
        BEGIN
            ALTER TYPE ticketing_prod.interaction_channel_enum ADD VALUE IF NOT EXISTS 'telephony';
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END;
    END IF;
END$$;

-- Create calls table
CREATE TABLE IF NOT EXISTS ticketing_prod.calls (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES ticketing_prod.customers(id) ON DELETE SET NULL,
    contact_id INTEGER REFERENCES ticketing_prod.contacts(id) ON DELETE SET NULL,
    opportunity_id INTEGER REFERENCES ticketing_prod.opportunities(id) ON DELETE SET NULL,
    ticket_id INTEGER REFERENCES ticketing_prod.tickets(id) ON DELETE SET NULL,
    provider TEXT NOT NULL,
    provider_call_id TEXT,
    direction ticketing_prod.interaction_direction_enum NOT NULL DEFAULT 'inbound',
    from_number VARCHAR(32) NOT NULL,
    to_number VARCHAR(32) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    recording_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_calls_provider_call UNIQUE (provider, provider_call_id)
);

CREATE INDEX IF NOT EXISTS idx_calls_customer ON ticketing_prod.calls(customer_id);
CREATE INDEX IF NOT EXISTS idx_calls_contact ON ticketing_prod.calls(contact_id);
CREATE INDEX IF NOT EXISTS idx_calls_provider_call ON ticketing_prod.calls(provider_call_id);
CREATE INDEX IF NOT EXISTS idx_calls_started_at ON ticketing_prod.calls(started_at);
