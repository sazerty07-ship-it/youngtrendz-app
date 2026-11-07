CREATE TABLE IF NOT EXISTS tracked_products (
  id TEXT PRIMARY KEY,
  ean TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  country_code TEXT NOT NULL DEFAULT 'BE',
  created_at TEXT NOT NULL,
  last_checked_at TEXT
);
CREATE TABLE IF NOT EXISTS tracker_snapshots (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  best_price REAL,
  best_retailer_id TEXT,
  best_retailer_name TEXT,
  offer_count INTEGER NOT NULL DEFAULT 0,
  offers_json TEXT NOT NULL DEFAULT '[]',
  FOREIGN KEY(product_id) REFERENCES tracked_products(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tracker_snapshots_product_time ON tracker_snapshots(product_id, observed_at DESC);