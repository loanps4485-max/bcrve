# BCRVE85 — boutique Telegram

Boutique mobile, catalogue et commandes gérés par un Cloudflare Worker et une base D1.

- **Boutique publique :** https://bcrve.loanps4485.workers.dev
- **Mini App :** ouvre la boutique depuis le bot Telegram [@Bcrvee85_bot](https://t.me/Bcrvee85_bot).
- Le lien public permet de consulter le catalogue. Le bouton **Partager** ouvre le menu de partage de l’appareil ou copie le lien pour l’envoyer où tu veux. Les commandes et l’administration nécessitent une session Mini App Telegram valide.

## Parcours client

Catalogue → panier → confirmation dans Telegram → préparation → remise en main propre, paiement en espèces.

Le serveur recalcule le total depuis les prix du catalogue. Il vérifie `Telegram.WebApp.initData` avant d’enregistrer une commande.

## Administration

La page `admin.html` gère les commandes et le catalogue. Le raccourci Admin s’affiche après confirmation du Worker.

Toutes les routes `/api/admin/*` vérifient la session Telegram **côté serveur**. Seuls les IDs Telegram `6898182858` et `5379947962` sont autorisés. Cette liste est fixée dans `worker.js`; il n’y a pas de variable `ADMIN_IDS` à configurer.

## Déploiement et secrets

Un push sur `main` lance le workflow [Deploy to Cloudflare](.github/workflows/deploy.yml). Il publie le Worker et les fichiers de la boutique.

Le dépôt GitHub doit contenir ces secrets d’Actions :

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `BOT_TOKEN`

Le workflow valide le bot, retire l’ancienne variable en clair si elle existe, puis installe `BOT_TOKEN` comme secret Worker chiffré. **Ne place jamais de token dans le dépôt, dans `wrangler.toml` ou dans une variable Worker en clair.**

La configuration D1 existante se trouve dans `wrangler.toml`. `schema.sql` sert uniquement à initialiser une nouvelle base ; ne le rejoue pas sur la base de production.
