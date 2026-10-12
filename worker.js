import "./promotions.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  },
});

function htmlEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character]));
}

async function verifyTelegramInitData(initData, botToken, maxAge = 86400) {
  const fail = (message, status = 401) => ({
    user: null,
    error: { message, status },
  });
  if (!initData) return fail("Session Telegram absente. Ouvre la Mini App depuis le bot.");
  const token = String(botToken || "").trim();
  if (!token) return fail("Authentification serveur non configurée.", 503);

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) {
    return fail("Signature Telegram absente ou invalide.");
  }

  const now = Math.floor(Date.now() / 1000);
  const authDate = Number(params.get("auth_date") || 0);
  if (!Number.isInteger(authDate) || authDate <= 0) {
    return fail("Date de session Telegram invalide.");
  }
  const age = now - authDate;
  if (age > maxAge) {
    return fail("Session Telegram expirée. Ferme puis rouvre la Mini App.");
  }
  if (age < -300) return fail("Date de session Telegram invalide.");

  const userRaw = params.get("user");
  if (!userRaw) return fail("Identité Telegram absente de la session.");

  let user;
  try {
    user = JSON.parse(userRaw);
  } catch {
    return fail("Identité Telegram illisible.");
  }
  if (!user?.id) return fail("Identité Telegram invalide.");

  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([first], [second]) => first < second ? -1 : first > second ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const secret = await crypto.subtle.sign(
    "HMAC",
    secretKey,
    new TextEncoder().encode(token),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(dataCheckString),
  );
  const actual = [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const expected = hash.toLowerCase();
  let difference = actual.length ^ expected.length;
  for (let i = 0; i < Math.min(actual.length, expected.length); i++) {
    difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  }

  if (difference !== 0) {
    return fail("Signature Telegram refusée. La Mini App et le BOT_TOKEN doivent correspondre.");
  }
  return { user, error: null };
}

// Telegram notifications and order status messages
async function telegramSend(env, chatId, text, replyMarkup = null) {
  const botToken = String(env.BOT_TOKEN || "").trim();
  if (!botToken || !chatId) return false;
  try {
    const payload = { chat_id: chatId, text, parse_mode: "HTML" };
    if (replyMarkup) payload.reply_markup = replyMarkup;
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    let result = null;
    try { result = await response.json(); } catch {}
    const delivered = response.ok && result?.ok === true;
    if (!delivered) console.warn(`Telegram message was not delivered (HTTP ${response.status}).`);
    return delivered;
  } catch {
    console.warn("Telegram message request failed.");
    return false;
  }
}

const ORDER_STATUSES = {
  new: { label: "Nouvelle", emoji: "🆕" },
  preparing: { label: "En préparation", emoji: "👨‍🍳" },
  ready: { label: "Prête", emoji: "✅" },
  delivered: { label: "Remise", emoji: "📦" },
  cancelled: { label: "Annulée", emoji: "❌" }
};

function orderStatusLabel(status) {
  return ORDER_STATUSES[status] || { label: status || "Inconnu", emoji: "ℹ️" };
}

async function notifyClientStatus(env, order) {
  const status = orderStatusLabel(order.status);
  const text = order.status === "delivered"
    ? `📦 <b>Commande #${order.id} remise</b>\n\nMerci pour ta commande ❤️`
    : order.status === "cancelled"
      ? `❌ <b>Commande #${order.id} annulée</b>\n\nSi besoin, contacte-nous directement ici.`
      : `${status.emoji} <b>Commande #${order.id}</b>\n\nStatut : <b>${htmlEscape(status.label)}</b>`;
  return telegramSend(env, order.telegram_user_id, text);
}

const ADMIN_IDS = new Set(["6898182858", "5379947962"]);
const ORDER_STATUS_CODES = Object.keys(ORDER_STATUSES);

