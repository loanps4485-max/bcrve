const telegramApp = window.Telegram?.WebApp;

if (telegramApp) {
  telegramApp.ready();
  telegramApp.expand();
}

const CART_STORAGE_KEY = "bcrve85_cart";
const FAVORITES_STORAGE_KEY = "bcrve85_favorites";
const CATEGORY_OPTIONS = [
  ["all", "Tout"],
  ["selection", "Sélection"],
  ["edition", "Édition"],
  ["packs", "Packs"],
];
const ORDER_STATUS_META = {
  new: ["🆕", "Nouvelle"],
  preparing: ["👨‍🍳", "En préparation"],
  ready: ["✅", "Prête"],
  delivered: ["📦", "Remise"],
  cancelled: ["❌", "Annulée"],
};

// Telegram session and browser storage
let modalReturnFocus = null;
let products = [];
let promotions = [];
let currentCategory = "all";
let orderWatchTimer = null;
let favoriteIds = loadFavoriteIds();
let cartData = loadCart();

function loadFavoriteIds() {
  try {
    const favorites = JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || "[]");
    if (!Array.isArray(favorites)) return [];
    return [...new Set(favorites.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  } catch {
    removeStoredValue(FAVORITES_STORAGE_KEY);
    return [];
  }
}

function loadCart() {
  try {
    const cart = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]");
    if (!Array.isArray(cart)) return [];

    return cart
      .filter((item) =>
        item &&
        Number.isInteger(Number(item.id)) &&
        Number(item.id) > 0 &&
        Number.isInteger(Number(item.qty)) &&
        Number(item.qty) > 0
      )
      .map((item) => ({
        id: Number(item.id),
        qty: Math.min(99, Number(item.qty)),
      }));
  } catch {
    removeStoredValue(CART_STORAGE_KEY);
    return [];
  }
}

function removeStoredValue(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable in private browsing contexts.
  }
}

function telegramInitData() {
  if (telegramApp?.initData) return telegramApp.initData;

  try {
    return new URLSearchParams(location.hash.slice(1)).get("tgWebAppData") || "";
  } catch {
    return "";
  }
}

function euro(value) {
  return Number(value).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function saveCart() {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartData));
  } catch {
    // Keep the current cart usable even when storage is unavailable.
  }
  updateCartCount();
}

function updateCartCount() {
  const count = document.getElementById("count");
  if (count) {
    count.textContent = cartData.reduce((total, item) => total + item.qty, 0);
  }
}

