# Mode d'emploi SEPTIM

L'usine SEPTIM fabrique des vidéos courtes 9:16 (TikTok, Reels, Shorts) sur ton ordinateur, sans crédit : un script H.E.A.T, une voix, un rendu Remotion, puis un message « Vidéo prête, réponds OUI #ref ». **Rien n'est publié sans la phrase `OUI #ref` pour cette vidéo-là, et aucun crédit n'est dépensé sans ton accord chiffré.**

Tu la pilotes par la porte qui t'arrange : le navigateur, le terminal, Claude Code, n'importe quel assistant MCP, l'API (n8n, Make, Zapier, Raccourcis iPhone), les webhooks ou WhatsApp. Toutes passent par le même cœur (`src/viral-engine/factory.ts`) : une seule règle de publication, un seul registre, jamais deux fois la même vidéo.

---

## En 1 minute

```bash
git clone https://github.com/SeptimeDSR/design ~/septim
bash ~/septim/scripts/install.sh --voix
septim studio
```

Ouvre http://127.0.0.1:4321, écris un sujet (« la tontine à Douala »), clique **Fabriquer la vidéo**. Deux minutes plus tard, la vidéo est dans la liste : regarde-la, puis **Publier #ref** et **Confirmer : OUI #ref**. Sans Postiz, l'usine te donne la légende prête à coller dans TikTok avec le son tendance.

---

## Installer

### Ce qu'il faut

| Besoin | Pourquoi | Comment |
| --- | --- | --- |
| Linux, WSL (Ubuntu) ou macOS | l'usine et ses outils | Windows : installe WSL (`wsl --install` dans PowerShell), puis tout se fait dans Ubuntu |
| Node.js 22 ou plus | le moteur et Remotion | `nvm install 22` (nvm évite les problèmes de droits) |
| git | récupérer le code | `sudo apt install git` |
| Python 3 avec venv (optionnel) | la voix française gratuite (Piper) | `sudo apt install python3-venv` |
| Claude Code (optionnel) | `/septim-viral:*` et l'usine dans Claude | `npm install -g @anthropic-ai/claude-code` |

### La commande

```bash
git clone https://github.com/SeptimeDSR/design ~/septim
bash ~/septim/scripts/install.sh            # ou --voix pour la voix française, --sans-claude pour ne pas toucher Claude Code
```

`install.sh` vérifie Node, installe les dépendances (`PUPPETEER_SKIP_DOWNLOAD=1 npm install`), rend la commande `septim` disponible partout (`npm link`), crée `.env` depuis `.env.example`, puis lance `septim setup`. `septim setup` branche Claude Code s'il est présent (marketplace `septim`, plugins `septim-design` et `septim-viral`, serveur MCP `septim`), puis affiche le diagnostic. Le script est idempotent : relance-le quand tu veux.

- **Si `npm link` demande les droits** (Node installé sans nvm) : `sudo npm link` une fois dans `~/septim`, ou ajoute `alias septim='node ~/septim/bin/septim.mjs'` à ton `~/.bashrc`. Sans rien de tout ça, `npm run septim -- <commande>` marche depuis le dossier du repo.
- **Voix** : `septim setup --voix` installe Piper dans `.septim-viral/venv` (pas `pip --user`, refusé par Ubuntu 23+ et Debian 12) et télécharge `fr_FR-tom-medium`. Sans voix, les vidéos sortent muettes avec sous-titres, et le diagnostic le dit.
- **Mettre à jour** : `cd ~/septim && git pull && bash scripts/install.sh`.

### Vérifier

```bash
septim doctor
```

Il affiche ce qui tourne (rendu, voix, script automatique, publication, messages) et, pour chaque manque, la commande exacte à lancer.

---

## Les portes