// Promotion queries and request authorization
async function getQuantityPromotions(env, includeScheduled = false) {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const sql = includeScheduled
    ? "SELECT id,min_qty,discount_percent,starts_at,ends_at,active FROM promotions ORDER BY min_qty DESC,id DESC"
    : [
      "SELECT id,min_qty,discount_percent,starts_at,ends_at,active",
      "FROM promotions WHERE active=1 AND (starts_at IS NULL OR starts_at<=?)",
      "AND (ends_at IS NULL OR ends_at>=?)",
      "ORDER BY min_qty DESC,discount_percent DESC,id DESC",
    ].join(" ");
  const query = env.DB.prepare(sql);
  const result = includeScheduled
    ? await query.all()
    : await query.bind(now, now).all();
  const promotions = result.results || [];
  if (!promotions.length) return [];

  const ids = promotions.map(p => Number(p.id));
  const placeholders = ids.map(() => "?").join(", ");
  const linkQuery = [
    "SELECT promotion_id,product_id",
    "FROM promotion_products",
    `WHERE promotion_id IN (${placeholders})`,
  ].join(" ");
  const { results: links } = await env.DB.prepare(linkQuery).bind(...ids).all();
  const productIdsByPromotion = new Map();

  for (const link of links || []) {
    const promotionId = Number(link.promotion_id);
    if (!productIdsByPromotion.has(promotionId)) {
      productIdsByPromotion.set(promotionId, []);
    }
    productIdsByPromotion.get(promotionId).push(Number(link.product_id));
  }

  return promotions.map((promotion) => ({
    ...promotion,
    product_ids: productIdsByPromotion.get(Number(promotion.id)) || [],
  }));
}

async function authenticateRequest(request, env) {
  const initData = request.headers.get("X-Telegram-Init-Data") || "";
  return verifyTelegramInitData(initData, env.BOT_TOKEN);
}

async function requireAdmin(request, env) {
  const auth = await authenticateRequest(request, env);
  if (!auth.user) return json({error:auth.error.message}, auth.error.status);
  if (!ADMIN_IDS.has(String(auth.user.id))) {
    return json({
      error: `Compte Telegram ${auth.user.id} non autorisé. Seuls les deux administrateurs configurés peuvent gérer les commandes.`,
    }, 403);
  }
  return auth.user;
}

function normalizePromotionInput(body, includeId = false) {
  const id = Number(body.id);
  const minQty = Number(body.min_qty);
  const discountPercent = Number(body.discount_percent);
  const productIds = Array.isArray(body.product_ids)
    ? [...new Set(body.product_ids.map(Number).filter(Number.isInteger))]
    : [];
  const startsAt = body.starts_at
    ? String(body.starts_at).trim().replace("T", " ")
    : null;
  const endsAt = body.ends_at
    ? String(body.ends_at).trim().replace("T", " ")
    : null;

  const invalidFields = (includeId && (!Number.isInteger(id) || id <= 0)) ||
    !Number.isInteger(minQty) ||
    minQty < 2 ||
    minQty > 999 ||
    !Number.isFinite(discountPercent) ||
    discountPercent <= 0 ||
    discountPercent > 100;
  if (invalidFields) {
    return {
      error: includeId ? "Promotion invalide." : "Quantité minimale ou remise invalide.",
      status: 400,
    };
  }
  if (startsAt && endsAt && startsAt > endsAt) {
    return { error: "La fin doit être après le début.", status: 400 };
  }
  if (!productIds.length) {
    return { error: "Sélectionne au moins un article.", status: 400 };
  }

  return {
    value: { id, minQty, discountPercent, productIds, startsAt, endsAt },
  };
}