async function checkAdmin() {
  const adminBar = document.getElementById("adminBar");
  const accessHint = document.getElementById("adminAccessHint");
  if (!adminBar) return;

  adminBar.classList.add("hide");
  accessHint?.classList.add("hide");

  const initData = telegramInitData();
  const launchedFromTelegram = Boolean(initData) ||
    /(?:^|[&#])tgWebApp(?:Data|Version|Platform)=/.test(location.hash);

  if (!launchedFromTelegram) return;
  if (!initData) {
    if (accessHint) {
      accessHint.textContent = "Session Telegram absente. Ouvre la boutique depuis le bouton de @Bcrvee85_bot.";
      accessHint.classList.remove("hide");
    }
    return;
  }

  try {
    const response = await fetch("/api/admin/check", {
      headers: { "X-Telegram-Init-Data": initData },
      cache: "no-store",
    });

    if (response.ok) {
      adminBar.classList.remove("hide");
      return;
    }

    const result = await response.json().catch(() => ({}));
    if (accessHint) {
      accessHint.textContent = result.error || `Vérification admin indisponible (${response.status}).`;
      accessHint.classList.remove("hide");
    }
  } catch {
    if (accessHint) {
      accessHint.textContent = "Vérification admin indisponible. Réessaie dans un instant.";
      accessHint.classList.remove("hide");
    }
  }
}

function openAdmin() {
  const initData = telegramInitData();
  if (!initData) {
    toast("Session Telegram absente. Ferme puis rouvre la boutique depuis le bot.");
    return;
  }

  try {
    sessionStorage.setItem("bcrve_telegram_init_data", initData);
  } catch {
    // The session data is also passed in the URL for the admin page.
  }

  telegramApp?.HapticFeedback?.impactOccurred("light");
  location.href = `/admin.html?tgWebAppData=${encodeURIComponent(initData)}`;
}

// Catalog and product cards
async function loadProducts() {
  try {
    const [productsResponse, promotionsResponse] = await Promise.all([
      fetch("/api/products"),
      fetch("/api/promotions"),
    ]);

    if (!productsResponse.ok) throw new Error("Catalogue indisponible");

    products = await productsResponse.json();
    promotions = promotionsResponse.ok ? await promotionsResponse.json() : [];
    render();
    updateCartCount();
  } catch {
    const productList = document.getElementById("products");
    if (productList) {
      productList.innerHTML = '<div class="empty">Catalogue indisponible pour le moment.</div>';
    }
  }
}

function renderCategoryChips() {
  const chips = document.getElementById("chips");
  if (!chips) return;

  chips.innerHTML = CATEGORY_OPTIONS.map(([category, label]) => `
    <button
      type="button"
      class="chip ${category === currentCategory ? "on" : ""}"
      aria-pressed="${category === currentCategory}"
      onclick="render('${category}')"
    >${label}</button>
  `).join("");
}

function renderProductCard(product) {
  const id = Number(product.id);
  const isFavorite = favoriteIds.includes(id);
  const stock = Number(product.stock);
  const soldOut = stock === 0;

  return `
    <article class="card">
      <div class="visual"><span>JUL · 13</span></div>
      <div class="info">
        <div class="name">${escapeHtml(product.name)}</div>
        <div class="sub">${escapeHtml(product.sub || "")}</div>
        <div class="sub stock-label ${soldOut ? "sold-out" : ""}">
          ${soldOut ? "Rupture de stock" : `${stock} disponible(s)`}
        </div>
        <div class="row">
          <span class="price">${euro(product.price)}</span>
          <div class="actions">
            <button
              type="button"
              class="favorite-toggle ${isFavorite ? "on" : ""}"
              aria-label="${isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}"
              aria-pressed="${isFavorite}"
              onclick="toggleFavorite(${id})"
            >${isFavorite ? "♥" : "♡"}</button>
            <button
              type="button"
              class="add"
              ${soldOut ? "disabled" : ""}
              aria-label="Ajouter ${escapeHtml(product.name)} au panier"
              onclick="add(${id})"
            >+</button>
          </div>
        </div>
      </div>
    </article>
  `;
}

function render(category = currentCategory) {
  currentCategory = category;
  renderCategoryChips();

  const productList = document.getElementById("products");
  if (!productList) return;

  const visibleProducts = category === "all"
    ? products
    : products.filter((product) => product.cat === category);

  productList.innerHTML = visibleProducts.length
    ? visibleProducts.map(renderProductCard).join("")
    : '<div class="empty">Aucun article dans cette sélection.</div>';
}

function add(id) {
  const product = products.find((item) => item.id === id);
  if (product && Number(product.stock) === 0) {
    toast("Produit en rupture de stock");
    return;
  }

  const item = cartData.find((entry) => entry.id === id);
  if (item) {
    if (item.qty >= 99) {
      toast("Maximum 99 par produit");
      return;
    }
    item.qty += 1;
  } else {
    cartData.push({ id, qty: 1 });
  }

  saveCart();
  toast("Ajouté · c’est carré 😎");
}

function changeQty(id, delta) {
  const item = cartData.find((entry) => entry.id === id);
  if (!item) return;

  const nextQuantity = Math.max(0, Math.min(99, item.qty + delta));
  if (nextQuantity === 0) {
    cartData = cartData.filter((entry) => entry.id !== id);
  } else {
    item.qty = nextQuantity;
  }

  saveCart();
  cart();
}

function getCartPromotion() {
  const items = cartData.map((item) => {
    const product = products.find((candidate) => Number(candidate.id) === Number(item.id));
    return {
      id: item.id,
      qty: item.qty,
      price: product ? product.price : 0,
    };
  });

  const breakdown = BCRVEPromotions.getPromotionBreakdown(items, promotions);
  return breakdown.promotion
    ? { ...breakdown, p: breakdown.promotion, qty: breakdown.quantity }
    : null;
}

// Cart totals and order submission
function renderCartLine(item, promotion, discountedQtyById) {
  const product = products.find((candidate) => candidate.id === item.id);
  if (!product) return "";

  const discountedQuantity = discountedQtyById.get(Number(item.id)) || 0;
  const regularQuantity = Math.max(0, item.qty - discountedQuantity);
  const discountedUnitPrice = product.price * (1 - Number(promotion?.discount_percent || 0) / 100);
  const lineTotal = discountedQuantity * discountedUnitPrice + regularQuantity * product.price;

  const priceInfo = discountedQuantity > 0
    ? `
      <div class="sub">
        <s>${euro(product.price)}</s> ${euro(discountedUnitPrice)} / unité · ${discountedQuantity} remisée(s)
        ${regularQuantity > 0 ? ` · ${regularQuantity} au tarif normal` : ""}
      </div>
    `
    : `<div class="sub">${euro(product.price)} / unité</div>`;
  const renderQuantityButton = (delta) => {
    const label = delta < 0 ? `−${Math.abs(delta)}` : `+${delta}`;
    const disabled = delta < 0 && item.qty <= 1 ? "disabled" : "";
    return `<button type="button" onclick="changeQty(${product.id},${delta})" ${disabled}>${label}</button>`;
  };
  const decreaseControls = [-10, -5, -1].map(renderQuantityButton).join("");
  const increaseControls = [1, 5, 10].map(renderQuantityButton).join("");

  return `
    <div class="line cart-line">
      <div class="cart-product">
        <b>${escapeHtml(product.name)}</b>
        ${priceInfo}
      </div>
      <div class="cart-controls">
        <div class="qty-total">${euro(lineTotal)}</div>
        <div class="qty-buttons">
          ${decreaseControls}
          <strong>${item.qty}</strong>
          ${increaseControls}
        </div>
      </div>
    </div>
  `;
}

function cart(button) {
  if (button) nav(button);

  const subtotal = Math.round(cartData.reduce((sum, item) => {
    const product = products.find((candidate) => candidate.id === item.id);
    return sum + (product ? product.price * item.qty : 0);
  }, 0) * 100) / 100;
  const promotionMatch = getCartPromotion();
  const promotion = promotionMatch?.p || null;
  const discountQuantity = promotionMatch?.discountQty || 0;
  const discountedQtyById = promotionMatch?.discountedQtyById || new Map();
  const discount = promotionMatch?.discount || 0;
  const total = Math.round((subtotal - discount) * 100) / 100;
  const lines = cartData
    .map((item) => renderCartLine(item, promotion, discountedQtyById))
    .join("");

  const promotionNotice = promotion
    ? `
      <div class="notice discount-notice">
        🎉 Remise quantité : <b>-${Number(promotion.discount_percent).toLocaleString("fr-FR")}%</b>
        (${discountQuantity} articles concernés)<br>
        <span>Sous-total : ${euro(subtotal)} · Économie : ${euro(discount)}</span>
      </div>
    `
    : promotions.length
      ? '<div class="notice">Ajoute plus de produits pour débloquer une remise quantité.</div>'
      : "";
  const totals = cartData.length
    ? `
      <div class="line"><b>Sous-total</b><b>${euro(subtotal)}</b></div>
      ${promotionNotice}
      <div class="line"><b>Total</b><b>${euro(total)}</b></div>
      <div class="notice">Paiement : <b>espèces</b> lors de la remise.</div>
      <button class="full" onclick="order()">Confirmer la commande</button>
    `
    : "";

  show(`
    <button class="close" onclick="closeModal()">×</button>
    <h3>Votre panier</h3>
    ${lines || '<div class="empty">Votre panier est vide.</div>'}
    ${totals}
  `);
}

function removeItem(id) {
  const item = cartData.find((entry) => entry.id === id);
  if (!item) return;

  item.qty -= 1;
  if (item.qty <= 0) cartData = cartData.filter((entry) => entry.id !== id);
  saveCart();
  cart();
}

async function order() {
  const initData = telegramInitData();
  if (!initData) {
    show(`
      <button class="close" onclick="closeModal()" aria-label="Fermer">×</button>
      <h3>Ouvrez la boutique dans Telegram</h3>
      <p>La commande doit être validée depuis Telegram.</p>
      <div class="notice">Ouvre @Bcrvee85_bot puis touche le bouton de la boutique.</div>
      <a class="share-bot" href="https://t.me/Bcrvee85_bot" target="_blank" rel="noopener noreferrer">Ouvrir le bot Telegram ↗</a>
    `);
    return;
  }

  const items = cartData.map((item) => ({ id: item.id, qty: item.qty }));
  const button = document.querySelector(".full");
  if (button) {
    button.disabled = true;
    button.textContent = "Envoi…";
  }

  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Telegram-Init-Data": initData,
      },
      body: JSON.stringify({ items }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Erreur");

    cartData = [];
    saveCart();

    const notificationNote = data.notifications_delivered < 2
      ? '<p class="sub">Une alerte Telegram n’a pas été remise. La commande reste visible dans le panneau admin.</p>'
      : "";
    show(`
      <h3>Commande enregistrée 🎉</h3>
      <p>Votre commande <b>#${data.order_id}</b> est bien enregistrée.</p>
      ${notificationNote}
      <div class="notice">
        <b>Paiement :</b> espèces<br>
        <b>Total :</b> ${euro(data.total)}
        ${Number(data.discount) > 0 ? `<br><b>Remise quantité :</b> -${euro(data.discount)} (${Number(data.discount_percent).toLocaleString("fr-FR")}%)` : ""}
        <br><b>Statut :</b> 🆕 Nouvelle
      </div>
      <button class="full" onclick="orders()">📦 Suivre ma commande</button>
      <button class="full secondary-action" onclick="closeModal()">Fermer</button>
    `);
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.textContent = "Confirmer la commande";
    }

    const message = error.message || "Erreur";
    if (/session\s+Telegram|signature\s+Telegram|identité\s+Telegram|authentification serveur/i.test(message)) {
      show(`
        <button class="close" onclick="closeModal()">×</button>
        <h3>Session Telegram à renouveler</h3>
        <p>${escapeHtml(message)}</p>
        <div class="notice">Ferme la Mini App, retourne au chat ${escapeHtml("@Bcrvee85_bot")}, puis rouvre-la depuis son bouton. Ton panier est conservé.</div>
        <button class="full" onclick="closeModal()">Compris</button>
      `);
    } else {
      toast(message);
    }
  }
}