| Porte | Pour qui | Démarrer |
| --- | --- | --- |
| [Navigateur](#navigateur--le-studio) | toi, sur l'ordinateur ou le téléphone | `septim studio` |
| [Terminal](#terminal--la-commande-septim) | toi, en une ligne | `septim video "sujet"` |
| [Claude Code](#claude-code) | Claude écrit le script, l'usine rend | `/septim-viral:viral "sujet"` |
| [MCP](#mcp--brancher-nimporte-quel-assistant) | Claude Desktop, Cursor, VS Code, Windsurf, Codex, Gemini, n8n | `septim connect <client>` |
| [API](#api-rest) | n8n, Make, Zapier, Postman, Raccourcis iPhone | `http://127.0.0.1:4321/api/v1` |
| [Webhooks](#webhooks) | être prévenu sans interroger | `VIRAL_WEBHOOK_URL` dans `.env` |
| [WhatsApp](#whatsapp) | valider depuis le téléphone | `septim start` |

---

## Navigateur : le Studio

```bash
septim studio                      # http://127.0.0.1:4321
septim studio --port 4400          # si 4321 est déjà pris
```

Une seule page :

- **En-tête** : l'état de l'usine (voix, script, publication, messages) et la liste de ce qu'il reste à installer.
- **Fabriquer** : sujet (vide = tendance du jour), template (au choix, histoire, maths, film), langue. « J'ai déjà un script » accepte un script JSON ; **Vérifier le script** affiche les règles enfreintes avant tout rendu.
- **En fabrication** : chaque tâche, de « En file d'attente » à « Prête ». Tu peux fermer la page : le rendu continue.
- **Vidéos** : lecteur 9:16, hook, durée, voix, légende avec **Copier la légende**, filtres (à valider, publiées, jetées). **Publier #ref** demande un second clic **Confirmer : OUI #ref** ; **Jeter** et **Refaire** demandent aussi une confirmation ; Échap annule.
- **Ce qui marche** : le classement des couples template × hook appris des vues à 48 h.
- **Brancher** : adresses de l'API et du MCP, token, commandes `septim connect` à copier.

**Sur le téléphone, même Wi-Fi :**

```bash
echo "SEPTIM_TOKEN=$(openssl rand -hex 16)" >> ~/septim/.env
septim studio --host 0.0.0.0       # affiche l'adresse « Téléphone : http://192.168.x.x:4321/?token=… »
```

Ouvre cette adresse une fois : le Studio garde le token sur l'appareil et le retire de l'URL. Sans token, l'usine refuse d'écouter ailleurs que sur 127.0.0.1.

---

## Terminal : la commande septim

`septim` marche depuis n'importe quel dossier : elle se place dans le repo pour lire `.env` et `.septim-viral/`, et lit les chemins que tu tapes (`--script`, `--broll`) depuis le dossier où tu es.

| Commande | Rôle |
| --- | --- |
| `septim video "la tontine" [--template story\|maths\|film] [--lang fr\|en] [--script s.json] [--broll dossier] [--no-notify]` | fabriquer une vidéo (environ 2 min) |
| `septim lint script.json [--template maths] [--lang fr]` | vérifier un script sans rien rendre |
| `septim videos [--status a-valider\|publiee\|jetee\|ratee] [--limit 20]` | lister les vidéos |
| `septim voir <ref>` | hook, légende, hashtags, chemin du MP4 |
| `septim publier <ref>` | publier ; taper la commande vaut « OUI #ref » |
| `septim jeter <ref>` | jeter |
| `septim studio [--port 4321] [--host 127.0.0.1]` | Studio, API et MCP HTTP |
| `septim start` | tout en permanence : démon, WhatsApp, cycle de 6 h, Studio, API, MCP HTTP |
| `septim mcp` | serveur MCP stdio (pour les assistants) |
| `septim connect <client> [--write]` | brancher un assistant MCP |
| `septim setup [--sans-claude] [--voix]` | `.env`, Claude Code, voix, diagnostic |
| `septim doctor` | état de l'usine et commandes pour le reste |
| `septim design init [dossier]` | installer septim-design dans un autre projet Next.js |
| `septim version` | version de l'usine |

Une référence, c'est le début de l'identifiant de la vidéo : `5f8a`, `#5F8A` et `5F8A` désignent la même vidéo. Si deux vidéos commencent pareil, l'usine refuse et liste les deux : tape un ou deux caractères de plus.

Alias anglais : `create`, `list`, `show`, `publish`, `reject`. Les anciens scripts restent : `npm run viral -- "sujet"`, `npm run viral:doctor`, `npm run viral:daemon` (depuis le dossier du repo).

---

## Claude Code

`install.sh` (ou `septim setup`) installe tout. À la main :

```
/plugin marketplace add SeptimeDSR/design
/plugin install septim-design@septim
/plugin install septim-viral@septim
```

```bash
septim connect claude-code          # ajoute le serveur MCP septim en portée utilisateur (claude mcp add)
```

| Commande | Rôle |
| --- | --- |
| `/septim-viral:viral "je veux une histoire sur la tontine"` | Claude écrit le script H.E.A.T, le vérifie, l'usine rend ; rien n'est publié |
| `/septim-viral:videos [a-valider]` | lister les vidéos |
| `/septim-viral:publier <ref>` | publier cette vidéo-là (sans référence : rien n'est publié) |
| `/septim-viral:studio` | lancer le Studio et donner l'adresse |
| `/septim-viral:aide` | la carte des portes et l'état de l'usine |
| `/nouvelle_video` | prompt MCP du serveur `septim` : écrire, vérifier et fabriquer |
| `/septim-design:septim-design` | le directeur artistique des sites (voir son plugin) |

Dans ce repo, `.mcp.json` déclare aussi le serveur `septim` pour le projet : Claude Code le propose à l'ouverture.

---

## MCP : brancher n'importe quel assistant

Le serveur MCP `septim` donne à l'assistant 9 outils, 2 ressources et 1 prompt.

| Outil | Rôle |
| --- | --- |
| `septim_create_video` | fabriquer (sujet, template, langue, script) ; `wait_seconds` (≤ 240) attend la fin du rendu |
| `septim_get_task` | suivre une tâche (queued, running, done, failed) |
| `septim_list_videos` | lister les vidéos |
| `septim_get_video` | détail d'une vidéo |
| `septim_lint_script` | vérifier un script avec les règles virales |
| `septim_publish_video` | publier : exige la phrase de l'humain, telle quelle, dans `confirmation` (« OUI #5f8a ») |
| `septim_reject_video` | jeter |
| `septim_doctor` | diagnostic |
| `septim_lessons` | ce qui marche |

Ressources : `septim://checklist` (règles chiffrées) et `septim://guide-heat` (format du script). Prompt : `nouvelle_video {sujet}`.

`septim connect <client>` affiche la configuration exacte (chemins absolus compris) ; `--write` l'écrit en gardant tes autres serveurs. Redémarre le client ensuite.

### Claude Code

```bash
septim connect claude-code
claude mcp list                      # septim … ✓ Connected
```

### Claude Desktop

```bash
septim connect claude-desktop --write
```

Fichier : `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS), `%APPDATA%\Claude\claude_desktop_config.json` (Windows), `~/.config/Claude/claude_desktop_config.json` (Linux). Sous Windows avec l'usine dans WSL, mets à la main `"command": "wsl"` et `"args": ["-e", "bash", "-lc", "septim mcp"]`.

### Cursor

```bash
septim connect cursor --write        # ~/.cursor/mcp.json (tous les projets)
```

Pour un seul projet, copie le même bloc dans `<projet>/.cursor/mcp.json`.

### VS Code

```bash
septim connect vscode --write        # mcp.json du profil utilisateur (clé "servers", type "stdio")
```

Pour un seul espace de travail, copie le bloc dans `.vscode/mcp.json`. Les outils apparaissent dans le chat en mode Agent.

### Windsurf

```bash
septim connect windsurf --write      # ~/.codeium/windsurf/mcp_config.json
```

### Codex

```bash
septim connect codex --write         # ~/.codex/config.toml, section [mcp_servers.septim]
```

### Gemini CLI

```bash
septim connect gemini --write        # ~/.gemini/settings.json
```

### Clients distants (n8n, connecteurs) : MCP HTTP

`septim studio` et `septim start` servent aussi le MCP en HTTP streamable, sans état, sur `http://127.0.0.1:4321/mcp` (POST seulement). Dans n8n : nœud **MCP Client Tool**, transport HTTP streamable, en-tête `Authorization: Bearer <SEPTIM_TOKEN>` si tu as défini un token. Depuis un autre appareil : `--host 0.0.0.0` avec un token, ou un tunnel (voir Sécurité).

---

## API REST

Base : `http://127.0.0.1:4321/api/v1`. Le contrat OpenAPI 3.1 est servi à `GET /api/v1/openapi.json` : importe-le dans n8n, Make, Postman ou Insomnia.

- **Token** : quand `SEPTIM_TOKEN` est défini, chaque appel (sauf `/health` et `/openapi.json`) envoie `Authorization: Bearer <token>`.
- **Corps** : JSON (`Content-Type: application/json`), 1 Mo au plus. Un POST sans corps est accepté.
- **Erreurs** : `{"error": {"code", "message", "details?"}}` avec `bad_request` 400, `unauthorized` 401, `forbidden` 403, `not_found` 404, `ambiguous_ref` 409 (`details.matches`), `conflict` 409, `payload_too_large` 413, `unsupported_media_type` 415, `confirmation_required` 428 (`details.expected`).

Dans les exemples, `U=http://127.0.0.1:4321/api/v1` et `A="Authorization: Bearer $SEPTIM_TOKEN"` (inutile sans token).

| Route | Rôle | Exemple |
| --- | --- | --- |
| `GET /api/v1/health` | l'usine répond-elle ? | `curl $U/health` |
| `GET /api/v1/openapi.json` | le contrat | `curl $U/openapi.json` |
| `GET /api/v1/doctor` | diagnostic | `curl -H "$A" $U/doctor` |
| `GET /api/v1/videos` | liste (`?status=notified&limit=20`) | `curl -H "$A" "$U/videos?status=notified"` |
| `POST /api/v1/videos` | fabriquer → 202 + tâche | `curl -H "$A" -H 'Content-Type: application/json' -d '{"topic":"la tontine","template":"maths"}' $U/videos` |
| `GET /api/v1/videos/:ref` | détail | `curl -H "$A" $U/videos/5f8a` |
| `GET /api/v1/videos/:ref/video` | le MP4 (Range accepté ; `?token=` accepté pour une balise `<video>`) | `curl -H "$A" -o video.mp4 $U/videos/5f8a/video` |
| `POST /api/v1/videos/:ref/publish` | publier avec `{"confirm":"OUI #5f8a"}` | `curl -H "$A" -H 'Content-Type: application/json' -d '{"confirm":"OUI #5f8a"}' $U/videos/5f8a/publish` |
| `POST /api/v1/videos/:ref/reject` | jeter | `curl -H "$A" -X POST $U/videos/5f8a/reject` |
| `POST /api/v1/videos/:ref/redo` | jeter et refaire → 202 + tâche | `curl -H "$A" -X POST $U/videos/5f8a/redo` |
| `GET /api/v1/tasks` | toutes les tâches | `curl -H "$A" $U/tasks` |
| `GET /api/v1/tasks/:id` | suivre une tâche | `curl -H "$A" $U/tasks/3fa9c1d2` |
| `POST /api/v1/lint` | vérifier un script | `curl -H "$A" -H 'Content-Type: application/json' -d @lint.json $U/lint` (`{"script": {...}, "template": "maths"}`) |
| `GET /api/v1/lessons` | ce qui marche | `curl -H "$A" $U/lessons` |

Une référence avec `#` s'encode : `%235f8a`. Le plus simple : `5f8a`.

---

## Webhooks

Avec `VIRAL_WEBHOOK_URL` dans `.env`, l'usine envoie un `POST` à chaque événement : `video.ready`, `video.failed`, `video.published`, `video.rejected`.

```json
{
  "event": "video.ready",
  "at": "2026-10-05T16:08:00.000Z",
  "video": { "id": "5f8a4d25", "ref": "5f8a", "status": "notified", "hook": "Tu es le dernier à bouffer la tontine ?", "topic": "la tontine", "template": "maths", "durationMs": 33800, "caption": "…", "hashtags": ["#tontine"], "videoUrl": "https://…/api/v1/videos/5f8a4d25/video" }
}
```

- En-têtes : `X-Septim-Event`, `X-Septim-Delivery` (uuid, pour ignorer un doublon), `X-Septim-Signature: sha256=<hex>` (si `VIRAL_WEBHOOK_SECRET` est défini).
- 10 s par essai, 3 essais (après 1 s puis 5 s). Un échec est noté dans le journal et ne bloque jamais l'usine.
- `videoUrl` n'est rempli que si `SEPTIM_PUBLIC_URL` est défini ; jamais de chemin disque.

**Vérifier la signature** : recalcule HMAC-SHA256 du corps brut avec le secret et compare.

```js
// Node.js (Express : app.use(express.raw({ type: "application/json" })))
import { createHmac, timingSafeEqual } from "node:crypto";
const expected = Buffer.from("sha256=" + createHmac("sha256", process.env.VIRAL_WEBHOOK_SECRET).update(rawBody).digest("hex"));
const given = Buffer.from(req.get("X-Septim-Signature") ?? "");
const valid = given.length === expected.length && timingSafeEqual(given, expected);
```

```python
# Python (Flask : raw_body = request.get_data())
import hashlib, hmac, os
expected = "sha256=" + hmac.new(os.environ["VIRAL_WEBHOOK_SECRET"].encode(), raw_body, hashlib.sha256).hexdigest()
valid = hmac.compare_digest(expected, request.headers.get("X-Septim-Signature", ""))
```

---

## WhatsApp

`septim start` ouvre WhatsApp (bibliothèque non officielle, un seul destinataire : toi). La première fois, scanne le QR avec WhatsApp > Appareils connectés.

| Tu réponds | L'usine |
| --- | --- |
| `OUI #5f8a` (ou une réponse qui cite le message de la vidéo) | publie cette vidéo, une seule fois |
| `NON #5f8a` | la jette |
| `REFAIS #5f8a` | en fait une autre version sur le même sujet |
| `PRO #5f8a` | annonce le coût de la version Higgsfield ; ne dépense rien |
| « ok », « oui ? », « je regarde » | rien : elle redemande un `OUI #ref` net |

Si deux vidéos commencent par les mêmes caractères, l'usine ne devine pas : elle te demande la référence plus longue. Si WhatsApp ne transmet pas ta réponse : `septim publier 5f8a`, le Studio ou `/septim-viral:publier 5f8a` (même registre, jamais deux fois).

---

## Recettes

### n8n

1. Importe `docs/n8n-septim.json` (menu **Import from File**).
2. Branche **A** : copie l'URL de production du nœud « Septim : événement » dans `VIRAL_WEBHOOK_URL`, mets le même secret dans `VIRAL_WEBHOOK_SECRET` et dans le nœud « Vérifier la signature », remplace « Prévenir » par Telegram, Slack ou e-mail.
3. Branche **B** : mets l'adresse de l'usine et le token dans « Réglages de l'usine ». L'URL du formulaire « Publier une vidéo Septim » se garde en favori sur le téléphone : tu y écris `OUI #5f8a` et n8n appelle `POST /api/v1/videos/:ref/publish`.
4. Active le workflow. n8n en Docker : l'usine est sur l'hôte, utilise `http://host.docker.internal:4321`, lance l'usine avec `--host 0.0.0.0` et un token, et ajoute l'origine de n8n à `SEPTIM_CORS_ORIGINS` si tu l'appelles depuis un navigateur.

### Make

- Module **Webhooks > Custom webhook** : son URL va dans `VIRAL_WEBHOOK_URL`.
- Module **HTTP > Make a request** : `POST http://<usine>:4321/api/v1/videos`, en-têtes `Authorization: Bearer <token>` et `Content-Type: application/json`, corps `{"topic": "…"}`.
- Make tourne dans le cloud : il lui faut une adresse publique de l'usine (tunnel, voir Sécurité).

### Zapier

- **Webhooks by Zapier > Catch Hook** : l'URL va dans `VIRAL_WEBHOOK_URL` ; filtre sur `event` = `video.ready`.
- **Webhooks by Zapier > Custom Request** pour appeler l'API (même adresse publique que Make).

### Raccourcis iPhone

Raccourci « Vidéo Septim » :
1. **Demander une entrée** (texte) : « Sujet ? »
2. **Obtenir le contenu de l'URL** : `http://192.168.x.x:4321/api/v1/videos`, méthode POST, en-têtes `Authorization: Bearer <token>`, corps JSON `topic` = entrée.
3. **Afficher le résultat**.

Raccourci « Publier Septim » : même chose avec `.../api/v1/videos/<ref>/publish` et `confirm` = `OUI #<ref>`. L'usine doit tourner avec `--host 0.0.0.0` et un token (même Wi-Fi).

---

## Tout lancer en permanence

```bash
npm install -g pm2
cd ~/septim && pm2 start ecosystem.config.cjs && pm2 save
pm2 logs septim-viral                # suivre
```

`ecosystem.config.cjs` lance `septim start` : démon, WhatsApp, une vidéo toutes les 6 h (`VIRAL_CRON`), analytics à 48 h, Studio, API et MCP HTTP sur 4321 (`SEPTIM_PORT=0` pour s'en passer). pm2 le relance s'il s'arrête (WhatsApp déconnecté compris).

WSL ne lance pas cron sans systemd : l'usine a son propre planificateur (`node-cron`). Pour démarrer avec Windows : Planificateur de tâches → `wsl -e bash -lc "cd ~/septim && pm2 resurrect"`.

---

## Le site

Le site Septim (Next.js 16) est dans le même repo et n'a rien à voir avec le serveur de l'usine : il peut partir sur Vercel, l'usine reste chez toi.

```bash
echo "NEXT_PUBLIC_WHATSAPP_NUMBER=2376XXXXXXXX" >> .env.local
npm run dev                          # http://localhost:3000
npm run build && npm start
```

---

## Configuration

Tout est optionnel : sans rien, l'usine tourne en gratuit (rendu Remotion, voix silencieuse, script de secours, publication manuelle). Copie `.env.example` en `.env` (`septim setup` le fait).

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `SEPTIM_PORT` | `4321` | port du Studio, de l'API et du MCP HTTP ; `0` = `septim start` sans serveur |
| `SEPTIM_HOST` | `127.0.0.1` | `0.0.0.0` = ouvert au réseau (token obligatoire) |
| `SEPTIM_TOKEN` | vide | jeton d'accès (`openssl rand -hex 16`) |
| `SEPTIM_CORS_ORIGINS` | vide | origines web autorisées, séparées par des virgules |
| `SEPTIM_PUBLIC_URL` | vide | adresse publique (tunnel) : remplit `videoUrl` des webhooks |
| `SEPTIM_ROOT` | dossier du repo | à définir seulement si `bin/septim.mjs` est copié ailleurs |
| `VIRAL_WEBHOOK_URL` | vide | adresse qui reçoit les événements |
| `VIRAL_WEBHOOK_SECRET` | vide | secret de signature HMAC-SHA256 |
| `VIRAL_HOME` | `.septim-viral` | vidéos, tâches, état, leçons (relatif au repo) |
| `VIRAL_LANG` | `fr` | `fr` ou `en` |
| `VIRAL_REGIONS` | `CM,FR,CI,SN` | pays des tendances |
| `VIRAL_CRON` | `0 */6 * * *` | rythme du démon |
| `VIRAL_NOTIFIER` | `whatsapp` | `whatsapp` ou `console` |
| `VIRAL_WHATSAPP_TO` | vide (toi) | numéro qui reçoit les messages |
| `WHATSAPP_CHROME_PATH` | vide | Google Chrome pour envoyer de vraies vidéos (sinon en document) |
| `VIRAL_TTS` | `auto` | `auto`, `piper`, `kokoro`, `silent` |
| `VIRAL_PIPER_VOICE` | `fr_FR-tom-medium` | voix Piper française |
| `VIRAL_PIPER_VOICE_EN` | `en_US-ryan-high` | voix Piper anglaise |
| `VIRAL_PIPER_DIR` | `.septim-viral/voices` | dossier des voix |
| `VIRAL_PYTHON` | venv de l'usine, sinon `python3` | Python qui a Piper |
| `VIRAL_KOKORO_VOICE` | `am_michael` | voix Kokoro (anglais) |
| `VIRAL_OLLAMA_MODEL` | `qwen2.5:7b` | modèle local pour le script automatique |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | adresse d'Ollama |
| `VIRAL_OLLAMA_TIMEOUT_MS` | `120000` | délai d'Ollama |
| `YOUTUBE_API_KEY` | vide | tendances YouTube (clé gratuite) |
| `APIFY_TOKEN` | vide | tendances TikTok Creative Center (offre gratuite) |
| `VIRAL_APIFY_ACTOR` | `eunit/tiktok-trends-scraper` | acteur Apify |
| `VIRAL_APIFY_INPUT` | vide | entrée JSON de l'acteur |
| `VIRAL_APIFY_TIMEOUT_MS` | `180000` | délai d'Apify |
| `POSTIZ_API_KEY` | vide | Postiz cloud |
| `POSTIZ_API_URL` | vide | Postiz auto-hébergé |
| `POSTIZ_BIN` | `postiz` | chemin du CLI Postiz |
| `VIRAL_PUBLISH_MODE` | auto | forcer `manual`, `postiz-cloud` ou `postiz-self` |
| `VIRAL_TIKTOK_METHOD` | `DIRECT_POST` | `UPLOAD` = brouillon dans l'app (pour le son tendance) |
| `VIRAL_PLATFORMS` | `tiktok,youtube,instagram,facebook` | où publier |
| `VIRAL_RENDER_CONCURRENCY` | `2` | onglets Chrome pour le rendu |
| `REMOTION_BROWSER_EXECUTABLE` | vide | Chrome headless déjà installé (sinon Remotion le télécharge) |
| `PUPPETEER_SKIP_DOWNLOAD` | `1` | ne pas télécharger le Chromium de puppeteer |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | vide | site : numéro du bouton WhatsApp |
| `NEXT_PUBLIC_SPLINE_SCENE` | vide | site : scène 3D Spline (sinon orbe three.js) |
| `NEXT_PUBLIC_HERO_VIDEO_URL` | vide | site : vidéo hero PRO (sinon Remotion) |
| `TWENTY_FIRST_API_KEY` | vide | MCP 21st.dev (composants) |

Une variable vide n'est pas une variable absente : laisse commentées (`#`) celles dont la valeur par défaut te va.

---

## Dépannage

| Symptôme | Cause | Solution |
| --- | --- | --- |
| `septim: command not found` | `npm link` n'a pas pu écrire | `sudo npm link` dans `~/septim`, ou `alias septim='node ~/septim/bin/septim.mjs'` |
| « Le port 4321 est déjà pris » | une usine tourne déjà (pm2 ?) | ouvre http://127.0.0.1:4321, ou `septim studio --port 4322` |
| « Écouter sur 0.0.0.0 ouvre l'usine au réseau » | pas de token | `SEPTIM_TOKEN=…` dans `.env` |
| 403 « Hôte refusé » | adresse autre que 127.0.0.1/localhost sans token | ouvre par http://127.0.0.1:4321, ou définis un token |
| 403 « Origine refusée » | appel depuis une page web d'un autre domaine | ajoute ce domaine à `SEPTIM_CORS_ORIGINS` |
| 401 « Token requis » | token défini, en-tête absent | `Authorization: Bearer <token>` ; dans le Studio, colle-le dans Brancher |
| 428 `confirmation_required` | la phrase n'est pas « OUI #ref » de cette vidéo | envoie exactement `OUI #5f8a` (`details.expected`) |
| 409 `ambiguous_ref` | deux vidéos commencent pareil | tape un ou deux caractères de plus |
| Vidéo muette | pas de voix installée | `septim setup --voix` |
| « Rendu raté » / tâche `failed` | Chrome headless introuvable | laisse Remotion le télécharger (réseau), ou `REMOTION_BROWSER_EXECUTABLE=/chemin/chrome` |
| Script refusé | règles virales | `septim lint script.json` (ou **Vérifier le script**) dit quoi corriger |
| L'assistant ne voit pas `septim` | client pas redémarré, ou chemin de Node changé | `septim connect <client> --write`, puis redémarre le client |
| WhatsApp ne répond plus | session expirée | pm2 relance tout seul ; sinon `septim start` et rescanne le QR |
| `npm audit` signale `extract-zip` | dépendance de whatsapp-web.js sans correctif | voir Sécurité |

---

## Sécurité

- **Local par défaut** : l'usine écoute sur 127.0.0.1. L'ouvrir au réseau (`--host 0.0.0.0`) exige `SEPTIM_TOKEN`, sinon elle refuse de démarrer.
- **Un site malveillant ne peut pas la piloter** : contrôle du `Host` (anti DNS rebinding), de l'`Origin` (anti CSRF), POST en JSON seulement, corps limité à 1 Mo, Studio interdit d'affichage dans un cadre (CSP `frame-ancestors 'none'`).
- **Jamais sans OUI** : chaque porte exige la phrase `OUI #ref` de cette vidéo ; le terminal et `/septim-viral:publier <ref>` comptent le fait de taper la commande. Le registre et un verrou de fichier empêchent la double publication, même entre plusieurs processus.
- **Jamais de crédit dépensé** : les options PRO (Higgsfield, Runway, Pika) ne se lancent qu'avec un coût affiché et ton oui chiffré, jamais depuis le démon ni l'API.
- **Ouvrir à Internet** : passe par un tunnel (Cloudflare Tunnel, Tailscale Funnel) avec un token long, et mets son adresse dans `SEPTIM_PUBLIC_URL`. Ne redirige pas un port de ta box.
- **Aucun secret dans le repo** : `.env` est ignoré par git ; `.env.example` ne contient que des noms.
- **WhatsApp** passe par une bibliothèque non officielle : un seul destinataire, faible volume. Pour un usage pro, l'API WhatsApp Cloud de Meta.
- **`npm audit`** signale `extract-zip` (via whatsapp-web.js → puppeteer), sans correctif publié. Il ne sert qu'au téléchargement du Chromium de puppeteer, désactivé par `PUPPETEER_SKIP_DOWNLOAD=1` ; avec `WHATSAPP_CHROME_PATH`, ce code ne s'exécute jamais.

---

## Ce qui manque encore

- **Docker** et **CI GitHub Actions** : pas vérifiables depuis l'environnement de travail (pas de démon Docker) ; à faire quand une machine avec Docker est disponible.
- **Application mobile** : le Studio en Wi-Fi (ou par tunnel) couvre le téléphone.
- **Windows natif** : WSL est la voie documentée.
- **Webhook `video.published` pour une publication faite depuis WhatsApp** : WhatsApp publie par le même registre, mais n'émet pas encore l'événement (le Studio, l'API, le MCP et le terminal l'émettent).
- **Durée de la voix** : le script est vérifié sur une estimation du débit, pas sur la voix réelle.
