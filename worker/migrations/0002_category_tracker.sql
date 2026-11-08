ALTER TABLE tracked_products ADD COLUMN source_category TEXT;
CREATE TABLE IF NOT EXISTS tracker_categories (
 id TEXT PRIMARY KEY,
 search_term TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL,
 last_synced_at TEXT,
 product_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tracked_products_source_category ON tracked_products(source_category);