// Profile and administrator access
async function profile() {
  const initData = telegramInitData();
  const hasSession = Boolean(initData);
  show(`
    <button class="close" onclick="closeModal()">×</button>
    <h3>Votre espace</h3>
    <div class="line"><span>Session Telegram</span><span>${hasSession ? "Présente" : "Absente"}</span></div>
    <div class="line"><span>Accès admin</span><span id="adminAccessState">${hasSession ? "Vérification serveur…" : "Ouvre la boutique dans Telegram"}</span></div>
    <div class="line"><span>Paiement</span><span>Espèces</span></div>
    ${hasSession ? '<button class="full" onclick="orders()">📦 Mes commandes & statut</button>' : ""}
  `);

  if (!hasSession) {
    const link = document.createElement("a");
    link.className = "share-bot";
    link.href = "https://t.me/Bcrvee85_bot";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Ouvrir le bot Telegram ↗";
    document.getElementById("sheet").appendChild(link);
    return;
  }

  try {
    const response = await fetch("/api/admin/check", {
      headers: { "X-Telegram-Init-Data": initData },
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));
    const accessState = document.getElementById("adminAccessState");
    if (accessState) {
      accessState.textContent = response.ok
        ? "Autorisé"
        : result.error || `Vérification indisponible (${response.status})`;
    }
  } catch {
    const accessState = document.getElementById("adminAccessState");
    if (accessState) accessState.textContent = "Service temporairement indisponible";
  }
}

