const test = require("node:test");
const assert = require("node:assert/strict");

require("../promotions.js");

const { getPromotionBreakdown } = globalThis.BCRVEPromotions;

test("selects the exact higher threshold when quantities are equal", () => {
  const result = getPromotionBreakdown(
    [{ id: 1, qty: 10, price: 12 }],
    [
      { min_qty: 5, discount_percent: 10 },
      { min_qty: 10, discount_percent: 10 },
    ],
  );

  assert.equal(result.promotion.min_qty, 10);
  assert.equal(result.discountQty, 10);
  assert.equal(result.discount, 12);
});

test("discounts only the promotion quantity when the cart exceeds its threshold", () => {
  const result = getPromotionBreakdown(
    [{ id: 1, qty: 7, price: 10 }],
    [{ min_qty: 5, discount_percent: 10 }],
  );

  assert.equal(result.discountQty, 5);
  assert.equal(result.discountedQtyById.get(1), 5);
  assert.equal(result.discount, 5);
});

test("counts and discounts only products targeted by a promotion", () => {
  const result = getPromotionBreakdown(
    [
      { id: 1, qty: 4, price: 20 },
      { id: 2, qty: 3, price: 10 },
    ],
    [{ min_qty: 2, discount_percent: 25, product_ids: [2] }],
  );

  assert.equal(result.quantity, 3);
  assert.equal(result.discountQty, 2);
  assert.equal(result.discountedQtyById.has(1), false);
  assert.equal(result.discountedQtyById.get(2), 2);
  assert.equal(result.discount, 5);
});

test("returns no discount when the eligible quantity is below the threshold", () => {
  const result = getPromotionBreakdown(
    [{ id: 1, qty: 4, price: 10 }],
    [{ min_qty: 5, discount_percent: 10 }],
  );

  assert.equal(result.promotion, null);
  assert.equal(result.discountQty, 0);
  assert.equal(result.discount, 0);
});
