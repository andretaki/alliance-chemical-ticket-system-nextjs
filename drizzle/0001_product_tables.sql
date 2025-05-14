-- Create product tables
CREATE TABLE agent_products (
    id SERIAL PRIMARY KEY,
    product_id_shopify BIGINT UNIQUE,
    name VARCHAR(512) NOT NULL,
    handle_shopify VARCHAR(512),
    description TEXT,
    primary_image_url TEXT,
    page_url TEXT,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE agent_product_variants (
    id SERIAL PRIMARY KEY,
    agent_product_id INTEGER NOT NULL REFERENCES agent_products(id) ON DELETE CASCADE,
    variant_id_shopify BIGINT UNIQUE,
    sku VARCHAR(100) NOT NULL UNIQUE,
    variant_title VARCHAR(512) NOT NULL,
    display_name VARCHAR(512),
    price DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD' NOT NULL,
    inventory_quantity INTEGER,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Optional: Price tier table for volume discounts
CREATE TABLE price_tiers (
    id SERIAL PRIMARY KEY,
    variant_id INTEGER NOT NULL REFERENCES agent_product_variants(id) ON DELETE CASCADE,
    min_quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    description VARCHAR(512),
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create indexes
CREATE INDEX idx_agent_products_shopify_id ON agent_products(product_id_shopify);
CREATE INDEX idx_agent_products_handle ON agent_products(handle_shopify);
CREATE INDEX idx_agent_product_variants_shopify_id ON agent_product_variants(variant_id_shopify);
CREATE INDEX idx_agent_product_variants_sku ON agent_product_variants(sku);
CREATE INDEX idx_price_tiers_variant_id ON price_tiers(variant_id);

-- Grant permissions
GRANT ALL ON agent_products TO app_user;
GRANT ALL ON agent_product_variants TO app_user;
GRANT ALL ON price_tiers TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user; 