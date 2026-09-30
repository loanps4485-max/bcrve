const tg=window.Telegram?.WebApp;if(tg){tg.ready();tg.expand()}
const telegramInitData=()=>{if(tg?.initData)return tg.initData;try{return new URLSearchParams(location.hash.slice(1)).get("tgWebAppData")||""}catch(e){return""}};
const headers=()=>{let initData=telegramInitData();if(!initData){try{initData=sessionStorage.getItem("bcrve_telegram_init_data")||""}catch(e){}}return{"X-Telegram-Init-Data":initData}};
const euro=n=>Number(n).toLocaleString("fr-FR",{style:"currency",currency:"EUR"});
async function api(url,opt={}){opt.headers={...(opt.headers||{}),...headers(),"content-type":"application/json"};const r=await fetch(url,opt);const d=await r.json();if(!r.ok)throw new Error(d.error||"Erreur");return d}
async function load(){
 try{
  const orders=await api("/api/admin/orders");
  document.getElementById("newCount").textContent=orders.filter(o=>o.status==="new").length;
  document.getElementById("cashTotal").textContent=euro(orders.filter(o=>o.status!=="delivered"&&o.status!=="cancelled").reduce((a,o)=>a+Number(o.total),0));
  document.getElementById("readyCount").textContent=orders.filter(o=>o.status==="ready").length;
  document.getElementById("orders").innerHTML=orders.length?orders.map(o=>`<article class="item"><div><b>#${o.id} · ${esc(o.telegram_name)}</b><p>${esc(o.items)}</p><strong>${euro(o.total)}</strong> · espèces<br><small>${o.created_at}</small></div><select onchange="setStatus(${o.id},this.value)">${["new","preparing","ready","delivered","cancelled"].map(s=>`<option value="${s}" ${s===o.status?"selected":""}>${label(s)}</option>`).join("")}</select></article>`).join(""):'<div class="empty">Aucune commande.</div>';
  const products=await api("/api/admin/products");
  document.getElementById("products").innerHTML=products.map(p=>`<article class="item"><div><b>${esc(p.name)}</b><p>${esc(p.sub)} · ${euro(p.price)}</p></div><span>${p.active?"Actif":"Masqué"}</span></article>`).join("");
 }catch(e){document.getElementById("orders").innerHTML=`<div class="empty">${esc(e.message)}<br><small>Ouvre cette page depuis Telegram avec un compte admin.</small></div>`}
}
function label(s){return ({new:"Nouvelle",preparing:"Préparation",ready:"Prête",delivered:"Remise",cancelled:"Annulée"})[s]||s}
async function setStatus(id,status){try{await api("/api/admin/orders/status",{method:"POST",body:JSON.stringify({id,status})});load()}catch(e){alert(e.message)}}
document.getElementById("addForm").addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/admin/products",{method:"POST",body:JSON.stringify({name:pName.value,sub:pSub.value,price:Number(pPrice.value),cat:pCat.value})});e.target.reset();load()}catch(err){alert(err.message)}})
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
load();setInterval(load,30000);
