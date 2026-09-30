const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

function htmlEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function parseInitData(initData) {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const userRaw = params.get("user");
  if (!userRaw) return null;
  try { return JSON.parse(userRaw); } catch { return null; }
}

async function verifyTelegramInitData(initData, botToken, maxAge = 86400) {
  const fail = (message, status = 401) => ({ user: null, error: { message, status } });
  if (!initData) return fail("Session Telegram absente. Ouvre la Mini App depuis le bot.");
  botToken = String(botToken || "").trim();
  if (!botToken) return fail("Authentification serveur non configurée.", 503);

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) return fail("Signature Telegram absente ou invalide.");

  const now = Math.floor(Date.now() / 1000);
  const authDate = Number(params.get("auth_date") || 0);
  if (!Number.isInteger(authDate) || authDate <= 0) return fail("Date de session Telegram invalide.");
  const age = now - authDate;
  if (age > maxAge) return fail("Session Telegram expirée. Ferme puis rouvre la Mini App.");
  if (age < -300) return fail("Date de session Telegram invalide.");

  const userRaw = params.get("user");
  if (!userRaw) return fail("Identité Telegram absente de la session.");
  let user;
  try { user = JSON.parse(userRaw); } catch { return fail("Identité Telegram illisible."); }
  if (!user?.id) return fail("Identité Telegram invalide.");

  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const secret = await crypto.subtle.sign(
    "HMAC",
    secretKey,
    new TextEncoder().encode(botToken)
  );
  const key = await crypto.subtle.importKey(
    "raw", new Uint8Array(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC", key, new TextEncoder().encode(dataCheckString)
  );
  const actual = [...new Uint8Array(signature)]
    .map(b => b.toString(16).padStart(2, "0"))
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

async function telegramSend(env, chatId, text) {
  const botToken = String(env.BOT_TOKEN || "").trim();
  if (!botToken || !chatId) return false;
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: {"content-type":"application/json"},
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" })
    });
    let result = null;
    try { result = await response.json(); } catch {}
    const delivered = response.ok && result?.ok === true;
    if (!delivered) console.warn(`Telegram order notification was not delivered (HTTP ${response.status}).`);
    return delivered;
  } catch {
    console.warn("Telegram order notification request failed.");
    return false;
  }
}

const ADMIN_IDS = new Set(["6898182858", "5379947962"]);

function adminIds() {
  return ADMIN_IDS;
}

async function authenticateRequest(request, env) {
  const initData = request.headers.get("X-Telegram-Init-Data") || "";
  return await verifyTelegramInitData(initData, env.BOT_TOKEN);
}

async function requireUser(request, env) {
  return (await authenticateRequest(request, env)).user;
}

async function requireAdmin(request, env) {
  const auth = await authenticateRequest(request, env);
  if (!auth.user) return json({error:auth.error.message}, auth.error.status);
  if (!adminIds().has(String(auth.user.id))) {
    return json({error:`Compte Telegram ${auth.user.id} non autorisé. Seuls les deux administrateurs configurés peuvent gérer les commandes.`},403);
  }
  return auth.user;
}

async function handleApi(request, env, url) {
  const isAdminPath = url.pathname === "/api/admin" || url.pathname.startsWith("/api/admin/");
  if (isAdminPath) {
    const admin = await requireAdmin(request, env);
    if (admin instanceof Response) return admin;
  }
  if (!env.DB) return json({error:"D1 non configurée."}, 503);

  if (url.pathname === "/api/products" && request.method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT id,name,sub,price,cat,active,sort_order FROM products WHERE active=1 ORDER BY sort_order,id"
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

    const ids = items.map(x => Number(x.id)).filter(Number.isInteger);
    const placeholders = ids.map(()=>"?").join(",");
    const { results: products } = await env.DB.prepare(
      `SELECT id,name,price FROM products WHERE active=1 AND id IN (${placeholders})`
    ).bind(...ids).all();

    const byId = new Map(products.map(p => [Number(p.id), p]));
    let total = 0;
    const clean = [];
    for (const item of items) {
      const p = byId.get(Number(item.id));
      const qty = Math.max(1, Math.min(99, Number(item.qty)||1));
      if (!p) return json({error:"Produit indisponible."},400);
      total += Number(p.price) * qty;
      clean.push({id:p.id,name:p.name,price:Number(p.price),qty});
    }
    total = Math.round(total*100)/100;

    const order = await env.DB.prepare(
      `INSERT INTO orders (telegram_user_id,telegram_name,total,payment,status,created_at)
       VALUES (?,?,?,?,?,datetime('now'))`
    ).bind(
      String(user.id),
      [user.first_name,user.last_name].filter(Boolean).join(" ") || user.username || "Client",
      total, "cash", "new"
    ).run();

    const orderId = order.meta.last_row_id;
    const stmt = env.DB.prepare(
      `INSERT INTO order_items (order_id,product_id,name,price,qty) VALUES (?,?,?,?,?)`
    );
    await env.DB.batch(clean.map(x => stmt.bind(orderId,x.id,x.name,x.price,x.qty)));

    const lines = clean.map(x => `• ${htmlEscape(x.name)} × ${x.qty}`).join("\n");
    const client = [user.first_name,user.last_name].filter(Boolean).join(" ") || user.username || `ID ${user.id}`;
    const msg = `🛍️ <b>Nouvelle commande BCRVE85 #${orderId}</b>\n\n<b>Client :</b> ${htmlEscape(client)}\n<b>ID Telegram :</b> <code>${htmlEscape(user.id)}</code>\n\n${lines}\n\n<b>Total :</b> ${total.toFixed(2).replace(".",",")} €\n<b>Paiement :</b> espèces\n<b>Statut :</b> nouvelle`;
    const notificationsDelivered = (await Promise.all(
      [...adminIds()].map(id => telegramSend(env,id,msg))
    )).filter(Boolean).length;

    return json({ok:true,order_id:orderId,total,notifications_delivered:notificationsDelivered});
  }

  if (url.pathname === "/api/admin/check" && request.method === "GET") {
    return json({ok:true});
  }

  if (url.pathname === "/api/admin/orders" && request.method === "GET") {
    const { results } = await env.DB.prepare(`
      SELECT o.id,o.telegram_user_id,o.telegram_name,o.total,o.payment,o.status,o.created_at,
             COALESCE(GROUP_CONCAT(oi.name || ' × ' || oi.qty, ' | '),'') items
      FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id
      GROUP BY o.id ORDER BY o.id DESC LIMIT 100
    `).all();
    return json(results);
  }

  if (url.pathname === "/api/admin/orders/status" && request.method === "POST") {
    const body = await request.json();
    const allowed = ["new","preparing","ready","delivered","cancelled"];
    if (!allowed.includes(body.status)) return json({error:"Statut invalide."},400);
    await env.DB.prepare("UPDATE orders SET status=? WHERE id=?").bind(body.status, Number(body.id)).run();
    return json({ok:true});
  }

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
