const telegramApp = window.Telegram?.WebApp;

if (telegramApp) {
  telegramApp.ready();
  telegramApp.expand();
}

let catalogProducts = [];

// Telegram session and API requests
function telegramInitData() {
  if (telegramApp?.initData) return telegramApp.initData;

  try {
    const queryData = new URLSearchParams(location.search).get("tgWebAppData");
    const hashData = new URLSearchParams(location.hash.slice(1)).get("tgWebAppData");
    return queryData || hashData || "";
  } catch {
    return "";
  }
}

function requestHeaders() {
  let initData = telegramInitData();
  if (!initData) {
    try {
      initData = sessionStorage.getItem("bcrve_telegram_init_data") || "";
    } catch {
      // The admin page can still report the missing Telegram session.
    }
  }

  return { "X-Telegram-Init-Data": initData };
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

async function api(url, options = {}) {
  const requestOptions = {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...requestHeaders(),
      "content-type": "application/json",
    },
  };
  const response = await fetch(url, requestOptions);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Erreur");
  return data;
}

function label(status) {
  return ({
    new: "Nouvelle",
    preparing: "Préparation",
    ready: "Prête",
    delivered: "Remise",
    cancelled: "Annulée",
  })[status] || status;
}

// Orders and product overview
function renderOrder(order) {
  const id = Number(order.id);
  const statusButtons = ["new", "preparing", "ready", "delivered", "cancelled"]
    .map((status) => {
      const selected = status === order.status;
      return `
        <button
          class="status-btn ${selected ? "selected" : ""}"
          type="button"
          onclick="setStatus(${id},'${status}')"
          ${selected ? "disabled" : ""}
        >${label(status)}</button>
      `;
    })
    .join("");

  return `
    <article class="item order-card">
      <div class="order-main">
        <div class="order-title">
          <b>#${id} · ${escapeHtml(order.telegram_name)}</b>
          <span class="status-pill status-${escapeHtml(order.status)}">${label(order.status)}</span>
        </div>
        <p>${escapeHtml(order.items)}</p>
        <strong>${euro(order.total)}</strong> · espèces<br>
        <small>${escapeHtml(order.created_at)}</small>
      </div>
      <div class="order-actions">
        <button
          class="reply-client"
          type="button"
          onclick="replyToClient(${id},${escapeHtml(JSON.stringify(String(order.telegram_name ?? "")))})"
        >💬 Répondre</button>
        <div class="quick-status">${statusButtons}</div>
      </div>
    </article>
  `;
}

function renderOrders(orders) {
  const orderList = document.getElementById("orders");
  orderList.innerHTML = orders.length
    ? orders.map(renderOrder).join("")
    : '<div class="empty">Aucune commande.</div>';
}

function updateOrderStats(orders) {
  document.getElementById("newCount").textContent =
    orders.filter((order) => order.status === "new").length;
  document.getElementById("cashTotal").textContent = euro(
    orders
      .filter((order) => order.status !== "delivered" && order.status !== "cancelled")
      .reduce((total, order) => total + Number(order.total), 0)
  );
  document.getElementById("readyCount").textContent =
    orders.filter((order) => order.status === "ready").length;
}

function renderProducts() {
  const productList = document.getElementById("products");
  renderPromotionProducts();

  productList.innerHTML = catalogProducts.length
    ? catalogProducts.map((product) => {
      const id = Number(product.id);
      const active = Boolean(product.active);
      return `
        <article class="item product-item">
          <div>
            <b>${escapeHtml(product.name)}</b>
            <p>${escapeHtml(product.sub)} · ${euro(product.price)}</p>
            <span class="product-state ${active ? "active" : "inactive"}">${active ? "Visible" : "Masqué"}</span>
          </div>
          <button
            type="button"
            class="edit-product"
            aria-label="Modifier ${escapeHtml(product.name)}"
            onclick="openProductEditor(${id})"
          >Modifier</button>
        </article>
      `;
    }).join("")
    : '<div class="empty">Aucun produit.</div>';
}

