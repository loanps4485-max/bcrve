CREATE TABLE IF NOT EXISTS promotions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  min_qty INTEGER NOT NULL,
  discount_percent REAL NOT NULL,
  starts_at TEXT,
  ends_at TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS promotion_products (
  promotion_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  PRIMARY KEY(promotion_id,product_id),
  FOREIGN KEY(promotion_id) REFERENCES promotions(id) ON DELETE CASCADE,
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
);
