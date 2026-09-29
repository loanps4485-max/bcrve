const tg=window.Telegram?.WebApp;if(tg){tg.ready();tg.expand()}
const products=[
{id:1,name:"Sélection Signature",sub:"Format découverte",price:8.90,cat:"selection"},
{id:2,name:"Édition Privée",sub:"Format premium",price:12.90,cat:"edition"},
{id:3,name:"Duo Essentiel",sub:"2 références",price:15.90,cat:"packs"},
{id:4,name:"Collection No. 04",sub:"Sélection du moment",price:10.90,cat:"selection"},
{id:5,name:"Édition Noire",sub:"Série limitée",price:14.90,cat:"edition"},
{id:6,name:"Pack Découverte",sub:"3 références",price:21.90,cat:"packs"}];
let cartData=JSON.parse(localStorage.getItem("bcrve85_cart")||"[]");
const euro=n=>n.toLocaleString("fr-FR",{style:"currency",currency:"EUR"});
const save=()=>{localStorage.setItem("bcrve85_cart",JSON.stringify(cartData));update()};
function update(){let n=cartData.reduce((a,x)=>a+x.qty,0);document.getElementById("count").textContent=n}
function render(cat="all"){document.getElementById("chips").innerHTML=[["all","Tout"],["selection","Sélection"],["edition","Édition"],["packs","Packs"]].map(x=>`<button class="chip ${x[0]===cat?"on":""}" onclick="render('${x[0]}')">${x[1]}</button>`).join("");let list=cat==="all"?products:products.filter(p=>p.cat===cat);document.getElementById("products").innerHTML=list.map(p=>`<article class="card"><div class="visual"><span>85</span></div><div class="info"><div class="name">${p.name}</div><div class="sub">${p.sub}</div><div class="row"><span class="price">${euro(p.price)}</span><button class="add" onclick="add(${p.id})">+</button></div></div></article>`).join("")}
function add(id){let x=cartData.find(x=>x.id===id);x?x.qty++:cartData.push({id,qty:1});save();toast("Ajouté au panier")}
function cart(){let lines=cartData.map(x=>{let p=products.find(p=>p.id===x.id);return `<div class="line"><div><b>${p.name}</b><div class="sub">Quantité : ${x.qty}</div></div><div>${euro(p.price*x.qty)}<br><button onclick="removeItem(${p.id})">−</button></div></div>`}).join("");let total=cartData.reduce((a,x)=>a+products.find(p=>p.id===x.id).price*x.qty,0);show(`<button class="close" onclick="closeModal()">×</button><h3>Votre panier</h3>${lines||'<div class="empty">Votre panier est vide.</div>'}${cartData.length?`<div class="line"><b>Total</b><b>${euro(total)}</b></div><div class="notice">Paiement : <b>espèces</b> lors de la remise.</div><button class="full" onclick="order()">Confirmer la commande</button>`:""}`)}
function removeItem(id){let x=cartData.find(x=>x.id===id);if(!x)return;x.qty--;if(x.qty<=0)cartData=cartData.filter(x=>x.id!==id);save();cart()}
function order(){let total=cartData.reduce((a,x)=>a+products.find(p=>p.id===x.id).price*x.qty,0);let payload={action:"create_order",payment:"cash",items:cartData,total,user:tg?.initDataUnsafe?.user||null};if(tg)try{tg.sendData(JSON.stringify(payload))}catch(e){}cartData=[];save();show(`<h3>Commande enregistrée</h3><p>Votre commande a été transmise à BCRVE85.</p><div class="notice"><b>Paiement :</b> espèces<br><b>Total :</b> ${euro(total)}<br><b>Statut :</b> à préparer</div><button class="full" onclick="closeModal()">Fermer</button>`)}
function profile(){show(`<button class="close" onclick="closeModal()">×</button><h3>Votre espace</h3><div class="line"><span>Compte Telegram</span><span>Connecté</span></div><div class="line"><span>Paiement</span><span>Espèces</span></div>`)}
function favorites(){show(`<button class="close" onclick="closeModal()">×</button><h3>Favoris</h3><div class="empty">Les favoris arrivent bientôt.</div>`)}
function show(html){document.getElementById("sheet").innerHTML=html;document.getElementById("modal").classList.remove("hide")}
function closeModal(){document.getElementById("modal").classList.add("hide")}
function home(btn){window.scrollTo({top:0,behavior:"smooth"});nav(btn)}function shop(btn){document.getElementById("shop").scrollIntoView({behavior:"smooth"});nav(btn)}function nav(btn){document.querySelectorAll("nav button").forEach(x=>x.classList.remove("active"));if(btn)btn.classList.add("active")}
function toast(t){let d=document.createElement("div");d.textContent=t;Object.assign(d.style,{position:"fixed",bottom:"95px",left:"50%",transform:"translateX(-50%)",background:"#181817",color:"#fff",padding:"11px 16px",borderRadius:"99px",zIndex:99,fontSize:"12px"});document.body.appendChild(d);setTimeout(()=>d.remove(),1200)}
render();update();