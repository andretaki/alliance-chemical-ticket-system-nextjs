-- Full-Text Search Setup for Tickets Table
-- Run this migration manually after Drizzle migrations

-- 1. Add the search_vector column if it doesn't exist
ALTER TABLE ticketing_prod.tickets
ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- 2. Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_tickets_search_vector
ON ticketing_prod.tickets USING GIN (search_vector);

-- 3. Create function to update search vector
CREATE OR REPLACE FUNCTION ticketing_prod.tickets_search_vector_update()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.sender_name, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.sender_email, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.sender_company, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.order_number, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.tracking_number, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.ai_summary, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create trigger to auto-update search vector on insert/update
DROP TRIGGER IF EXISTS tickets_search_vector_trigger ON ticketing_prod.tickets;
CREATE TRIGGER tickets_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, description, sender_name, sender_email, sender_company, order_number, tracking_number, ai_summary
  ON ticketing_prod.tickets
  FOR EACH ROW
  EXECUTE FUNCTION ticketing_prod.tickets_search_vector_update();

-- 5. Backfill existing rows
UPDATE ticketing_prod.tickets SET
  search_vector =
    setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(sender_name, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(sender_email, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(sender_company, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(order_number, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(tracking_number, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(description, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(ai_summary, '')), 'D')
WHERE search_vector IS NULL;

-- Usage example:
-- SELECT * FROM ticketing_prod.tickets
-- WHERE search_vector @@ plainto_tsquery('english', 'search terms')
-- ORDER BY ts_rank(search_vector, plainto_tsquery('english', 'search terms')) DESC;
