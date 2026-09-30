# BCRVE85 V3

V3 = Mini App + Cloudflare Worker + Cloudflare D1 + Telegram.

## 1. Créer la base D1
Dans Cloudflare Dashboard → Workers & Pages → D1 → Create database.
Nom : `bcrve-db`.
Copier le Database ID.

Dans `wrangler.jsonc`, remplacer :
`A_REMPLACER_PAR_LE_DATABASE_ID_CLOUDFLARE`
par le Database ID.

## 2. Initialiser la base
Dans Cloudflare D1, ouvrir la console SQL et exécuter tout le contenu de `schema.sql`.

## 3. Secrets Cloudflare
Ajouter dans le Worker :
- `BOT_TOKEN` = token du bot Telegram
- `ADMIN_IDS` = identifiant Telegram du/des administrateurs, séparés par des virgules

Ne jamais mettre ces valeurs dans GitHub.

## 4. Déploiement
Le Worker utilise `worker.js` et les fichiers statiques du dépôt.

## 5. Admin
Ouvrir `https://TON-DOMAINE/admin.html` depuis Telegram avec un compte présent dans `ADMIN_IDS`.

## Important
La V3 valide `Telegram.WebApp.initData` côté serveur avant de créer une commande.
