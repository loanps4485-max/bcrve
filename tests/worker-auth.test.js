const assert = require("node:assert/strict");
const { createHmac, webcrypto } = require("node:crypto");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { before, test } = require("node:test");

require("../promotions.js");
globalThis.crypto ??= webcrypto;

const BOT_TOKEN = "123456:unit-test-token";
const ADMIN_IDS = ["6898182858", "5379947962"];
let worker;

before(async () => {
  const source = await readFile(join(__dirname, "..", "worker.js"), "utf8");
  const standaloneSource = source.replace(/^import ["']\.\/promotions\.js["'];\s*/m, "");
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(standaloneSource).toString("base64")}`;
  ({ default: worker } = await import(moduleUrl));
});

function signedInitData(userId, authDate = Math.floor(Date.now() / 1000)) {
  const fields = {
    auth_date: String(authDate),
    user: JSON.stringify({ id: userId, first_name: "Test client" }),
  };
  const checkString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData")
    .update(BOT_TOKEN)
    .digest();
  const hash = createHmac("sha256", secret)
    .update(checkString)
    .digest("hex");

  return new URLSearchParams({ ...fields, hash }).toString();
}

async function requestAdminCheck(initData) {
  const headers = initData
    ? { "X-Telegram-Init-Data": initData }
    : {};
  const request = new Request("https://shop.example/api/admin/check", { headers });
  return worker.fetch(request, {
    BOT_TOKEN,
    DB: {},
  });
}

function fakeOrderDatabase(stock = 50) {
  const counts = { orders: 0, items: 0, stockUpdates: 0 };
  const promotions = [
    { id: 1, min_qty: 5, discount_percent: 10, starts_at: null, ends_at: null, active: 1 },
    { id: 2, min_qty: 10, discount_percent: 10, starts_at: null, ends_at: null, active: 1 },
  ];
  const DB = {
    prepare(sql) {
      return {
        bind(...bindings) {
          return {
            sql,
            bindings,
            async all() {
              if (sql.startsWith("SELECT id,name,price,stock FROM products")) {
                return {
                  results: [{ id: 7, name: "Synthetic product", price: 12.5, stock }],
                };
              }
              if (sql.startsWith("SELECT id,min_qty,discount_percent,starts_at,ends_at,active")) {
                return { results: promotions };
              }
              if (sql.startsWith("SELECT promotion_id,product_id FROM promotion_products")) {
                return {
                  results: [
                    { promotion_id: 1, product_id: 7 },
                    { promotion_id: 2, product_id: 7 },
                  ],
                };
              }
              throw new Error(`Unexpected D1 query: ${sql}`);
            },
            async run() {
              if (sql.startsWith("INSERT INTO orders")) {
                counts.orders += 1;
                return { meta: { last_row_id: 42 } };
              }
              throw new Error(`Unexpected D1 write: ${sql}`);
            },
          };
        },
      };
    },
    async batch(statements) {
      if (statements.some((statement) => statement.sql.startsWith("UPDATE products SET stock"))) {
        counts.stockUpdates += statements.length;
      } else {
        counts.items += statements.length;
      }
      return statements.map(() => ({ success: true, meta: { changes: 1 } }));
    },
  };

  return { DB, counts };
}

async function submitOrder(database, quantity = 10) {
  const request = new Request("https://shop.example/api/orders", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Telegram-Init-Data": signedInitData("321"),
    },
    body: JSON.stringify({ items: [{ id: 7, qty: quantity }] }),
  });
  return worker.fetch(request, {
    BOT_TOKEN,
    DB: database.DB,
  });
}

function fakeAdminDatabase() {
  const statements = [];
  const DB = {
    prepare(sql) {
      return {
        bind(...bindings) {
          return {
            async first() {
              if (sql.startsWith("SELECT id,telegram_user_id,status FROM orders")) {
                return { id: 42, telegram_user_id: "321", status: "new" };
              }
              if (sql.startsWith("SELECT id,telegram_user_id FROM orders")) {
                return { id: 42, telegram_user_id: "321" };
              }
              throw new Error(`Unexpected D1 lookup: ${sql}`);
            },
            async run() {
              statements.push({ sql, bindings });
              return { meta: { last_row_id: 55, changes: 1 } };
            },
          };
        },
      };
    },
  };
  return { DB, statements };
}

async function adminRequest(database, path, method, body) {
  const request = new Request(`https://shop.example${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "X-Telegram-Init-Data": signedInitData(ADMIN_IDS[0]),
    },
    body: JSON.stringify(body),
  });
  return worker.fetch(request, {
    BOT_TOKEN,
    DB: database.DB,
  });
}