// Order history and status tracking
function orderProgress(status) {
  const steps = ["new", "preparing", "ready", "delivered"];
  if (status === "cancelled") return "";

  const currentStep = Math.max(0, steps.indexOf(status));
  return `
    <div class="order-progress" aria-label="Progression de la commande">
      ${steps.map((step, index) => `
        <span class="${index <= currentStep ? "done" : ""}">${ORDER_STATUS_META[step][0]}</span>
      `).join("")}
    </div>
  `;
}

function renderOrders(ordersList) {
  const content = ordersList.length
    ? ordersList.map((orderItem) => {
      const meta = ORDER_STATUS_META[orderItem.status] || ["ℹ️", orderItem.status];
      const date = orderItem.created_at
        ? new Date(orderItem.created_at.replace(" ", "T") + "Z").toLocaleString("fr-FR", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
        : "";
      const payment = orderItem.payment === "cash" ? "Espèces" : orderItem.payment;

      return `
        <div class="line order-history">
          <div style="flex:1">
            <b>Commande #${Number(orderItem.id)}</b>
            <div class="sub">${escapeHtml(date)} · ${escapeHtml(payment)}</div>
            ${orderProgress(orderItem.status)}
            ${orderItem.status === "cancelled" ? '<div class="sub">Commande annulée</div>' : ""}
          </div>
          <div style="text-align:right">
            <b>${euro(orderItem.total)}</b>
            <div class="sub status-text">${meta[0]} ${escapeHtml(meta[1])}</div>
          </div>
        </div>
      `;
    }).join("")
    : '<div class="empty">Aucune commande pour le moment.</div>';

  const sheet = document.getElementById("sheet");
  if (!sheet) return;

  sheet.innerHTML = `
    <button class="close" onclick="closeModal()">×</button>
    <h3>Mes commandes</h3>
    <p class="sub">Le statut se met à jour automatiquement.</p>
    <div id="ordersList">${content}</div>
  `;
}

async function loadMyOrders() {
  const initData = telegramInitData();
  if (!initData) return;

  try {
    const response = await fetch("/api/orders", {
      headers: { "X-Telegram-Init-Data": initData },
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Erreur");
    renderOrders(Array.isArray(data) ? data : []);
  } catch (error) {
    const ordersList = document.getElementById("ordersList");
    if (ordersList) {
      ordersList.innerHTML = `<div class="empty">${escapeHtml(error.message || "Impossible de charger les commandes.")}</div>`;
    }
  }
}

async function orders() {
  if (orderWatchTimer) clearInterval(orderWatchTimer);

  show('<button class="close" onclick="closeModal()">×</button><h3>Mes commandes</h3><div id="ordersList" class="empty">Chargement…</div>');
  await loadMyOrders();
  orderWatchTimer = setInterval(loadMyOrders, 3000);
}

// Favorites and sharing
function favorites(button) {
  if (button) nav(button);

  const favoriteProducts = products.filter((product) =>
    favoriteIds.includes(Number(product.id))
  );
  const content = favoriteProducts.length
    ? favoriteProducts.map((product) => {
      const id = Number(product.id);
      return `
        <div class="line">
          <div>
            <b>${escapeHtml(product.name)}</b>
            <div class="sub">${escapeHtml(product.sub || "")}</div>
            <strong>${euro(product.price)}</strong>
          </div>
          <div class="favorite-actions">
            <button type="button" class="favorite-remove" onclick="removeFavorite(${id})">Retirer</button>
            <button type="button" class="add" aria-label="Ajouter ${escapeHtml(product.name)} au panier" onclick="add(${id})">+</button>
          </div>
        </div>
      `;
    }).join("")
    : '<div class="empty">Aucun favori pour le moment.<br><span class="sub">Touche le cœur sur un article pour le garder ici.</span></div>';

  show(`
    <button class="close" onclick="closeModal()">×</button>
    <h3>Mes favoris</h3>
    ${content}
  `);
}

function saveFavorites() {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteIds));
  } catch {
    // Favorites remain available until the page is closed.
  }
}

