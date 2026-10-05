---
description: Ouvre le Studio SEPTIM dans le navigateur (fabriquer, regarder, publier avec OUI)
argument-hint: "[--port 4321] [--host 0.0.0.0]"
---

Lance le Studio de l'usine SEPTIM et donne son adresse.

1. Trouve la commande : `septim` si `command -v septim` la trouve ; sinon `node <usine>/bin/septim.mjs` (dossier courant s'il contient `bin/septim.mjs`, sinon `$SEPTIM_FACTORY`, sinon `~/septim`). Si rien n'existe : `git clone https://github.com/SeptimeDSR/design ~/septim && bash ~/septim/scripts/install.sh`, puis arrête-toi.
2. Vérifie s'il tourne déjà : `curl -s -m 2 http://127.0.0.1:4321/api/v1/health`. Si la réponse contient `"ok":true`, ne relance rien.
3. Sinon, lance `septim studio $ARGUMENTS` **en arrière-plan** (il reste allumé) et attends la ligne « Studio SEPTIM en marche ». Si le port est pris par autre chose, relance avec `--port 4322`.
4. Réponds en 3 lignes : l'adresse du navigateur (avec `?token=` si l'usine en affiche un), l'adresse de l'API, et « Pour le téléphone sur le même Wi-Fi : SEPTIM_TOKEN dans .env, puis `septim studio --host 0.0.0.0` ».

Ne publie rien et ne lance aucun rendu toi-même.
