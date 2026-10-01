CREATE TABLE IF NOT EXISTS promotion_products (
  promotion_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  PRIMARY KEY(promotion_id,product_id),
  FOREIGN KEY(promotion_id) REFERENCES promotions(id) ON DELETE CASCADE,
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
);
