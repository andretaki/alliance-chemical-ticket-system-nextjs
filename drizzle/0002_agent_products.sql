-- Create agent products tables
CREATE TABLE ticketing_prod.agent_products (
    id SERIAL PRIMARY KEY,
    product_id_shopify BIGINT NOT NULL UNIQUE,
    name VARCHAR(512) NOT NULL,
    handle_shopify VARCHAR(512),
    description TEXT,
    product_type VARCHAR(256),
    vendor VARCHAR(256),
    tags TEXT,
    status VARCHAR(50) DEFAULT 'active',
    page_url TEXT,
    primary_image_url TEXT,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

COMMENT ON COLUMN ticketing_prod.agent_products.status IS 'Shopify product status (e.g., active, archived, draft)';
COMMENT ON COLUMN ticketing_prod.agent_products.is_active IS 'Internal flag for agent system to consider this product active for quoting/operations';

CREATE TABLE ticketing_prod.agent_product_variants (
    id SERIAL PRIMARY KEY,
    agent_product_id BIGINT NOT NULL REFERENCES ticketing_prod.agent_products(id) ON DELETE CASCADE,
    variant_id_shopify BIGINT NOT NULL UNIQUE,
    sku VARCHAR(100) NOT NULL UNIQUE,
    variant_title VARCHAR(512) NOT NULL,
    display_name VARCHAR(512),
    price NUMERIC(12,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD' NOT NULL,
    inventory_quantity BIGINT,
    weight VARCHAR(50),
    weight_unit VARCHAR(20),
    taxable BOOLEAN DEFAULT TRUE,
    requires_shipping BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

COMMENT ON COLUMN ticketing_prod.agent_product_variants.variant_title IS 'Shopify variant title, often indicates packaging/unit of sale (e.g., "1 Quart / 1 Quart Can")';
COMMENT ON COLUMN ticketing_prod.agent_product_variants.display_name IS 'Full display name, usually Product Name - Variant Title';
COMMENT ON COLUMN ticketing_prod.agent_product_variants.weight IS 'Weight value from Shopify, stored as string for flexibility';
COMMENT ON COLUMN ticketing_prod.agent_product_variants.weight_unit IS 'Weight unit from Shopify (e.g., POUNDS, KG)';

-- Create indexes
CREATE INDEX idx_agent_products_shopify_id ON ticketing_prod.agent_products(product_id_shopify);
CREATE INDEX idx_agent_products_handle_shopify ON ticketing_prod.agent_products(handle_shopify);
CREATE INDEX idx_agent_products_name ON ticketing_prod.agent_products(name);
CREATE INDEX idx_agent_product_variants_shopify_id ON ticketing_prod.agent_product_variants(variant_id_shopify);
CREATE INDEX idx_agent_product_variants_sku ON ticketing_prod.agent_product_variants(sku);
CREATE INDEX idx_agent_product_variants_agent_product_id ON ticketing_prod.agent_product_variants(agent_product_id);

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION ticketing_prod.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER trigger_agent_products_updated_at
    BEFORE UPDATE ON ticketing_prod.agent_products
    FOR EACH ROW
    EXECUTE FUNCTION ticketing_prod.update_updated_at_column();

CREATE TRIGGER trigger_agent_product_variants_updated_at
    BEFORE UPDATE ON ticketing_prod.agent_product_variants
    FOR EACH ROW
    EXECUTE FUNCTION ticketing_prod.update_updated_at_column();

-- Grant permissions
GRANT SELECT, USAGE ON SEQUENCE ticketing_prod.agent_products_id_seq TO app_user;
GRANT SELECT, USAGE ON SEQUENCE ticketing_prod.agent_product_variants_id_seq TO app_user;
GRANT DELETE, INSERT, SELECT, UPDATE ON ticketing_prod.agent_products TO app_user;
GRANT DELETE, INSERT, SELECT, UPDATE ON ticketing_prod.agent_product_variants TO app_user; 