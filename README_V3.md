# Anciennes notes V3

Les instructions de ce fichier sont archivées. La boutique est maintenant déployée sur Cloudflare et gérée par GitHub Actions.

Pour la configuration actuelle, les secrets, l’authentification Telegram et l’administration, consulte [README.md](README.md).

À retenir : ne configure pas `ADMIN_IDS` dans Cloudflare. Les seules valeurs autorisées sont fixées dans `worker.js`, et les routes `/api/admin/*` les vérifient côté serveur. Ne colle jamais de token dans Git ou dans une variable Worker en clair.
