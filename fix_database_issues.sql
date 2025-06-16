-- ============================================================================
-- Database Fixes for Alliance Chemical Ticket System
-- ============================================================================

-- 1. CHECK FOR DUPLICATES IN agent_product_variants (variant_id_shopify)
-- ============================================================================
SELECT 
    variant_id_shopify, 
    COUNT(*) as duplicate_count,
    array_agg(id) as ids
FROM ticketing_prod.agent_product_variants 
WHERE variant_id_shopify IS NOT NULL
GROUP BY variant_id_shopify 
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- 2. CHECK FOR DUPLICATES IN agent_product_variants (sku)
-- ============================================================================
SELECT 
    sku, 
    COUNT(*) as duplicate_count,
    array_agg(id) as ids
FROM ticketing_prod.agent_product_variants 
WHERE sku IS NOT NULL AND sku <> ''
GROUP BY sku 
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- 3. CHECK FOR DUPLICATES IN agent_products (product_id_shopify)
-- ============================================================================
SELECT 
    product_id_shopify, 
    COUNT(*) as duplicate_count,
    array_agg(id) as ids
FROM ticketing_prod.agent_products 
WHERE product_id_shopify IS NOT NULL
GROUP BY product_id_shopify 
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- ============================================================================
-- MANUAL CLEANUP SECTION
-- ============================================================================
-- If duplicates are found above, you'll need to manually decide which records to keep
-- and delete the others. Example cleanup commands (DO NOT RUN without checking first):

-- Example: Delete duplicate variant records (keeping the first one)
-- DELETE FROM ticketing_prod.agent_product_variants 
-- WHERE id IN (
--     SELECT id FROM (
--         SELECT id, ROW_NUMBER() OVER (PARTITION BY variant_id_shopify ORDER BY created_at ASC) as rn
--         FROM ticketing_prod.agent_product_variants 
--         WHERE variant_id_shopify IS NOT NULL
--     ) t WHERE rn > 1
-- );

-- Example: Delete duplicate SKU records (keeping the most recent one)
-- DELETE FROM ticketing_prod.agent_product_variants 
-- WHERE id IN (
--     SELECT id FROM (
--         SELECT id, ROW_NUMBER() OVER (PARTITION BY sku ORDER BY updated_at DESC) as rn
--         FROM ticketing_prod.agent_product_variants 
--         WHERE sku IS NOT NULL AND sku <> ''
--     ) t WHERE rn > 1
-- );

-- ============================================================================
-- 4. MIGRATE sendercompany TO sender_company IN tickets TABLE
-- ============================================================================

-- First, check how many records will be affected
SELECT 
    COUNT(*) as total_tickets,
    COUNT(CASE WHEN sendercompany IS NOT NULL AND sendercompany <> '' THEN 1 END) as has_sendercompany,
    COUNT(CASE WHEN sender_company IS NOT NULL AND sender_company <> '' THEN 1 END) as has_sender_company,
    COUNT(CASE WHEN sendercompany IS NOT NULL AND sendercompany <> '' 
               AND (sender_company IS NULL OR sender_company = '') THEN 1 END) as will_be_migrated
FROM ticketing_prod.tickets;

-- Migrate sendercompany to sender_company
UPDATE ticketing_prod.tickets 
SET sender_company = sendercompany,
    updated_at = NOW()
WHERE sendercompany IS NOT NULL 
  AND sendercompany <> '' 
  AND (sender_company IS NULL OR sender_company = '');

-- Verify the migration
SELECT 
    COUNT(*) as total_tickets,
    COUNT(CASE WHEN sendercompany IS NOT NULL AND sendercompany <> '' THEN 1 END) as has_sendercompany,
    COUNT(CASE WHEN sender_company IS NOT NULL AND sender_company <> '' THEN 1 END) as has_sender_company_after
FROM ticketing_prod.tickets;

-- ============================================================================
-- 5. OPTIONAL: CLEAN UP numeric_variant_id_shopify COLUMN
-- ============================================================================
-- If you're not using numeric_variant_id_shopify and want to remove it:
-- ALTER TABLE ticketing_prod.agent_product_variants DROP COLUMN IF EXISTS numeric_variant_id_shopify;

-- ============================================================================
-- 6. VERIFY DATA INTEGRITY AFTER CLEANUP
-- ============================================================================

-- Check for any remaining duplicates in critical unique constraints
SELECT 'variant_id_shopify duplicates' as check_type, COUNT(*) as count FROM (
    SELECT variant_id_shopify FROM ticketing_prod.agent_product_variants 
    WHERE variant_id_shopify IS NOT NULL
    GROUP BY variant_id_shopify HAVING COUNT(*) > 1
) t
UNION ALL
SELECT 'sku duplicates' as check_type, COUNT(*) as count FROM (
    SELECT sku FROM ticketing_prod.agent_product_variants 
    WHERE sku IS NOT NULL AND sku <> ''
    GROUP BY sku HAVING COUNT(*) > 1
) t
UNION ALL
SELECT 'product_id_shopify duplicates' as check_type, COUNT(*) as count FROM (
    SELECT product_id_shopify FROM ticketing_prod.agent_products 
    WHERE product_id_shopify IS NOT NULL
    GROUP BY product_id_shopify HAVING COUNT(*) > 1
) t;

-- Check tickets migration success
SELECT 
    'sendercompany not migrated' as check_type,
    COUNT(*) as count 
FROM ticketing_prod.tickets 
WHERE sendercompany IS NOT NULL 
  AND sendercompany <> '' 
  AND (sender_company IS NULL OR sender_company = '');

-- ============================================================================
-- NOTES:
-- 1. Run the CHECK queries first to see if you have duplicates
-- 2. If duplicates exist, manually review and delete them using similar patterns to the examples
-- 3. The sendercompany migration should be safe to run as it only updates when sender_company is empty
-- 4. Always backup your database before running cleanup operations
-- ============================================================================ 