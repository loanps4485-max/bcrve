const tg=window.Telegram?.WebApp;if(tg){tg.ready();tg.expand()}
let modalReturnFocus=null;
const telegramInitData=()=>{if(tg?.initData)return tg.initData;try{return new URLSearchParams(location.hash.slice(1)).get("tgWebAppData")||""}catch(e){return""}};
async function checkAdmin(){
  const el=document.getElementById("adminBar");
  const hint=document.getElementById("adminAccessHint");
  if(!el)return;
  el.classList.add("hide");
  hint?.classList.add("hide");
  const initData=telegramInitData();const telegramLaunch=Boolean(initData)||/(?:^|[&#])tgWebApp(?:Data|Version|Platform)=/.test(location.hash);
  if(!telegramLaunch)return;
  if(!initData){
    if(hint){hint.textContent="Session Telegram absente. Ouvre la boutique depuis le bouton de @Bcrvee85_bot.";hint.classList.remove("hide")}
    return;
  }
  try{
    const response=await fetch("/api/admin/check",{headers:{"X-Telegram-Init-Data":initData},cache:"no-store"});
    if(response.ok){el.classList.remove("hide");return}
    const result=await response.json().catch(()=>({}));
    if(hint){
      hint.textContent=result.error||`Vérification admin indisponible (${response.status}).`;
      hint.classList.remove("hide");
    }
  }catch(e){
    if(hint){hint.textContent="Vérification admin indisponible. Réessaie dans un instant.";hint.classList.remove("hide")}
  }
}
function openAdmin(){const initData=telegramInitData();if(!initData){toast("Session Telegram absente. Ferme puis rouvre la boutique depuis le bot.");return}try{sessionStorage.setItem("bcrve_telegram_init_data",initData)}catch(e){}if(tg?.HapticFeedback)tg.HapticFeedback.impactOccurred("light");location.href="/admin.html?tgWebAppData="+encodeURIComponent(initData)}
let products=[];let promotions=[];let currentCategory="all";let orderWatchTimer=null;let favoriteIds=[];try{const storedFavorites=JSON.parse(localStorage.getItem("bcrve85_favorites")||"[]");if(Array.isArray(storedFavorites))favoriteIds=[...new Set(storedFavorites.map(Number).filter(id=>Number.isInteger(id)&&id>0))]}catch(e){try{localStorage.removeItem("bcrve85_favorites")}catch(ignore){}}let cartData=[];try{const stored=JSON.parse(localStorage.getItem("bcrve85_cart")||"[]");if(Array.isArray(stored))cartData=stored.filter(x=>x&&Number.isInteger(Number(x.id))&&Number(x.id)>0&&Number.isInteger(Number(x.qty))&&Number(x.qty)>0).map(x=>({id:Number(x.id),qty:Math.min(99,Number(x.qty))}))}catch(e){try{localStorage.removeItem("bcrve85_cart")}catch(ignore){}}const euro=n=>Number(n).toLocaleString("fr-FR",{style:"currency",currency:"EUR"});const save=()=>{try{localStorage.setItem("bcrve85_cart",JSON.stringify(cartData))}catch(e){}update()};function update(){const el=document.getElementById("count");if(el)el.textContent=cartData.reduce((a,x)=>a+x.qty,0)}
async function loadProducts(){try{const [productsResponse,promotionsResponse]=await Promise.all([fetch("/api/products"),fetch("/api/promotions")]);if(!productsResponse.ok)throw new Error();products=await productsResponse.json();promotions=promotionsResponse.ok?await promotionsResponse.json():[];render();update()}catch(e){document.getElementById("products").innerHTML='<div class="empty">Catalogue indisponible pour le moment.</div>'}}
function render(cat=currentCategory){currentCategory=cat;document.getElementById("chips").innerHTML=[["all","Tout"],["selection","Sélection"],["edition","Édition"],["packs","Packs"]].map(x=>`<button type="button" class="chip ${x[0]===cat?"on":""}" aria-pressed="${x[0]===cat}" onclick="render('${x[0]}')">${x[1]}</button>`).join("");const list=cat==="all"?products:products.filter(p=>p.cat===cat);document.getElementById("products").innerHTML=list.length?list.map(p=>{const id=Number(p.id);const isFavorite=favoriteIds.includes(id);
    const stock=Number(p.stock);
    const soldOut=stock===0;return `<article class="card"><div class="visual"><span>JUL · 13</span></div><div class="info"><div class="name">${escapeHtml(p.name)}</div><div class="sub">${escapeHtml(p.sub||"")}</div><div class="sub stock-label ${soldOut?"sold-out":""}">${soldOut?"Rupture de stock":stock+" disponible(s)"}</div><div class="row"><span class="price">${euro(p.price)}</span><div class="actions"><button type="button" class="favorite-toggle ${isFavorite?"on":""}" aria-label="${isFavorite?"Retirer des favoris":"Ajouter aux favoris"}" aria-pressed="${isFavorite}" onclick="toggleFavorite(${id})">${isFavorite?"♥":"♡"}</button><button type="button" class="add" ${soldOut?"disabled":""} aria-label="Ajouter ${escapeHtml(p.name)} au panier" onclick="add(${id})">+</button></div></div></div></article>`}).join(""):'<div class="empty">Aucun article dans cette sélection.</div>'}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}function add(id){
  const product=products.find(p=>p.id===id);
  if(product&&Number(product.stock)===0){toast("Produit en rupture de stock");return}let x=cartData.find(x=>x.id===id);if(x){if(x.qty>=99){toast("Maximum 99 par produit");return}x.qty++}else cartData.push({id,qty:1});save();toast("Ajouté · c’est carré 😎") }
function changeQty(id,delta){let x=cartData.find(x=>x.id===id);if(!x)return;const next=Math.max(0,Math.min(99,x.qty+delta));if(next===0)cartData=cartData.filter(x=>x.id!==id);else x.qty=next;save();cart()}
function getCartPromotion(){
 const candidates=promotions.map(p=>{
  const ids=Array.isArray(p.product_ids)?p.product_ids:[];
  const eligible=ids.length?cartData.filter(x=>ids.includes(Number(x.id))):cartData;
  return {p,qty:eligible.reduce((sum,x)=>sum+x.qty,0),subtotal:eligible.reduce((sum,x)=>{const product=products.find(y=>y.id===x.id);return sum+(product?product.price*x.qty:0)},0)};
 }).filter(x=>x.qty>=Number(x.p.min_qty)&&x.subtotal>0);
 return candidates.sort((a,b)=>Number(b.p.min_qty)-Number(a.p.min_qty)||Number(b.p.discount_percent)-Number(a.p.discount_percent))[0]||null;
}
function cart(btn){
 if(btn)nav(btn);
 let subtotal=cartData.reduce((sum,x)=>{let p=products.find(p=>p.id===x.id);return sum+(p?p.price*x.qty:0)},0);
 subtotal=Math.round(subtotal*100)/100;
 const promoMatch=getCartPromotion();
 const promo=promoMatch?.p||null;
 const discountQty=promoMatch?Math.min(Number(promo.min_qty),Number(promoMatch.qty)):0;
 const discountedQtyById=new Map();
 let remainingDiscountQty=discountQty;
 if(promoMatch){
   const ids=Array.isArray(promo.product_ids)?promo.product_ids:[];
   for(const item of cartData){
     if(ids.length&&!ids.includes(Number(item.id)))continue;
     const qtyForDiscount=Math.min(item.qty,Math.max(0,remainingDiscountQty));
     if(qtyForDiscount>0)discountedQtyById.set(Number(item.id),qtyForDiscount);
     remainingDiscountQty-=qtyForDiscount;
     if(remainingDiscountQty<=0)break;
   }
 }
 const discountBase=cartData.reduce((sum,x)=>{const p=products.find(p=>p.id===x.id);const q=discountedQtyById.get(Number(x.id))||0;return sum+(p?p.price*q:0)},0);
 const discount=promoMatch?Math.round(discountBase*Number(promo.discount_percent))/100:0;
 const total=Math.round((subtotal-discount)*100)/100;
 let lines=cartData.map(x=>{let p=products.find(p=>p.id===x.id);if(!p)return "";
   const discountedQty=discountedQtyById.get(Number(x.id))||0;
   const normalQty=Math.max(0,x.qty-discountedQty);
   const discountedUnitPrice=p.price*(1-Number(promo?.discount_percent||0)/100);
   const lineTotal=(discountedQty*discountedUnitPrice)+(normalQty*p.price);
   const priceInfo=discountedQty>0?'<div class="sub"><s>'+euro(p.price)+'</s> '+euro(discountedUnitPrice)+' / unité · '+discountedQty+' remisée(s)'+(normalQty>0?' · '+normalQty+' au tarif normal':'')+'</div>':'<div class="sub">'+euro(p.price)+' / unité</div>';
   return '<div class="line cart-line"><div class="cart-product"><b>'+escapeHtml(p.name)+'</b>'+priceInfo+'</div><div class="cart-controls"><div class="qty-total">'+euro(lineTotal)+'</div><div class="qty-buttons"><button type="button" onclick="changeQty('+p.id+',-10)" '+(x.qty<=1?"disabled":"")+'">−10</button><button type="button" onclick="changeQty('+p.id+',-5)" '+(x.qty<=1?"disabled":"")+'">−5</button><button type="button" onclick="changeQty('+p.id+',-1)" '+(x.qty<=1?"disabled":"")+'">−1</button><strong>'+x.qty+'</strong><button type="button" onclick="changeQty('+p.id+',1)">+1</button><button type="button" onclick="changeQty('+p.id+',5)">+5</button><button type="button" onclick="changeQty('+p.id+',10)">+10</button></div></div></div>'}).join("");
 const promoNotice=promo?'<div class="notice discount-notice">🎉 Remise quantité : <b>-'+Number(promo.discount_percent).toLocaleString("fr-FR")+'%</b> ('+discountQty+' articles concernés)<br><span>Sous-total : '+euro(subtotal)+' · Économie : '+euro(discount)+'</span></div>':promotions.length?'<div class="notice">Ajoute plus de produits pour débloquer une remise quantité.</div>':"";
 show('<button class="close" onclick="closeModal()">×</button><h3>Votre panier</h3>'+(lines||'<div class="empty">Votre panier est vide.</div>')+(cartData.length?'<div class="line"><b>Sous-total</b><b>'+euro(subtotal)+'</b></div>'+promoNotice+'<div class="line"><b>Total</b><b>'+euro(total)+'</b></div><div class="notice">Paiement : <b>espèces</b> lors de la remise.</div><button class="full" onclick="order()">Confirmer la commande</button>':""));
}
function removeItem(id){let x=cartData.find(x=>x.id===id);if(!x)return;x.qty--;if(x.qty<=0)cartData=cartData.filter(x=>x.id!==id);save();cart()}
async function order(){const initData=telegramInitData();if(!initData){show(`<button class="close" onclick="closeModal()" aria-label="Fermer">×</button><h3>Ouvrez la boutique dans Telegram</h3><p>La commande doit être validée depuis Telegram.</p><div class="notice">Ouvre @Bcrvee85_bot puis touche le bouton de la boutique.</div><a class="share-bot" href="https://t.me/Bcrvee85_bot" target="_blank" rel="noopener noreferrer">Ouvrir le bot Telegram ↗</a>`);return}const items=cartData.map(x=>({id:x.id,qty:x.qty}));const btn=document.querySelector(".full");if(btn){btn.disabled=true;btn.textContent="Envoi…"}try{const r=await fetch("/api/orders",{method:"POST",headers:{"content-type":"application/json","X-Telegram-Init-Data":initData},body:JSON.stringify({items})});const data=await r.json();if(!r.ok)throw new Error(data.error||"Erreur");cartData=[];save();const notificationNote=data.notifications_delivered<2?'<p class="sub">Une alerte Telegram n’a pas été remise. La commande reste visible dans le panneau admin.</p>':"";show(`<h3>Commande enregistrée 🎉</h3><p>Votre commande <b>#${data.order_id}</b> est bien enregistrée.</p>${notificationNote}<div class="notice"><b>Paiement :</b> espèces<br><b>Total :</b> ${euro(data.total)}${Number(data.discount)>0?`<br><b>Remise quantité :</b> -${euro(data.discount)} (${Number(data.discount_percent).toLocaleString("fr-FR")}%)`:""}<br><b>Statut :</b> 🆕 Nouvelle</div><button class="full" onclick="orders()">📦 Suivre ma commande</button><button class="full secondary-action" onclick="closeModal()">Fermer</button>`)}catch(e){if(btn){btn.disabled=false;btn.textContent="Confirmer la commande"}const message=e.message||"Erreur";if(/session\s+Telegram|signature\s+Telegram|identité\s+Telegram|authentification serveur/i.test(message)){show(`<button class="close" onclick="closeModal()">×</button><h3>Session Telegram à renouveler</h3><p>${escapeHtml(message)}</p><div class="notice">Ferme la Mini App, retourne au chat ${escapeHtml("@Bcrvee85_bot")}, puis rouvre-la depuis son bouton. Ton panier est conservé.</div><button class="full" onclick="closeModal()">Compris</button>`)}else toast(message)}}
async function profile(){const initData=telegramInitData();const hasSession=Boolean(initData);show(`<button class="close" onclick="closeModal()">×</button><h3>Votre espace</h3><div class="line"><span>Session Telegram</span><span>${hasSession?"Présente":"Absente"}</span></div><div class="line"><span>Accès admin</span><span id="adminAccessState">${hasSession?"Vérification serveur…":"Ouvre la boutique dans Telegram"}</span></div><div class="line"><span>Paiement</span><span>Espèces</span></div>${hasSession?'<button class="full" onclick="orders()">📦 Mes commandes & statut</button>':""}`);if(!hasSession){const link=document.createElement("a");link.className="share-bot";link.href="https://t.me/Bcrvee85_bot";link.target="_blank";link.rel="noopener noreferrer";link.textContent="Ouvrir le bot Telegram ↗";document.getElementById("sheet").appendChild(link);return}try{const response=await fetch("/api/admin/check",{headers:{"X-Telegram-Init-Data":initData},cache:"no-store"});const result=await response.json().catch(()=>({}));const state=document.getElementById("adminAccessState");if(state)state.textContent=response.ok?"Autorisé":result.error||`Vérification indisponible (${response.status})`}catch(e){const state=document.getElementById("adminAccessState");if(state)state.textContent="Service temporairement indisponible"}}
const orderStatusMeta={new:["🆕","Nouvelle"],preparing:["👨‍🍳","En préparation"],ready:["✅","Prête"],delivered:["📦","Remise"],cancelled:["❌","Annulée"]};
function orderProgress(status){
  const steps=["new","preparing","ready","delivered"];
  if(status==="cancelled")return "";
  const current=Math.max(0,steps.indexOf(status));
  return `<div class="order-progress" aria-label="Progression de la commande">${steps.map((s,i)=>`<span class="${i<=current?"done":""}">${orderStatusMeta[s][0]}</span>`).join("")}</div>`;
}
function renderOrders(list){
  const content=list.length?list.map(o=>{
    const meta=orderStatusMeta[o.status]||["ℹ️",o.status];
    const date=o.created_at?new Date(o.created_at.replace(" ","T")+"Z").toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"";
    return `<div class="line order-history"><div style="flex:1"><b>Commande #${Number(o.id)}</b><div class="sub">${escapeHtml(date)} · ${escapeHtml(o.payment==="cash"?"Espèces":o.payment)}</div>${orderProgress(o.status)}${o.status==="cancelled"?'<div class="sub">Commande annulée</div>':""}</div><div style="text-align:right"><b>${euro(o.total)}</b><div class="sub status-text">${meta[0]} ${escapeHtml(meta[1])}</div></div></div>`;
  }).join(""):'<div class="empty">Aucune commande pour le moment.</div>';
  const sheet=document.getElementById("sheet");
  if(!sheet)return;
  sheet.innerHTML=`<button class="close" onclick="closeModal()">×</button><h3>Mes commandes</h3><p class="sub">Le statut se met à jour automatiquement.</p><div id="ordersList">${content}</div>`;
}
async function loadMyOrders(){
  const initData=telegramInitData();
  if(!initData)return;
  try{
    const r=await fetch("/api/orders",{headers:{"X-Telegram-Init-Data":initData},cache:"no-store"});
    const data=await r.json();
    if(!r.ok)throw new Error(data.error||"Erreur");
    renderOrders(Array.isArray(data)?data:[]);
  }catch(e){
    const el=document.getElementById("ordersList");
    if(el)el.innerHTML=`<div class="empty">${escapeHtml(e.message||"Impossible de charger les commandes.")}</div>`;
  }
}
async function orders(){
  if(orderWatchTimer)clearInterval(orderWatchTimer);
  show('<button class="close" onclick="closeModal()">×</button><h3>Mes commandes</h3><div id="ordersList" class="empty">Chargement…</div>');
  await loadMyOrders();
  orderWatchTimer=setInterval(loadMyOrders,3000);
}

function favorites(btn){if(btn)nav(btn);const items=products.filter(p=>favoriteIds.includes(Number(p.id)));const content=items.length?items.map(p=>{const id=Number(p.id);return `<div class="line"><div><b>${escapeHtml(p.name)}</b><div class="sub">${escapeHtml(p.sub||"")}</div><strong>${euro(p.price)}</strong></div><div class="favorite-actions"><button type="button" class="favorite-remove" onclick="removeFavorite(${id})">Retirer</button><button type="button" class="add" aria-label="Ajouter ${escapeHtml(p.name)} au panier" onclick="add(${id})">+</button></div></div>`}).join(""):'<div class="empty">Aucun favori pour le moment.<br><span class="sub">Touche le cœur sur un article pour le garder ici.</span></div>';show(`<button class="close" onclick="closeModal()">×</button><h3>Mes favoris</h3>${content}`)}
function toggleFavorite(id){const productId=Number(id);const exists=favoriteIds.includes(productId);favoriteIds=exists?favoriteIds.filter(value=>value!==productId):[...favoriteIds,productId];try{localStorage.setItem("bcrve85_favorites",JSON.stringify(favoriteIds))}catch(e){}render();toast(exists?"Retiré des favoris":"Ajouté aux favoris")}
function removeFavorite(id){const productId=Number(id);favoriteIds=favoriteIds.filter(value=>value!==productId);try{localStorage.setItem("bcrve85_favorites",JSON.stringify(favoriteIds))}catch(e){}render();favorites();toast("Retiré des favoris")}
async function shareShop(){const link=location.origin+"/";const details={title:"BCRVE85 — Boutique",text:"Découvre la boutique BCRVE85. Pour commander, ouvre la Mini App depuis Telegram.",url:link};if(typeof navigator.share==="function"){try{await navigator.share(details);return}catch(e){if(e?.name==="AbortError")return}}try{await navigator.clipboard.writeText(link);toast("Lien copié · partage-le où tu veux")}catch(e){show(`<button class="close" onclick="closeModal()">×</button><h3>Partager la boutique</h3><p>Copie le lien ci-dessous pour l’envoyer où tu veux.</p><input class="share-url" id="shareUrl" readonly value="${escapeHtml(link)}"><button class="full" onclick="copyShopLink()">Copier le lien</button><p class="sub">Pour commander, ouvre la Mini App depuis Telegram.</p><a class="share-bot" href="https://t.me/Bcrvee85_bot" target="_blank" rel="noopener noreferrer">Ouvrir le bot Telegram ↗</a>`);const input=document.getElementById("shareUrl");if(input){input.focus();input.select()}}}
async function copyShopLink(){const input=document.getElementById("shareUrl");try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(location.origin+"/");else if(input){input.focus();input.select();if(!document.execCommand("copy"))throw new Error("copy unavailable")}toast("Lien copié · partage-le où tu veux")}catch(e){if(input){input.focus();input.select();toast("Lien sélectionné · copie-le pour le partager")}else toast("Copie indisponible dans ce navigateur")}}
function show(html){
  const modal=document.getElementById("modal");
  const sheet=document.getElementById("sheet");
  if(modal.classList.contains("hide"))modalReturnFocus=document.activeElement;
  sheet.innerHTML=html;
  modal.classList.remove("hide");
  Object.assign(modal.style,{position:"fixed",left:"0",top:"0",right:"0",bottom:"0",width:"100vw",height:"100dvh",zIndex:"10000",display:"block",padding:"0",margin:"0",background:"rgba(0,0,0,.42)",overflow:"hidden"});
  Object.assign(sheet.style,{position:"fixed",left:"50%",top:"50%",transform:"translate(-50%,-50%)",boxSizing:"border-box",display:"block",width:"min(430px,calc(100vw - 32px))",maxWidth:"calc(100vw - 32px)",maxHeight:"calc(100dvh - 120px)",margin:"0",padding:"20px 18px 22px",background:"#fffdfa",color:"#181817",borderRadius:"24px",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.22)",zIndex:"10001"});
  sheet.scrollTop=0;
  const title=sheet.querySelector("h3");
  if(title){title.id="modalTitle";sheet.setAttribute("aria-labelledby","modalTitle")}
  sheet.querySelector(".close,button,input,select,textarea,[href]")?.focus({preventScroll:true});
}
function closeModal(){if(orderWatchTimer){clearInterval(orderWatchTimer);orderWatchTimer=null}const modal=document.getElementById("modal");modal.classList.add("hide");modal.style.display="none";if(modalReturnFocus?.isConnected)modalReturnFocus.focus({preventScroll:true});modalReturnFocus=null}
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!document.getElementById("modal").classList.contains("hide"))closeModal()});
function home(btn){window.scrollTo({top:0,behavior:"smooth"});nav(btn)}function shop(btn){document.getElementById("shop").scrollIntoView({behavior:"smooth"});nav(btn)}function nav(btn){document.querySelectorAll("nav button").forEach(x=>x.classList.remove("active"));if(btn)btn.classList.add("active")}function toast(t){let d=document.createElement("div");d.textContent=t;d.setAttribute("role","status");d.setAttribute("aria-live","polite");Object.assign(d.style,{position:"fixed",bottom:"95px",left:"50%",transform:"translateX(-50%)",background:"#181817",color:"#fff",padding:"11px 16px",borderRadius:"99px",zIndex:99,fontSize:"12px"});document.body.appendChild(d);setTimeout(()=>d.remove(),1600)}loadProducts();checkAdmin();