test("requires a Telegram session for admin routes", async () => {
  const response = await requestAdminCheck("");
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /Session Telegram absente/);
});

test("accepts both configured admin accounts", async () => {
  for (const adminId of ADMIN_IDS) {
    const response = await requestAdminCheck(signedInitData(adminId));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  }
});

test("rejects a signed Telegram session for a non-admin", async () => {
  const response = await requestAdminCheck(signedInitData("1111111111"));
  assert.equal(response.status, 403);
});

test("rejects modified or expired Telegram session data", async () => {
  const signedData = signedInitData(ADMIN_IDS[0]);
  const tamperedFields = new URLSearchParams(signedData);
  tamperedFields.set("user", JSON.stringify({ id: "1111111111" }));
  const tamperedResponse = await requestAdminCheck(tamperedFields.toString());
  assert.equal(tamperedResponse.status, 401);

  const expiredData = signedInitData(ADMIN_IDS[0], Math.floor(Date.now() / 1000) - 86401);
  const expiredResponse = await requestAdminCheck(expiredData);
  assert.equal(expiredResponse.status, 401);
  assert.match((await expiredResponse.json()).error, /Session Telegram expirée/);
});

test("server order pricing applies the exact quantity promotion and updates stock", async () => {
  const fixture = fakeOrderDatabase();
  const originalFetch = globalThis.fetch;
  const telegramMessages = [];
  globalThis.fetch = async (_url, options) => {
    telegramMessages.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const response = await submitOrder(fixture);
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(data.discount, 12.5);
    assert.equal(data.total, 112.5);
    assert.equal(data.total_quantity, 10);
    assert.equal(fixture.counts.orders, 1);
    assert.equal(fixture.counts.items, 1);
    assert.equal(fixture.counts.stockUpdates, 1);
    assert.equal(telegramMessages.length, 3);
    assert.ok(telegramMessages.some((message) => message.text.includes("-12,50 € (10%)")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("server rejects an order that exceeds available stock before saving it", async () => {
  const fixture = fakeOrderDatabase(9);
  const response = await submitOrder(fixture);
  const data = await response.json();

  assert.equal(response.status, 409);
  assert.match(data.error, /stock insuffisant/i);
  assert.equal(fixture.counts.orders, 0);
  assert.equal(fixture.counts.items, 0);
  assert.equal(fixture.counts.stockUpdates, 0);
});

test("admin can update an order status and notify the customer", async () => {
  const fixture = fakeAdminDatabase();
  const originalFetch = globalThis.fetch;
  const telegramMessages = [];
  globalThis.fetch = async (_url, options) => {
    telegramMessages.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const response = await adminRequest(
      fixture,
      "/api/admin/orders/status",
      "POST",
      { id: 42, status: "ready" },
    );
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(data, { ok: true, changed: true, client_notified: true });
    assert.equal(fixture.statements[0].bindings[0], "ready");
    assert.equal(telegramMessages.length, 1);
    assert.match(telegramMessages[0].text, /Statut : <b>Prête<\/b>/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("admin replies are sent to the customer with message markup escaped", async () => {
  const fixture = fakeAdminDatabase();
  const originalFetch = globalThis.fetch;
  const telegramMessages = [];
  globalThis.fetch = async (_url, options) => {
    telegramMessages.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const response = await adminRequest(
      fixture,
      "/api/admin/orders/reply",
      "POST",
      { id: 42, message: "Salut <b>toi</b>" },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, delivered: true });
    assert.equal(telegramMessages[0].chat_id, "321");
    assert.match(telegramMessages[0].text, /Salut &lt;b&gt;toi&lt;\/b&gt;/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("admin promotions validate targets and keep their quantity threshold", async () => {
  const fixture = fakeAdminDatabase();
  const response = await adminRequest(
    fixture,
    "/api/admin/promotions",
    "POST",
    {
      min_qty: 10,
      discount_percent: 10,
      starts_at: "2026-10-12 00:00",
      ends_at: "2026-10-30 23:59",
      product_ids: [7, 7, 8],
    },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(fixture.statements.map(({ bindings }) => bindings), [
    [10, 10, "2026-10-12 00:00", "2026-10-30 23:59"],
    [55, 7],
    [55, 8],
  ]);
});
