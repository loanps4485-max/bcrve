const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

require("../promotions.js");

class FakeElement {
  constructor() {
    const classes = new Set(["hide"]);
    this.classList = {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
    };
    this.style = {};
    this.attributes = {};
    this.innerHTML = "";
    this.textContent = "";
    this.children = [];
    this.isConnected = true;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  appendChild(child) {
    this.children.push(child);
  }

  querySelector(selector) {
    return selector === "h3" ? new FakeElement() : null;
  }

  focus() {}
  select() {}
  remove() {}
}

async function createShop() {
  const source = await readFile(join(__dirname, "..", "app.js"), "utf8");
  const elements = new Map();
  const getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, new FakeElement());
    return elements.get(id);
  };
  const storedValues = new Map([
    ["bcrve85_cart", JSON.stringify([{ id: 1, qty: 10 }])],
  ]);
  const storage = {
    getItem: (key) => storedValues.get(key) || null,
    setItem: (key, value) => storedValues.set(key, value),
    removeItem: (key) => storedValues.delete(key),
  };
  const catalog = [
    { id: 1, name: "Article test", sub: "Sélection", price: 12, cat: "selection", stock: 20 },
    { id: 2, name: "Épuisé", sub: "Édition", price: 8, cat: "edition", stock: 0 },
  ];
  const promotionList = [
    { min_qty: 5, discount_percent: 10, product_ids: [1] },
    { min_qty: 10, discount_percent: 10, product_ids: [1] },
  ];
  const document = {
    body: new FakeElement(),
    addEventListener() {},
    createElement: () => new FakeElement(),
    getElementById,
    querySelector: () => null,
    querySelectorAll: () => [],
    execCommand: () => true,
  };
  const context = vm.createContext({
    BCRVEPromotions: globalThis.BCRVEPromotions,
    document,
    fetch: async (url) => ({
      ok: true,
      json: async () => url === "/api/products" ? catalog : promotionList,
    }),
    location: { hash: "", origin: "https://shop.example" },
    localStorage: storage,
    sessionStorage: storage,
    navigator: {},
    window: { scrollTo() {} },
    setTimeout() {},
    setInterval: () => 1,
    clearInterval() {},
  });

  vm.runInContext(source, context, { filename: "app.js" });
  await vm.runInContext("loadProducts()", context);

  return { context, elements, storedValues };
}

test("storefront keeps threshold pricing, cart controls, stock and favorites", async () => {
  const { context, elements, storedValues } = await createShop();

  vm.runInContext("cart()", context);
  const cartMarkup = elements.get("sheet").innerHTML;
  assert.match(cartMarkup, /10 articles concernés/);
  assert.match(cartMarkup, /-10/);
  assert.match(cartMarkup, /onclick="changeQty\(1,-10\)"/);
  assert.ok(
    cartMarkup.indexOf("−1</button>") < cartMarkup.indexOf("<strong>10</strong>") &&
    cartMarkup.indexOf("<strong>10</strong>") < cartMarkup.indexOf("+1</button>"),
    "quantity controls keep the quantity between decrease and increase buttons",
  );

  vm.runInContext("changeQty(1, -5)", context);
  assert.equal(JSON.parse(storedValues.get("bcrve85_cart"))[0].qty, 5);
  assert.equal(elements.get("count").textContent, 5);

  vm.runInContext("add(2)", context);
  assert.equal(JSON.parse(storedValues.get("bcrve85_cart"))[0].qty, 5);

  vm.runInContext("toggleFavorite(1)", context);
  assert.deepEqual(JSON.parse(storedValues.get("bcrve85_favorites")), [1]);
  assert.match(elements.get("products").innerHTML, /aria-pressed="true"/);

  vm.runInContext("render('edition')", context);
  assert.match(elements.get("products").innerHTML, /Épuisé/);
  assert.match(elements.get("products").innerHTML, /disabled/);
});