async function load() {
  const refreshButton = document.getElementById("refreshButton");
  if (refreshButton) {
    refreshButton.disabled = true;
    refreshButton.textContent = "Actualisation…";
  }

  try {
    const orders = await api("/api/admin/orders");
    document.getElementById("adminAccessStatus").classList.add("hide");
    document.getElementById("adminApp").classList.remove("hide");
    updateOrderStats(orders);
    renderOrders(orders);

    try {
      catalogProducts = await api("/api/admin/products");
      renderProducts();
    } catch (error) {
      document.getElementById("products").innerHTML =
        `<div class="empty">${escapeHtml(error.message)}</div>`;
    }

    try {
      const promotions = await api("/api/admin/promotions");
      renderPromotions(promotions);
    } catch (error) {
      const promotionList = document.getElementById("promotions");
      if (promotionList) {
        promotionList.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
      }
    }
  } catch (error) {
    const accessStatus = document.getElementById("adminAccessStatus");
    accessStatus.innerHTML =
      '<strong>Accès réservé aux comptes admin.</strong><br>' +
      escapeHtml(error.message) +
      '<br><small>Ouvre la boutique depuis le bot Telegram.</small><br>' +
      '<a href="https://t.me/Bcrvee85_bot" target="_blank" rel="noopener noreferrer">Ouvrir le bot Telegram ↗</a>';
  } finally {
    finishRefresh();
  }
}

// Stock management
async function loadStock() {
  const stockList = await api("/api/admin/stock");
  const container = document.getElementById("stockList");
  if (!container) return;

  container.innerHTML = stockList.length
    ? stockList.map((product) => {
      const stock = Number(product.stock);
      const threshold = Number(product.low_stock_threshold);
      const state = stock === 0
        ? "Rupture"
        : stock <= threshold
          ? "Stock faible"
          : "En stock";
      const id = Number(product.id);

      return `
        <article class="stock-card">
          <div class="stock-info">
            <b>${escapeHtml(product.name)}</b>
            <span class="product-state ${stock > threshold ? "active" : ""}">${state}</span>
          </div>
          <div class="stock-fields">
            <label>
              Quantité
              <input class="stock-input" data-id="${id}" type="number" min="0" max="999999" value="${stock}">
            </label>
            <label>
              Seuil d’alerte
              <input class="threshold-input" data-id="${id}" type="number" min="0" max="999999" value="${threshold}">
            </label>
            <button type="button" class="edit-product" onclick="saveStock(${id})">Enregistrer</button>
          </div>
        </article>
      `;
    }).join("")
    : '<div class="empty">Aucun produit.</div>';
}

async function saveStock(id) {
  const stockInput = document.querySelector(`.stock-input[data-id="${id}"]`);
  const thresholdInput = document.querySelector(`.threshold-input[data-id="${id}"]`);
  if (!stockInput || !thresholdInput) return;

  try {
    await api("/api/admin/stock", {
      method: "PUT",
      body: JSON.stringify({
        id,
        stock: Number(stockInput.value),
        low_stock_threshold: Number(thresholdInput.value),
      }),
    });
    await loadStock();
  } catch (error) {
    alert(error.message);
  }
}

function showAdminTab(tab) {
  document.querySelectorAll("[data-admin-panel]").forEach((panel) => {
    panel.classList.toggle("hide", panel.dataset.adminPanel !== tab);
  });
  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.classList.toggle("on", button.dataset.adminTab === tab);
  });

  if (tab === "stock") {
    loadStock().catch((error) => {
      const container = document.getElementById("stockList");
      if (container) {
        container.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
      }
    });
  }
}

// Quantity promotions
function renderPromotionProducts() {
  const container = document.getElementById("promoProducts");
  if (!container) return;

  container.innerHTML = catalogProducts.length
    ? catalogProducts.map((product) => `
      <label class="promo-product-option">
        <input type="checkbox" value="${Number(product.id)}">
        <span>${escapeHtml(product.name)}</span>
      </label>
    `).join("")
    : "<small>Aucun article disponible.</small>";
}

