const tg=window.Telegram?.WebApp;if(tg){tg.ready();tg.expand()}
const telegramInitData=()=>{if(tg?.initData)return tg.initData;try{const params=new URLSearchParams(location.search);return params.get("tgWebAppData")||new URLSearchParams(location.hash.slice(1)).get("tgWebAppData")||""}catch(e){return""}};
const headers=()=>{let initData=telegramInitData();if(!initData){try{initData=sessionStorage.getItem("bcrve_telegram_init_data")||""}catch(e){}}return{"X-Telegram-Init-Data":initData}};
const euro=n=>Number(n).toLocaleString("fr-FR",{style:"currency",currency:"EUR"});
let catalogProducts=[];
async function api(url,opt={}){opt.headers={...(opt.headers||{}),...headers(),"content-type":"application/json"};const r=await fetch(url,opt);const d=await r.json();if(!r.ok)throw new Error(d.error||"Erreur");return d}
async function load(){
 let orders;
 const refresh=document.getElementById("refreshButton");
 if(refresh){refresh.disabled=true;refresh.textContent="Actualisation…"} 
 try{
  orders=await api("/api/admin/orders");
  document.getElementById("adminAccessStatus").classList.add("hide");
  document.getElementById("adminApp").classList.remove("hide");
 }catch(e){
  const status=document.getElementById("adminAccessStatus");
  status.innerHTML='<strong>Accès réservé aux comptes admin.</strong><br>'+esc(e.message)+'<br><small>Ouvre la boutique depuis le bot Telegram.</small><br><a href="https://t.me/Bcrvee85_bot" target="_blank" rel="noopener noreferrer">Ouvrir le bot Telegram ↗</a>';
  return;
 }
 const ordersEl=document.getElementById("orders");
 const productsEl=document.getElementById("products");
 document.getElementById("newCount").textContent=orders.filter(o=>o.status==="new").length;
 document.getElementById("cashTotal").textContent=euro(orders.filter(o=>o.status!=="delivered"&&o.status!=="cancelled").reduce((a,o)=>a+Number(o.total),0));
 document.getElementById("readyCount").textContent=orders.filter(o=>o.status==="ready").length;
 ordersEl.innerHTML=orders.length?orders.map(o=>'<article class="item order-card"><div class="order-main"><div class="order-title"><b>#'+Number(o.id)+' · '+esc(o.telegram_name)+'</b><span class="status-pill status-'+esc(o.status)+'">'+label(o.status)+'</span></div><p>'+esc(o.items)+'</p><strong>'+euro(o.total)+'</strong> · espèces<br><small>'+esc(o.created_at)+'</small></div><div class="order-actions"><button class="reply-client" type="button" onclick="replyToClient('+Number(o.id)+',\''+esc(o.telegram_name).replace(/'/g,"&#39;")+'\')">💬 Répondre</button><div class="quick-status">'+["new","preparing","ready","delivered","cancelled"].map(s=>'<button class="status-btn '+(s===o.status?"selected":"")+'" type="button" onclick="setStatus('+Number(o.id)+',\''+s+'\')" '+(s===o.status?"disabled":"")+'>'+label(s)+'</button>').join("")+'</div></div></article>').join(""):'<div class="empty">Aucune commande.</div>';
 try{
  catalogProducts=await api("/api/admin/products");
  renderPromotionProducts();
  productsEl.innerHTML=catalogProducts.map(p=>{
   const id=Number(p.id);
   const active=Boolean(p.active);
   return '<article class="item product-item"><div><b>'+esc(p.name)+'</b><p>'+esc(p.sub)+' · '+euro(p.price)+'</p><span class="product-state '+(active?"active":"inactive")+'">'+(active?"Visible":"Masqué")+'</span></div><button type="button" class="edit-product" aria-label="Modifier '+esc(p.name)+'" onclick="openProductEditor('+id+')">Modifier</button></article>';
  }).join("")||'<div class="empty">Aucun produit.</div>';
 }catch(e){productsEl.innerHTML='<div class="empty">'+esc(e.message)+'</div>'}
 try{
  const promotions=await api("/api/admin/promotions");
  renderPromotions(promotions);
 }catch(e){
  const el=document.getElementById("promotions");
  if(el)el.innerHTML='<div class="empty">'+esc(e.message)+'</div>';
 }
}
async function loadStock(){
 const list=await api("/api/admin/stock");
 const el=document.getElementById("stockList"); if(!el)return;
 el.innerHTML=list.map(p=>{
  const stock=Number(p.stock), threshold=Number(p.low_stock_threshold);
  const state=stock===0?"Rupture":(stock<=threshold?"Stock faible":"En stock");
  return '<article class="stock-card"><div class="stock-info"><b>'+esc(p.name)+'</b><span class="product-state '+(stock>threshold?"active":"")+'">'+state+'</span></div><div class="stock-fields"><label>Quantité<input class="stock-input" data-id="'+Number(p.id)+'" type="number" min="0" max="999999" value="'+stock+'"></label><label>Seuil d’alerte<input class="threshold-input" data-id="'+Number(p.id)+'" type="number" min="0" max="999999" value="'+threshold+'"></label><button type="button" class="edit-product" onclick="saveStock('+Number(p.id)+')">Enregistrer</button></div></article>';
 }).join("")||'<div class="empty">Aucun produit.</div>';
}
async function saveStock(id){
 const stock=Number(document.querySelector('.stock-input[data-id="'+id+'"]').value);
 const threshold=Number(document.querySelector('.threshold-input[data-id="'+id+'"]').value);
 try{await api("/api/admin/stock",{method:"PUT",body:JSON.stringify({id,stock,low_stock_threshold:threshold})});await loadStock()}catch(e){alert(e.message)}
}
function showAdminTab(tab){
 document.querySelectorAll("[data-admin-panel]").forEach(el=>el.classList.toggle("hide",el.dataset.adminPanel!==tab));
 document.querySelectorAll("[data-admin-tab]").forEach(el=>el.classList.toggle("on",el.dataset.adminTab===tab));
 if(tab==="stock")loadStock().catch(e=>{const el=document.getElementById("stockList");if(el)el.innerHTML='<div class="empty">'+esc(e.message)+'</div>'});
}
function renderPromotionProducts(){
 const el=document.getElementById("promoProducts"); if(!el)return;
 el.innerHTML=catalogProducts.length?catalogProducts.map(p=>'<label class="promo-product-option"><input type="checkbox" value="'+Number(p.id)+'"> <span>'+esc(p.name)+'</span></label>').join(""):'<small>Aucun article disponible.</small>';
}

function formatPromoDate(value){
 if(!value)return "Sans limite";
 return new Date(value.replace(" ","T")+"Z").toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
}
function renderPromotions(list){
 const names=new Map(catalogProducts.map(p=>[Number(p.id),p.name]));

 const el=document.getElementById("promotions");
 if(!el)return;
 const now=Date.now();
 el.innerHTML=list.length?list.map(p=>{
  const start=p.starts_at?new Date(p.starts_at.replace(" ","T")).getTime():null;
  const end=p.ends_at?new Date(p.ends_at.replace(" ","T")).getTime():null;
  const state=!p.active?"Désactivée":(start&&now<start?"Programmée":(end&&now>end?"Terminée":"Active"));
  return '<article class="item promotion-item"><div><b>'+Number(p.min_qty)+' produits → -'+Number(p.discount_percent).toLocaleString("fr-FR")+'%</b><p>Articles : '+((p.product_ids||[]).map(id=>esc(names.get(Number(id))||("Produit #"+id))).join(", ")||"Tous les articles")+'</p><p>'+formatPromoDate(p.starts_at)+' → '+formatPromoDate(p.ends_at)+'</p><span class="product-state '+(state==="Active"?"active":"")+'">'+state+'</span></div><button type="button" class="edit-product" onclick="deletePromotion('+Number(p.id)+')">Supprimer</button></article>';
 }).join(""):'<div class="empty">Aucune réduction planifiée.</div>';
}
async function deletePromotion(id){
 if(!confirm("Supprimer cette réduction ?"))return;
 try{await api("/api/admin/promotions?id="+encodeURIComponent(id),{method:"DELETE"});await load()}catch(e){alert(e.message)}
}
document.getElementById("promotionForm").addEventListener("submit",async event=>{
 event.preventDefault();
 const form=event.currentTarget,error=document.getElementById("promoError"),button=form.querySelector('button[type="submit"]');
 if(error)error.textContent="";
 if(button){button.disabled=true;button.textContent="Planification…"}
 try{
  await api("/api/admin/promotions",{method:"POST",body:JSON.stringify({
   min_qty:Number(document.getElementById("promoQty").value),
   discount_percent:Number(document.getElementById("promoPercent").value),
   starts_at:toDbDate(document.getElementById("promoStart").value),
   ends_at:toDbDate(document.getElementById("promoEnd").value),
   product_ids:[...document.querySelectorAll("#promoProducts input:checked")].map(input=>Number(input.value))
  })});
  form.reset();
  await load();
 }catch(e){if(error)error.textContent=e.message}
 finally{if(button){button.disabled=false;button.textContent="Planifier la réduction"}}
});
function finishRefresh(){const refresh=document.getElementById("refreshButton");if(refresh){refresh.disabled=false;refresh.textContent="↻ Actualiser"}}
function label(s){return ({new:"Nouvelle",preparing:"Préparation",ready:"Prête",delivered:"Remise",cancelled:"Annulée"})[s]||s}
async function setStatus(id,status){
  const buttons=[...document.querySelectorAll(".status-btn")];
  buttons.forEach(b=>b.disabled=true);
  try{
    await api("/api/admin/orders/status",{method:"POST",body:JSON.stringify({id,status})});
    await load();
  }catch(e){
    alert(e.message);
    buttons.forEach(b=>b.disabled=false);
  }
}
async function replyToClient(id,name){
 const message=prompt("Message pour "+name+" · commande #"+id);
 if(message===null)return;
 if(!message.trim())return alert("Écris un message avant d’envoyer.");
 try{
  await api("/api/admin/orders/reply",{method:"POST",body:JSON.stringify({id,message:message.trim()})});
  alert("Message envoyé au client sur Telegram ✅");
 }catch(e){alert(e.message)}
}
function openProductEditor(id){
 const product=catalogProducts.find(item=>Number(item.id)===Number(id));
 if(!product)return;
 document.getElementById("editProductId").value=String(product.id);
 document.getElementById("editProductName").value=product.name||"";
 document.getElementById("editProductSub").value=product.sub||"";
 document.getElementById("editProductPrice").value=Number(product.price).toFixed(2);
 document.getElementById("editProductCat").value=product.cat||"selection";
 document.getElementById("editProductActive").checked=Boolean(product.active);
 document.getElementById("editProductSortOrder").value=String(Math.max(1,Number(product.sort_order)||99));
 document.getElementById("editProductError").textContent="";
 document.getElementById("editProductPanel").classList.remove("hide");
 document.getElementById("editProductName").focus();
}
function closeProductEditor(){document.getElementById("editProductPanel").classList.add("hide")}
document.getElementById("editProductForm").addEventListener("submit",async event=>{
 event.preventDefault();
 const form=event.currentTarget;
 const error=document.getElementById("editProductError");
 const button=form.querySelector('button[type="submit"]');
 if(error)error.textContent="";
 if(button){button.disabled=true;button.textContent="Enregistrement…"}
 try{
  await api("/api/admin/products",{method:"PUT",body:JSON.stringify({id:Number(document.getElementById("editProductId").value),name:document.getElementById("editProductName").value,sub:document.getElementById("editProductSub").value,price:Number(document.getElementById("editProductPrice").value),cat:document.getElementById("editProductCat").value,active:document.getElementById("editProductActive").checked,sort_order:Number(document.getElementById("editProductSortOrder").value)})});
  closeProductEditor();
  await load();
 }catch(e){if(error)error.textContent=e.message}
 finally{if(button){button.disabled=false;button.textContent="Enregistrer"}}
});
document.getElementById("addForm").addEventListener("submit",async event=>{
 event.preventDefault();
 const form=event.currentTarget;
 const error=document.getElementById("addError");
 const button=form.querySelector('button[type="submit"]');
 if(error)error.textContent="";
 if(button){button.disabled=true;button.textContent="Ajout…"}
 try{
  await api("/api/admin/products",{method:"POST",body:JSON.stringify({name:document.getElementById("pName").value,sub:document.getElementById("pSub").value,price:Number(document.getElementById("pPrice").value),cat:document.getElementById("pCat").value})});
  form.reset();
  await load();
 }catch(e){if(error)error.textContent=e.message}
 finally{if(button){button.disabled=false;button.textContent="Ajouter"}}
});
function hasProductDraft(){return !document.getElementById("editProductPanel").classList.contains("hide")||[...document.querySelectorAll("#addForm input")].some(input=>input.value.trim())}

function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
load();setInterval(()=>{if(!hasProductDraft())load()},30000);

function refreshOrders(){load()}