function toggleFavorite(id) {
  const productId = Number(id);
  const exists = favoriteIds.includes(productId);
  favoriteIds = exists
    ? favoriteIds.filter((value) => value !== productId)
    : [...favoriteIds, productId];

  saveFavorites();
  render();
  toast(exists ? "Retiré des favoris" : "Ajouté aux favoris");
}

function removeFavorite(id) {
  const productId = Number(id);
  favoriteIds = favoriteIds.filter((value) => value !== productId);
  saveFavorites();
  render();
  favorites();
  toast("Retiré des favoris");
}

async function shareShop() {
  const link = location.origin + "/";
  const details = {
    title: "BCRVE85 — Boutique",
    text: "Découvre la boutique BCRVE85. Pour commander, ouvre la Mini App depuis Telegram.",
    url: link,
  };

  if (typeof navigator.share === "function") {
    try {
      await navigator.share(details);
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }

  try {
    await navigator.clipboard.writeText(link);
    toast("Lien copié · partage-le où tu veux");
  } catch {
    show(`
      <button class="close" onclick="closeModal()">×</button>
      <h3>Partager la boutique</h3>
      <p>Copie le lien ci-dessous pour l’envoyer où tu veux.</p>
      <input class="share-url" id="shareUrl" readonly value="${escapeHtml(link)}">
      <button class="full" onclick="copyShopLink()">Copier le lien</button>
      <p class="sub">Pour commander, ouvre la Mini App depuis Telegram.</p>
      <a class="share-bot" href="https://t.me/Bcrvee85_bot" target="_blank" rel="noopener noreferrer">Ouvrir le bot Telegram ↗</a>
    `);

    const input = document.getElementById("shareUrl");
    if (input) {
      input.focus();
      input.select();
    }
  }
}

async function copyShopLink() {
  const input = document.getElementById("shareUrl");

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(location.origin + "/");
    } else if (input) {
      input.focus();
      input.select();
      if (!document.execCommand("copy")) throw new Error("copy unavailable");
    }
    toast("Lien copié · partage-le où tu veux");
  } catch {
    if (input) {
      input.focus();
      input.select();
      toast("Lien sélectionné · copie-le pour le partager");
    } else {
      toast("Copie indisponible dans ce navigateur");
    }
  }
}

