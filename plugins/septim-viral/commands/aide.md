---
description: Carte de toutes les portes de l'usine SEPTIM (navigateur, terminal, Claude Code, MCP, API, webhooks, WhatsApp) et l'état de l'usine
---

Donne à l'utilisateur, en français et sans rien lancer d'autre que le diagnostic, la carte des portes de l'usine SEPTIM.

1. Trouve la commande de l'usine : `septim` si `command -v septim` la trouve ; sinon `node <usine>/bin/septim.mjs`, où `<usine>` est le dossier courant s'il contient `bin/septim.mjs`, sinon `$SEPTIM_FACTORY`, sinon `~/septim`. Si aucune n'existe, dis d'installer une fois : `git clone https://github.com/SeptimeDSR/design ~/septim && bash ~/septim/scripts/install.sh`, et arrête-toi.
2. Lance `septim doctor` (avec la commande trouvée) et garde le résultat.
3. Réponds avec ce tableau, puis le diagnostic résumé en 4 lignes (voix, script automatique, publication, messages) et la première chose à installer s'il en manque :

| Porte | Comment | Pour |
| --- | --- | --- |
| Navigateur | `septim studio`, puis http://127.0.0.1:4321 (ou `/septim-viral:studio`) | fabriquer, regarder, publier en deux clics |
| Terminal | `septim video "sujet"`, `septim videos`, `septim voir <ref>`, `septim publier <ref>`, `septim jeter <ref>` | tout, en une ligne |
| Claude Code | `/septim-viral:viral "sujet"`, `/septim-viral:videos`, `/septim-viral:publier <ref>`, `/septim-viral:studio` | Claude écrit le script, l'usine rend |
| Assistants MCP | `septim connect claude-code` (ou claude-desktop, cursor, vscode, windsurf, codex, gemini) | l'usine dans n'importe quel assistant, prompt `/nouvelle_video` |
| API | http://127.0.0.1:4321/api/v1 (contrat : /api/v1/openapi.json) | n8n, Make, Zapier, Raccourcis iPhone |
| Webhooks | `VIRAL_WEBHOOK_URL` + `VIRAL_WEBHOOK_SECRET` dans `.env` | prévenir les autres logiciels (signature HMAC) |
| WhatsApp | `septim start`, puis réponds `OUI #ref`, `NON #ref`, `REFAIS #ref` | valider depuis le téléphone |

Termine par une ligne : « Rien n'est publié sans la phrase OUI #ref pour cette vidéo, et aucun crédit n'est dépensé sans ton accord chiffré. Mode d'emploi complet : docs/GUIDE.md. »
