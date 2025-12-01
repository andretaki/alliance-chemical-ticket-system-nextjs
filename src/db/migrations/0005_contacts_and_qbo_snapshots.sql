-- Contacts table for multiple customer contacts
CREATE TABLE IF NOT EXISTS ticketing_prod.contacts (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES ticketing_prod.customers(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(32),
    role VARCHAR(64),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_customer ON ticketing_prod.contacts(customer_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON ticketing_prod.contacts(email);

-- QBO AR snapshot storage
CREATE TABLE IF NOT EXISTS ticketing_prod.qbo_customer_snapshots (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES ticketing_prod.customers(id) ON DELETE CASCADE,
    qbo_customer_id TEXT NOT NULL,
    terms TEXT,
    balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    currency VARCHAR(8) NOT NULL DEFAULT 'USD',
    last_invoice_date TIMESTAMPTZ,
    last_payment_date TIMESTAMPTZ,
    snapshot_taken_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_qbo_snapshots_customer UNIQUE (customer_id)
);

CREATE INDEX IF NOT EXISTS idx_qbo_snapshots_qbo_id ON ticketing_prod.qbo_customer_snapshots(qbo_customer_id);

-- Ensure Shopify/other order imports are idempotent
ALTER TABLE ticketing_prod.orders
    ADD CONSTRAINT uq_orders_provider_external UNIQUE (provider, external_id);