async function handleApi(request, env, url) {
  const isAdminPath = url.pathname === "/api/admin" || url.pathname.startsWith("/api/admin/");
  if (isAdminPath) {
    const admin = await requireAdmin(request, env);
    if (admin instanceof Response) return admin;
  }
  if (!env.DB) return json({error:"D1 non configurée."}, 503);

  // Public catalog and customer orders
  if (url.pathname === "/api/products" && request.method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT id,name,sub,price,cat,active,sort_order,stock,low_stock_threshold FROM products WHERE active=1 ORDER BY sort_order,id"
    ).all();
    return json(results);
  }

  if (url.pathname === "/api/orders" && request.method === "POST") {
    const auth = await authenticateRequest(request, env);
    const user = auth.user;
    if (!user) return json({error:auth.error.message}, auth.error.status);

    let body;
    try { body = await request.json(); } catch { return json({error:"JSON invalide."},400); }
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return json({error:"Panier vide."},400);

    const ids = items.map((item) => Number(item.id)).filter(Number.isInteger);
    const placeholders = ids.map(() => "?").join(",");
    const { results: products } = await env.DB.prepare(
      `SELECT id,name,price,stock FROM products WHERE active=1 AND id IN (${placeholders})`
    ).bind(...ids).all();

    const byId = new Map(products.map((product) => [Number(product.id), product]));
    let subtotal = 0;
    const cleanItems = [];

    for (const item of items) {
      const product = byId.get(Number(item.id));
      const quantity = Math.max(1, Math.min(99, Number(item.qty) || 1));
      if (!product) return json({ error: "Produit indisponible." }, 400);
      if (Number(product.stock) < quantity) {
        return json({
          error: `${String(product.name)} : stock insuffisant (reste ${Number(product.stock)} unités).`,
        }, 409);
      }

      subtotal += Number(product.price) * quantity;
      cleanItems.push({
        id: product.id,
        name: product.name,
        price: Number(product.price),
        qty: quantity,
      });
    }

    subtotal = Math.round(subtotal * 100) / 100;
    const totalQuantity = cleanItems.reduce((sum, item) => sum + item.qty, 0);
    const promotions = await getQuantityPromotions(env);
    const promotionBreakdown = BCRVEPromotions.getPromotionBreakdown(cleanItems, promotions);
    const promotion = promotionBreakdown.promotion;
    const discountPercent = promotion ? Number(promotion.discount_percent) : 0;
    const discount = promotionBreakdown.discount;
    const total = Math.round((subtotal - discount) * 100) / 100;

    const stockUpdates = cleanItems.map((item) =>
      env.DB.prepare("UPDATE products SET stock=stock-? WHERE id=? AND stock>=?")
        .bind(item.qty, item.id, item.qty)
    );
    const stockResults = await env.DB.batch(stockUpdates);
    if (stockResults.some((result) => Number(result.meta?.changes || 0) !== 1)) {
      return json({
        error: "Stock insuffisant. Actualise le panier puis réessaie.",
      }, 409);
    }

    const order = await env.DB.prepare(
      `INSERT INTO orders (telegram_user_id,telegram_name,total,payment,status,created_at)
       VALUES (?,?,?,?,?,datetime('now'))`
    ).bind(
      String(user.id),
      [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "Client",
      total,
      "cash",
      "new",
    ).run();

    const orderId = order.meta.last_row_id;
    const stmt = env.DB.prepare(
      `INSERT INTO order_items (order_id,product_id,name,price,qty) VALUES (?,?,?,?,?)`
    );
    await env.DB.batch(cleanItems.map((item) =>
      stmt.bind(orderId, item.id, item.name, item.price, item.qty)
    ));

    const lines = cleanItems
      .map((item) => `• ${htmlEscape(item.name)} × ${item.qty}`)
      .join("\n");
    const client = [user.first_name, user.last_name].filter(Boolean).join(" ") ||
      user.username ||
      `ID ${user.id}`;
    const formattedSubtotal = subtotal.toFixed(2).replace(".", ",");
    const formattedDiscount = discount.toFixed(2).replace(".", ",");
    const formattedTotal = total.toFixed(2).replace(".", ",");
    const messageLines = [
      `🛍️ <b>Nouvelle commande BCRVE85 #${orderId}</b>`,
      "",
      `<b>Client :</b> ${htmlEscape(client)}`,
      `<b>ID Telegram :</b> <code>${htmlEscape(user.id)}</code>`,
      "",
      lines,
      "",
      `<b>Sous-total :</b> ${formattedSubtotal} €`,
    ];
    if (discount > 0) {
      messageLines.push(
        `<b>Remise quantité :</b> -${formattedDiscount} € (${discountPercent}%)`
      );
    }
    messageLines.push(
      `<b>Total :</b> ${formattedTotal} €`,
      "<b>Paiement :</b> espèces",
      "<b>Statut :</b> nouvelle",
    );
    const msg = messageLines.join("\n");
    const replyMarkup = {
      inline_keyboard: [[
        {
          text: "💬 Répondre au client",
          url: `tg://user?id=${encodeURIComponent(String(user.id))}`,
        },
      ]],
    };
    const notificationsDelivered = (await Promise.all(
      [...ADMIN_IDS].map((id) => telegramSend(env, id, msg, replyMarkup))
    )).filter(Boolean).length;

    const clientMessageLines = [
      `🛍️ <b>Commande #${orderId} enregistrée</b>`,
      "",
      "Statut : <b>🆕 Nouvelle</b>",
      `Sous-total : <b>${formattedSubtotal} €</b>`,
    ];
    if (discount > 0) {
      clientMessageLines.push(
        `Remise quantité : <b>-${formattedDiscount} € (${discountPercent}%)</b>`
      );
    }
    clientMessageLines.push(
      `Total : <b>${formattedTotal} €</b>`,
      "Paiement : espèces",
      "",
      "Tu recevras ici chaque changement de statut.",
    );
    const clientStatusDelivered = await telegramSend(
      env,
      String(user.id),
      clientMessageLines.join("\n"),
    );

    return json({
      ok: true,
      order_id: orderId,
      total,
      subtotal,
      discount,
      discount_percent: discountPercent,
      total_quantity: totalQuantity,
      notifications_delivered: notificationsDelivered,
      client_status_delivered: clientStatusDelivered,
    });
  }

  if (url.pathname === "/api/promotions" && request.method === "GET") {
    const promotions = await getQuantityPromotions(env);
    return json(promotions.map(p => ({
      min_qty: Number(p.min_qty),
      discount_percent: Number(p.discount_percent),
      product_ids: Array.isArray(p.product_ids) ? p.product_ids.map(Number) : []
    })));
  }

  if (url.pathname === "/api/orders" && request.method === "GET") {
    const auth = await authenticateRequest(request, env);
    if (!auth.user) return json({error:auth.error.message}, auth.error.status);
    const { results } = await env.DB.prepare(`
      SELECT id,total,payment,status,created_at
      FROM orders
      WHERE telegram_user_id=?
      ORDER BY id DESC
      LIMIT 20
    `).bind(String(auth.user.id)).all();
    return json(results);
  }

  if (url.pathname === "/api/admin/check" && request.method === "GET") {
    return json({ok:true});
  }

  // Order management
  if (url.pathname === "/api/admin/orders" && request.method === "GET") {
    const { results } = await env.DB.prepare(`
      SELECT o.id,o.telegram_user_id,o.telegram_name,o.total,o.payment,o.status,o.created_at,
             COALESCE(GROUP_CONCAT(oi.name || ' × ' || oi.qty, ' | '),'') items
      FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id
      GROUP BY o.id ORDER BY o.id DESC LIMIT 100
    `).all();
    return json(results);
  }

  if (url.pathname === "/api/admin/orders/reply" && request.method === "POST") {
    let body;
    try { body = await request.json(); } catch { return json({error:"JSON invalide."},400); }
    const id = Number(body.id);
    const message = String(body.message || "").trim();
    if (!Number.isInteger(id) || id <= 0) return json({error:"Commande invalide."},400);
    if (!message || message.length > 1500) return json({error:"Message requis (1500 caractères max)."},400);
    const order = await env.DB.prepare(
      "SELECT id,telegram_user_id FROM orders WHERE id=?"
    ).bind(id).first();
    if (!order) return json({error:"Commande introuvable."},404);
    const delivered = await telegramSend(
      env,
      order.telegram_user_id,
      `💬 <b>Message BCRVE85 · commande #${order.id}</b>\n\n${htmlEscape(message)}`
    );
    if (!delivered) return json({error:"Telegram n'a pas pu remettre le message au client."},502);
    return json({ok:true,delivered:true});
  }

  if (url.pathname === "/api/admin/orders/status" && request.method === "POST") {
    let body;
    try { body = await request.json(); } catch { return json({error:"JSON invalide."},400); }
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0 || !ORDER_STATUS_CODES.includes(body.status)) {
      return json({ error: "Commande ou statut invalide." }, 400);
    }

    const current = await env.DB.prepare(
      "SELECT id,telegram_user_id,status FROM orders WHERE id=?"
    ).bind(id).first();
    if (!current) return json({error:"Commande introuvable."},404);
    if (current.status === body.status) return json({ok:true,changed:false});

    await env.DB.prepare("UPDATE orders SET status=? WHERE id=?").bind(body.status,id).run();
    const updated = {...current,status:body.status};
    const notified = await notifyClientStatus(env, updated);
    return json({ok:true,changed:true,client_notified:notified});
  }

  // Promotion management
  if (url.pathname === "/api/admin/promotions" && request.method === "GET") {
    return json(await getQuantityPromotions(env, true));
  }

  if (url.pathname === "/api/admin/promotions" && request.method === "POST") {
    const body = await request.json();
    const input = normalizePromotionInput(body);
    if (input.error) return json({ error: input.error }, input.status);

    const { minQty, discountPercent, productIds, startsAt, endsAt } = input.value;
    const created = await env.DB.prepare(
      "INSERT INTO promotions (min_qty,discount_percent,starts_at,ends_at,active) VALUES (?,?,?,?,1)"
    ).bind(minQty, discountPercent, startsAt, endsAt).run();
    const promotionId = created.meta?.last_row_id;
    for (const productId of productIds) {
      await env.DB.prepare(
        "INSERT INTO promotion_products (promotion_id,product_id) VALUES (?,?)"
      ).bind(promotionId, productId).run();
    }
    return json({ ok: true });
  }

  if (url.pathname === "/api/admin/promotions" && request.method === "PUT") {
    const body = await request.json();
    const input = normalizePromotionInput(body, true);
    if (input.error) return json({ error: input.error }, input.status);

    const { id, minQty, discountPercent, productIds, startsAt, endsAt } = input.value;
    await env.DB.prepare(
      "UPDATE promotions SET min_qty=?,discount_percent=?,starts_at=?,ends_at=?,active=? WHERE id=?"
    ).bind(minQty, discountPercent, startsAt, endsAt, body.active ? 1 : 0, id).run();
    await env.DB.prepare(
      "DELETE FROM promotion_products WHERE promotion_id=?"
    ).bind(id).run();
    for (const productId of productIds) {
      await env.DB.prepare(
        "INSERT INTO promotion_products (promotion_id,product_id) VALUES (?,?)"
      ).bind(id, productId).run();
    }
    return json({ ok: true });
  }

  if (url.pathname === "/api/admin/promotions" && request.method === "DELETE") {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) return json({error:"Promotion invalide."},400);
    await env.DB.prepare("DELETE FROM promotion_products WHERE promotion_id=?").bind(id).run();
    await env.DB.prepare("DELETE FROM promotions WHERE id=?").bind(id).run();
    return json({ok:true});
  }

  if (url.pathname === "/api/admin/stock" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT id,name,stock,low_stock_threshold,active FROM products ORDER BY sort_order,id").all();
    return json(results);
  }

  if (url.pathname === "/api/admin/stock" && request.method === "PUT") {
    let body; try { body = await request.json(); } catch { return json({error:"JSON invalide."},400); }
    const id=Number(body.id), stock=Number(body.stock), threshold=Number(body.low_stock_threshold);
    if(!Number.isInteger(id)||id<=0||!Number.isInteger(stock)||stock<0||!Number.isInteger(threshold)||threshold<0) return json({error:"Stock invalide."},400);
    const result=await env.DB.prepare("UPDATE products SET stock=?,low_stock_threshold=? WHERE id=?").bind(stock,threshold,id).run();
    if(!result.meta?.changes) return json({error:"Produit introuvable."},404);
    return json({ok:true});
  }

  // Product management
  if (url.pathname === "/api/admin/products" && request.method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT id,name,sub,price,cat,active,sort_order FROM products ORDER BY sort_order,id"
    ).all();
    return json(results);
  }

  if (url.pathname === "/api/admin/products" && request.method === "POST") {
    const b = await request.json();
    if (!b.name || !Number.isFinite(Number(b.price)) || Number(b.price) < 0) return json({error:"Nom/prix requis."},400);
    await env.DB.prepare(
      "INSERT INTO products (name,sub,price,cat,active,sort_order) VALUES (?,?,?,?,1,?)"
    ).bind(String(b.name).trim(),String(b.sub||"").trim(),Number(b.price),String(b.cat||"selection"),Number(b.sort_order||99)).run();
    return json({ok:true});
  }

  if (url.pathname === "/api/admin/products" && request.method === "PUT") {
    const b = await request.json();
    if (!b.name || !Number.isFinite(Number(b.price)) || Number(b.price) < 0) return json({error:"Nom/prix requis."},400);
    await env.DB.prepare(
      "UPDATE products SET name=?,sub=?,price=?,cat=?,active=?,sort_order=? WHERE id=?"
    ).bind(String(b.name).trim(),String(b.sub||"").trim(),Number(b.price),String(b.cat||"selection"),b.active?1:0,Number(b.sort_order||99),Number(b.id)).run();
    return json({ok:true});
  }

  return json({error:"Not found"},404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env, url);
    return env.ASSETS.fetch(request);
  }
};

