CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sub TEXT DEFAULT '',
  price REAL NOT NULL,
  cat TEXT NOT NULL DEFAULT 'selection',
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 99
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id TEXT NOT NULL,
  telegram_name TEXT NOT NULL,
  total REAL NOT NULL,
  payment TEXT NOT NULL DEFAULT 'cash',
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  qty INTEGER NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id)
);

INSERT OR IGNORE INTO products(id,name,sub,price,cat,active,sort_order) VALUES
(1,'Sélection Signature','Format découverte',8.90,'selection',1,1),
(2,'Édition Privée','Format premium',12.90,'edition',1,2),
(3,'Duo Essentiel','2 références',15.90,'packs',1,3),
(4,'Collection No. 04','Sélection du moment',10.90,'selection',1,4),
(5,'Édition Noire','Série limitée',14.90,'edition',1,5),
(6,'Pack Découverte','3 références',21.90,'packs',1,6);

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
