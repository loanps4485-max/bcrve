/**
 * Shared quantity-promotion calculations for the shop and the Worker.
 *
 * Items must contain an id, quantity and unit price. An empty product_ids
 * list means the promotion applies to every item.
 */
(function registerPromotionHelpers(root) {
  function getPromotionBreakdown(items, promotions) {
    const candidates = promotions
      .map(promotion => {
        const productIds = Array.isArray(promotion.product_ids)
          ? promotion.product_ids.map(Number)
          : [];
        const eligibleItems = productIds.length
          ? items.filter(item => productIds.includes(Number(item.id)))
          : items;

        return {
          promotion,
          items: eligibleItems,
          quantity: eligibleItems.reduce((sum, item) => sum + Number(item.qty), 0),
          subtotal: eligibleItems.reduce(
            (sum, item) => sum + Number(item.price) * Number(item.qty),
            0,
          ),
        };
      })
      .filter(
        candidate =>
          candidate.quantity >= Number(candidate.promotion.min_qty) &&
          Number(candidate.promotion.discount_percent) > 0 &&
          candidate.subtotal > 0,
      )
      .sort(
        (left, right) =>
          Number(right.promotion.min_qty) - Number(left.promotion.min_qty) ||
          Number(right.promotion.discount_percent) -
            Number(left.promotion.discount_percent),
      );

    const match = candidates[0] || null;
    if (!match) {
      return {
        promotion: null,
        quantity: 0,
        subtotal: 0,
        discountQty: 0,
        discountedQtyById: new Map(),
        discountBase: 0,
        discount: 0,
      };
    }

    let remainingDiscountQty = Math.min(
      Number(match.promotion.min_qty),
      match.quantity,
    );
    const discountedQtyById = new Map();

    for (const item of match.items) {
      const quantity = Math.min(Number(item.qty), remainingDiscountQty);
      if (quantity > 0) discountedQtyById.set(Number(item.id), quantity);
      remainingDiscountQty -= quantity;
      if (remainingDiscountQty <= 0) break;
    }

    const discountBase = match.items.reduce(
      (sum, item) =>
        sum +
        Number(item.price) * (discountedQtyById.get(Number(item.id)) || 0),
      0,
    );
    const discount =
      Math.round(discountBase * Number(match.promotion.discount_percent)) / 100;

    return {
      promotion: match.promotion,
      quantity: match.quantity,
      subtotal: match.subtotal,
      discountQty: Math.min(Number(match.promotion.min_qty), match.quantity),
      discountedQtyById,
      discountBase,
      discount,
    };
  }

  root.BCRVEPromotions = { getPromotionBreakdown };
})(globalThis);
