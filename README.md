# BCRVE85 V2

V2 du prototype Telegram Mini App.

## Paiement
Aucun paiement en ligne. Toutes les commandes utilisent `payment: "cash"` et sont prévues pour une remise en main propre.

## Flux
Produit → Panier → Confirmation → commande Telegram → préparation → remise → espèces.

## Important
Le dossier contient le front-end/prototype. Pour la mise en production, il faut connecter le bot à un backend sécurisé et une base de données. Le `sendData` Telegram ne doit pas être considéré comme une preuve d'identité côté serveur sans validation de `initData`.

## Admin
`admin.html` est une maquette mobile de l'espace administrateur. En production, elle devra être protégée et reliée à la base.