// Modal, navigation and feedback
function show(html) {
  const modal = document.getElementById("modal");
  const sheet = document.getElementById("sheet");
  if (modal.classList.contains("hide")) modalReturnFocus = document.activeElement;

  sheet.innerHTML = html;
  modal.classList.remove("hide");

  Object.assign(modal.style, {
    position: "fixed",
    left: "0",
    top: "0",
    right: "0",
    bottom: "0",
    width: "100vw",
    height: "100dvh",
    zIndex: "10000",
    display: "block",
    padding: "0",
    margin: "0",
    background: "rgba(0,0,0,.42)",
    overflow: "hidden",
  });
  Object.assign(sheet.style, {
    position: "fixed",
    left: "50%",
    top: "50%",
    transform: "translate(-50%,-50%)",
    boxSizing: "border-box",
    display: "block",
    width: "min(430px,calc(100vw - 32px))",
    maxWidth: "calc(100vw - 32px)",
    maxHeight: "calc(100dvh - 120px)",
    margin: "0",
    padding: "20px 18px 22px",
    background: "#fffdfa",
    color: "#181817",
    borderRadius: "24px",
    overflow: "auto",
    boxShadow: "0 20px 60px rgba(0,0,0,.22)",
    zIndex: "10001",
  });
  sheet.scrollTop = 0;

  const title = sheet.querySelector("h3");
  if (title) {
    title.id = "modalTitle";
    sheet.setAttribute("aria-labelledby", "modalTitle");
  }
  sheet.querySelector(".close,button,input,select,textarea,[href]")?.focus({
    preventScroll: true,
  });
}

function closeModal() {
  if (orderWatchTimer) {
    clearInterval(orderWatchTimer);
    orderWatchTimer = null;
  }

  const modal = document.getElementById("modal");
  modal.classList.add("hide");
  modal.style.display = "none";

  if (modalReturnFocus?.isConnected) {
    modalReturnFocus.focus({ preventScroll: true });
  }
  modalReturnFocus = null;
}

function home(button) {
  window.scrollTo({ top: 0, behavior: "smooth" });
  nav(button);
}

function shop(button) {
  document.getElementById("shop").scrollIntoView({ behavior: "smooth" });
  nav(button);
}

function nav(button) {
  document.querySelectorAll("nav button").forEach((item) => item.classList.remove("active"));
  if (button) button.classList.add("active");
}

function toast(message) {
  const element = document.createElement("div");
  element.textContent = message;
  element.setAttribute("role", "status");
  element.setAttribute("aria-live", "polite");
  Object.assign(element.style, {
    position: "fixed",
    bottom: "95px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "#181817",
    color: "#fff",
    padding: "11px 16px",
    borderRadius: "99px",
    zIndex: 99,
    fontSize: "12px",
  });
  document.body.appendChild(element);
  setTimeout(() => element.remove(), 1600);
}

document.addEventListener("keydown", (event) => {
  const modal = document.getElementById("modal");
  if (event.key === "Escape" && !modal.classList.contains("hide")) closeModal();
});

loadProducts();
checkAdmin();
