---
description: Liste les vidéos de l'usine SEPTIM (à valider, publiées, jetées) avec leur référence
argument-hint: "[a-valider|publiee|jetee|ratee]"
---

Montre les vidéos de l'usine SEPTIM.

1. Si les outils MCP `septim_*` sont disponibles, utilise `septim_list_videos` (avec `status: "notified"` pour « a-valider », `published`, `rejected`, `failed`).
2. Sinon, trouve la commande de l'usine, dans cet ordre : `node ./bin/septim.mjs` si le dossier courant contient `bin/septim.mjs` (c'est l'usine elle-même), sinon `septim` si `command -v septim` la trouve, sinon `node $SEPTIM_FACTORY/bin/septim.mjs`, sinon `node ~/septim/bin/septim.mjs`. Dans la suite, `septim` désigne la commande trouvée, et lance `septim videos` — avec `--status $ARGUMENTS` si un statut est donné.
3. Réponds avec un tableau : référence (`#5f8a`), statut, durée, template, hook. S'il y a des vidéos à valider, ajoute : « Pour voir le détail : `septim voir <ref>`. Pour publier : `/septim-viral:publier <ref>` ou réponds `OUI #<ref>` sur WhatsApp. »

Ne publie et ne jette rien : cette commande ne fait que lire.
