CREATE TABLE IF NOT EXISTS promotions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  min_qty INTEGER NOT NULL,
  discount_percent REAL NOT NULL,
  starts_at TEXT,
  ends_at TEXT,
  active INTEGER NOT NULL DEFAULT 1
);