function toDbDate(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function formatPromoDate(value) {
  if (!value) return "Sans limite";
  return new Date(value.replace(" ", "T") + "Z").toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderPromotions(promotions) {
  const productNames = new Map(
    catalogProducts.map((product) => [Number(product.id), product.name])
  );
  const container = document.getElementById("promotions");
  if (!container) return;

  const now = Date.now();
  container.innerHTML = promotions.length
    ? promotions.map((promotion) => {
      const start = promotion.starts_at
        ? new Date(promotion.starts_at.replace(" ", "T")).getTime()
        : null;
      const end = promotion.ends_at
        ? new Date(promotion.ends_at.replace(" ", "T")).getTime()
        : null;
      const state = !promotion.active
        ? "Désactivée"
        : start && now < start
          ? "Programmée"
          : end && now > end
            ? "Terminée"
            : "Active";
      const targetedProducts = (promotion.product_ids || [])
        .map((id) => escapeHtml(productNames.get(Number(id)) || `Produit #${id}`))
        .join(", ") || "Tous les articles";

      return `
        <article class="item promotion-item">
          <div>
            <b>${Number(promotion.min_qty)} produits → -${Number(promotion.discount_percent).toLocaleString("fr-FR")}%</b>
            <p>Articles : ${targetedProducts}</p>
            <p>${formatPromoDate(promotion.starts_at)} → ${formatPromoDate(promotion.ends_at)}</p>
            <span class="product-state ${state === "Active" ? "active" : ""}">${state}</span>
          </div>
          <button type="button" class="edit-product" onclick="deletePromotion(${Number(promotion.id)})">Supprimer</button>
        </article>
      `;
    }).join("")
    : '<div class="empty">Aucune réduction planifiée.</div>';
}

async function deletePromotion(id) {
  if (!confirm("Supprimer cette réduction ?")) return;

  try {
    await api(`/api/admin/promotions?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    await load();
  } catch (error) {
    alert(error.message);
  }
}

function finishRefresh() {
  const refreshButton = document.getElementById("refreshButton");
  if (refreshButton) {
    refreshButton.disabled = false;
    refreshButton.textContent = "↻ Actualiser";
  }
}

// Order status and client replies
async function setStatus(id, status) {
  const buttons = [...document.querySelectorAll(".status-btn")];
  buttons.forEach((button) => {
    button.disabled = true;
  });

  try {
    await api("/api/admin/orders/status", {
      method: "POST",
      body: JSON.stringify({ id, status }),
    });
    await load();
  } catch (error) {
    alert(error.message);
    buttons.forEach((button) => {
      button.disabled = false;
    });
  }
}

async function replyToClient(id, name) {
  const message = prompt(`Message pour ${name} · commande #${id}`);
  if (message === null) return;
  if (!message.trim()) {
    alert("Écris un message avant d’envoyer.");
    return;
  }

  try {
    await api("/api/admin/orders/reply", {
      method: "POST",
      body: JSON.stringify({ id, message: message.trim() }),
    });
    alert("Message envoyé au client sur Telegram ✅");
  } catch (error) {
    alert(error.message);
  }
}

function openProductEditor(id) {
  const product = catalogProducts.find((item) => Number(item.id) === Number(id));
  if (!product) return;

  document.getElementById("editProductId").value = String(product.id);
  document.getElementById("editProductName").value = product.name || "";
  document.getElementById("editProductSub").value = product.sub || "";
  document.getElementById("editProductPrice").value = Number(product.price).toFixed(2);
  document.getElementById("editProductCat").value = product.cat || "selection";
  document.getElementById("editProductActive").checked = Boolean(product.active);
  document.getElementById("editProductSortOrder").value =
    String(Math.max(1, Number(product.sort_order) || 99));
  document.getElementById("editProductError").textContent = "";
  document.getElementById("editProductPanel").classList.remove("hide");
  document.getElementById("editProductName").focus();
}

function closeProductEditor() {
  document.getElementById("editProductPanel").classList.add("hide");
}

// Product forms and page initialization
function hasProductDraft() {
  const editorOpen = !document.getElementById("editProductPanel").classList.contains("hide");
  const addFormHasInput = [...document.querySelectorAll("#addForm input")]
    .some((input) => input.value.trim());
  return editorOpen || addFormHasInput;
}

function backToShop() {
  const initData = telegramInitData();
  if (initData) {
    try {
      sessionStorage.setItem("bcrve_telegram_init_data", initData);
    } catch {
      // The init data is included in the redirect as a fallback.
    }
    location.href = `/?tgWebAppData=${encodeURIComponent(initData)}`;
  } else {
    location.href = "/";
  }
}

function refreshOrders() {
  load();
}

function handlePromotionSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const error = document.getElementById("promoError");
  const button = form.querySelector('button[type="submit"]');
  if (error) error.textContent = "";
  if (button) {
    button.disabled = true;
    button.textContent = "Planification…";
  }

  const productIds = [...document.querySelectorAll("#promoProducts input:checked")]
    .map((input) => Number(input.value));
  const payload = {
    min_qty: Number(document.getElementById("promoQty").value),
    discount_percent: Number(document.getElementById("promoPercent").value),
    starts_at: toDbDate(document.getElementById("promoStart").value),
    ends_at: toDbDate(document.getElementById("promoEnd").value),
    product_ids: productIds,
  };

  api("/api/admin/promotions", {
    method: "POST",
    body: JSON.stringify(payload),
  })
    .then(() => {
      form.reset();
      return load();
    })
    .catch((submitError) => {
      if (error) error.textContent = submitError.message;
    })
    .finally(() => {
      if (button) {
        button.disabled = false;
        button.textContent = "Planifier la réduction";
      }
    });
}

function handleProductEditSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const error = document.getElementById("editProductError");
  const button = form.querySelector('button[type="submit"]');
  if (error) error.textContent = "";
  if (button) {
    button.disabled = true;
    button.textContent = "Enregistrement…";
  }

  const product = {
    id: Number(document.getElementById("editProductId").value),
    name: document.getElementById("editProductName").value,
    sub: document.getElementById("editProductSub").value,
    price: Number(document.getElementById("editProductPrice").value),
    cat: document.getElementById("editProductCat").value,
    active: document.getElementById("editProductActive").checked,
    sort_order: Number(document.getElementById("editProductSortOrder").value),
  };

  api("/api/admin/products", {
    method: "PUT",
    body: JSON.stringify(product),
  })
    .then(() => {
      closeProductEditor();
      return load();
    })
    .catch((submitError) => {
      if (error) error.textContent = submitError.message;
    })
    .finally(() => {
      if (button) {
        button.disabled = false;
        button.textContent = "Enregistrer";
      }
    });
}

function handleProductAddSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const error = document.getElementById("addError");
  const button = form.querySelector('button[type="submit"]');
  if (error) error.textContent = "";
  if (button) {
    button.disabled = true;
    button.textContent = "Ajout…";
  }

  const product = {
    name: document.getElementById("pName").value,
    sub: document.getElementById("pSub").value,
    price: Number(document.getElementById("pPrice").value),
    cat: document.getElementById("pCat").value,
  };

  api("/api/admin/products", {
    method: "POST",
    body: JSON.stringify(product),
  })
    .then(() => {
      form.reset();
      return load();
    })
    .catch((submitError) => {
      if (error) error.textContent = submitError.message;
    })
    .finally(() => {
      if (button) {
        button.disabled = false;
        button.textContent = "Ajouter";
      }
    });
}

document.getElementById("promotionForm").addEventListener("submit", handlePromotionSubmit);
document.getElementById("editProductForm").addEventListener("submit", handleProductEditSubmit);
document.getElementById("addForm").addEventListener("submit", handleProductAddSubmit);

load();
setInterval(() => {
  if (!hasProductDraft()) load();
}, 30000);
