# SEPTIM : une usine, toutes les portes — spec

Date : 2026-10-05 · Statut : décidé (l'utilisateur a délégué toutes les décisions : « décide tout pour moi »)

## 1. Demande

L'utilisateur veut :
- la liste de ce qui manque pour la perfection ;
- un mode d'emploi ;
- plusieurs façons de piloter l'usine : navigateur, terminal, Claude Code (`/…`), serveur MCP à installer, « connectable à tous les autres logiciels » ;
- une documentation complète : tout installer, tout lancer, chaque interface.

## 2. Ce qu'on a déjà

| Porte | État |
| --- | --- |
| Terminal | `npm run viral -- …`, `viral:daemon`, `viral:doctor` (lancés depuis le dossier du repo) |
| Claude Code | `/septim-viral:viral`, `/septim-design:septim-design` |
| WhatsApp | démon : OUI #ref / NON / REFAIS / PRO |
| Navigateur | aucune |
| MCP | aucun (seulement des MCP tiers listés dans `setup.md`) |
| API / autres logiciels | aucune |
| Installation | 4 à 6 commandes à la main, réparties entre README et `setup.md` |

## 3. Décisions

| # | Décision | Pourquoi | Coût si faux |
| --- | --- | --- | --- |
| D1 | Un seul cœur, `src/viral-engine/factory.ts`. Toutes les portes l'appellent ; aucune ne parle directement au pipeline ou à Postiz | Une seule règle de publication, une seule validation : impossible qu'une porte publie sans OUI ou deux fois | Une couche de plus à lire |
| D2 | Serveur HTTP Node (`node:http`, aucune dépendance) dans `src/viral-engine/server/`, et non une route Next.js | Le site Next est public et serait déployé sur Vercel, où Remotion et WhatsApp ne tournent pas. L'usine est un outil local qui ne doit jamais partir en ligne avec le site | Deux serveurs à connaître (site : 3000, usine : 4321) |
| D3 | Studio navigateur en HTML, CSS et JS servis par ce serveur, sans build | Démarre en une commande, marche sur le téléphone en Wi-Fi, rien à compiler. Les vidéos sont déjà rendues, un `<video>` suffit | Pas de prévisualisation Remotion en direct dans le Studio (le Studio Remotion existe : `npm run video:studio`) |
| D4 | MCP officiel (`@modelcontextprotocol/sdk`) en deux transports : stdio (`septim mcp`) et HTTP streamable (`/mcp` sur le serveur) | stdio couvre Claude Code, Claude Desktop, Cursor, VS Code, Windsurf, Codex et Gemini CLI. Le HTTP couvre les clients distants (n8n, connecteurs via tunnel) | Une dépendance de plus |
| D5 | API REST `/api/v1`, décrite par un OpenAPI 3.1 servi à `/api/v1/openapi.json` | n8n, Make, Zapier, Postman et Raccourcis iOS importent l'OpenAPI ou appellent du JSON simple | Un contrat à maintenir (protégé par un test) |
| D6 | Webhooks sortants signés HMAC-SHA256 (`VIRAL_WEBHOOK_URL`, `VIRAL_WEBHOOK_SECRET`) : `video.ready`, `video.failed`, `video.published`, `video.rejected` | Les autres logiciels sont prévenus sans interroger en boucle. Un fichier n8n de démarrage suffit | Rien |
| D7 | La publication exige partout la même confirmation : la phrase `OUI #ref` (API : champ `confirm` ; MCP : paramètre `confirmation` ; Studio : bouton en deux temps qui envoie `OUI #ref` ; terminal et `/septim-viral:publish <ref>` : l'acte de taper la commande) | La règle « jamais sans OUI » ne doit dépendre d'aucune porte. Une automatisation qui publie doit le vouloir explicitement | Une automatisation doit écrire la phrase |
| D8 | Sûreté multi-processus : écritures atomiques (fichier temporaire puis rename), verrou de fichier exclusif (`openSync 'wx'`) pour la publication et pour `state.json`, job relu sous verrou avant de publier | Avec Studio, MCP, CLI et démon en même temps, le verrou en mémoire actuel ne protège plus de la double publication | Un verrou orphelin si un processus meurt (expire après 15 min, comme `publishing`) |
| D9 | Référence ambiguë (deux jobs commencent par les mêmes caractères) : erreur qui liste les jobs, au lieu de prendre le plus récent | Ne jamais publier la mauvaise vidéo | Taper deux caractères de plus |
| D10 | Accès réseau : écoute sur `127.0.0.1` par défaut. Écouter ailleurs (`--host 0.0.0.0`) exige `SEPTIM_TOKEN`, sinon le serveur refuse de démarrer. Contrôle du `Host` (anti DNS rebinding) et de l'`Origin` (anti CSRF) ; POST seulement en `application/json` ; corps limité à 1 Mo | Un serveur local qui publie sur les réseaux sociaux ne doit être pilotable ni par un site malveillant ni par le Wi-Fi d'à côté | Un token à saisir une fois sur le téléphone |
| D11 | Fabrication asynchrone : `createVideo` renvoie tout de suite une tâche. L'état est écrit dans `.septim-viral/tasks/<id>.json`, donc visible par toutes les portes. File d'attente d'un rendu à la fois par processus | Un rendu dure environ 2 min ; une requête HTTP ou MCP ne doit pas rester pendue. Le MCP accepte `wait_seconds` (≤ 240) pour les clients patients | Il faut interroger l'état (le Studio le fait seul) |
| D12 | Un exécutable `septim` (`bin/septim.mjs`, qui charge tsx et se place dans le dossier du repo) installé par `npm link`. Les scripts `npm run viral…` restent en alias | Une seule commande à retenir, utilisable depuis n'importe quel dossier, y compris par les commandes Claude Code des autres projets | `npm link` peut demander les droits si Node n'a pas été installé avec nvm (alternative documentée : `npm run septim -- …`) |
| D13 | `septim start` = tout (démon, cron, WhatsApp, Studio, API, MCP HTTP) dans un seul processus. `septim studio` = Studio, API et MCP HTTP sans cron ni WhatsApp | Un seul propriétaire de WhatsApp et de la file de rendu quand tout tourne | Rien |
| D14 | `septim connect <client>` affiche (ou écrit avec `--write`) la configuration MCP exacte, chemins absolus compris, pour : claude-code, claude-desktop, cursor, vscode, windsurf, codex, gemini. Pour claude-code, il lance `claude mcp add` | « Brancher à tous les logiciels » sans recopier de chemins | Formats de config qui évoluent (couverts par la doc des éditeurs) |
| D15 | Le MCP expose aussi un **prompt** `nouvelle_video` | Les prompts MCP apparaissent comme commande `/` dans Claude Code et d'autres clients : une commande `/` sans plugin | Rien |
| D16 | Nouvelles commandes du plugin septim-viral : `/septim-viral:studio`, `/septim-viral:videos`, `/septim-viral:publier`, `/septim-viral:aide` | Les gestes fréquents en une commande ; `aide` donne la carte de toutes les portes | 4 fichiers de plus à valider |
| D17 | Installation : `scripts/install.sh` (Linux, WSL, macOS) fait npm, `npm link`, `.env`, puis `septim setup`. `septim setup` branche Claude Code (marketplace, plugins, MCP) si `claude` est présent, puis lance le diagnostic. `--voix` installe aussi Piper | Une commande, idempotente, non interactive | Windows natif non couvert (WSL documenté) |
| D18 | Documentation : `docs/GUIDE.md` (mode d'emploi complet), `docs/openapi` servi par le serveur, README court qui renvoie au guide. Un test vérifie que chaque variable d'environnement lue par le code est documentée dans `.env.example`, et que chaque route du serveur est dans l'OpenAPI | La doc ne dérive plus du code | Rien |
| D19 | Ce qui n'est pas fait : Docker, CI GitHub Actions, application mobile | Docker et la CI ne sont pas vérifiables ici (pas de démon Docker ; le push GitHub est bloqué, et un workflow exige un droit en plus) ; le Studio en Wi-Fi couvre le téléphone | Listés dans la feuille de route du guide |
| D20 | Réparations reprises des « petits défauts » parce que les nouvelles portes les rendent probables : écritures atomiques (D8), mises à jour du bandit perdues (D8), références ambiguës (D9), démon sourd après une déconnexion WhatsApp (il quitte, pm2 le relance) | Plusieurs processus et un démon permanent | Rien |

## 4. Architecture

```
 navigateur ─┐          ┌─ Studio (HTML)
 n8n / Make ─┤  HTTP    ├─ /api/v1/*  (REST + OpenAPI)
 client MCP ─┤ :4321 ───┤─ /mcp       (MCP HTTP streamable)
             │          └─ webhooks sortants ──► autres logiciels
 Claude Code ─ stdio ──── septim mcp
 terminal ──────────────── septim <commande>
 WhatsApp ──────────────── démon (septim start)
                    │
                    ▼
            factory.ts (cœur unique)
   createVideo · getTask · listVideos · getVideo · lintScript
   publish(confirm) · reject · redo · doctor · lessons · events
                    │
     pipeline.ts · publish.ts (registre + verrou fichier) · store.ts (atomique)
```

### 4.1 Cœur `factory.ts`

`createFactory(deps)` renvoie :
- `createVideo(req: {topic?, template?, lang?, script?}) → Task`. Valide template et langue. Un script fourni est vérifié tout de suite : script refusé = erreur 400, sans tâche.
- `getTask(id) → Task | undefined`, `listTasks() → Task[]`. Une tâche a les états `queued | running | done | failed`, plus `jobId`, `error`, `createdAt` et `updatedAt`.
- `listVideos({status?, limit?}) → VideoSummary[]` et `getVideo(ref) → VideoDetail`. `getVideo` lève `AmbiguousRef` (avec la liste) ou `NotFound`.
- `lintScript(script, {topic?, template?, lang?}) → {ok, issues, durationMs, payoffRatio}`.
- `publish(ref, confirm) → PublishOutcome`. `confirm` doit valoir `OUI #<ref>` (casse et espaces libres ; la référence tapée doit désigner ce job). Sinon `ConfirmationRequired`. Passe par `publishWithLedger`.
- `reject(ref)`, `redo(ref) → Task`.
- `doctor() → Diagnosis`. `lessons() → {text, arms: [{arm, wins, losses, mean}]}`.
- `on(event, handler)` : événements `video.ready`, `video.failed`, `video.published`, `video.rejected`, transmis au module webhooks.

Une erreur métier est une classe avec un `code` (`bad_request`, `not_found`, `ambiguous_ref`, `confirmation_required`, `conflict`). HTTP et MCP la traduisent tels quels.

### 4.2 Serveur HTTP

| Méthode | Chemin | Rôle |
| --- | --- | --- |
| GET | `/` | Studio |
| GET | `/studio/*` | ressources du Studio |
| GET | `/api/v1/health` | `{ok, version}` (sans token) |
| GET | `/api/v1/openapi.json` | contrat |
| GET | `/api/v1/doctor` | état de l'usine |
| GET | `/api/v1/videos?status=&limit=` | liste |
| POST | `/api/v1/videos` | fabriquer → 202 + tâche |
| GET | `/api/v1/videos/:ref` | détail |
| GET | `/api/v1/videos/:ref/video` | MP4 (Range) |
| POST | `/api/v1/videos/:ref/publish` | `{confirm: "OUI #ref"}` |
| POST | `/api/v1/videos/:ref/reject` | jeter |
| POST | `/api/v1/videos/:ref/redo` | refaire → 202 + tâche |
| GET | `/api/v1/tasks` · `/api/v1/tasks/:id` | suivi |
| POST | `/api/v1/lint` | vérifier un script |
| GET | `/api/v1/lessons` | ce qui marche |
| POST/GET/DELETE | `/mcp` | MCP HTTP streamable (sans état) |

Erreurs : `{error: {code, message, details?}}` avec le statut HTTP correspondant (400, 401, 403, 404, 409, 413, 415, 428). Token : `Authorization: Bearer <SEPTIM_TOKEN>` quand il est défini. `/` et `/studio/*` restent accessibles ; le Studio garde alors le token, passé une fois par `?token=`, dans `localStorage`.

### 4.3 MCP

- Outils :
  - `septim_create_video {topic?, template?, lang?, script?, wait_seconds?}` ;
  - `septim_get_task {id}` ;
  - `septim_list_videos {status?, limit?}` ;
  - `septim_get_video {ref}` ;
  - `septim_lint_script {script, topic?, template?, lang?}` ;
  - `septim_publish_video {ref, confirmation}` ;
  - `septim_reject_video {ref}` ;
  - `septim_doctor {}` ;
  - `septim_lessons {}`.
- La description de `septim_publish_video` dit : n'appelle cet outil que si l'humain a écrit `OUI #ref` pour cette vidéo dans la conversation.
- Ressources : `septim://checklist` (viral-checklist.json) et `septim://guide-heat` (guide d'écriture H.E.A.T).
- Prompt : `nouvelle_video {sujet}`.
- Le serveur stdio se place dans le dossier du repo (`SEPTIM_ROOT`, sinon le dossier de `bin/septim.mjs`) et charge `.env`. Il n'écrit jamais sur stdout hors protocole (logs vers stderr).

### 4.4 Studio

Une page :
- **En-tête** : état de l'usine (voix, script auto, publication, WhatsApp).
- **Fabriquer** : sujet, template (auto, histoire, maths, film), langue, et en option un script JSON avec un bouton « Vérifier ».
- **Tâches en cours**, avec leur état.
- **Vidéos** : lecteur 9:16, hook, durée, voix, légende avec « Copier la légende », statut. Actions : Publier (en deux temps, « Confirmer OUI #ref »), Jeter, Refaire.
- **Ce qui marche** : leçons et classement des bras.
- **Brancher** : URL de l'API, état du token, commandes `septim connect`.

Identité reprise du site (nuit, craie, camwood, raphia ; Anybody servie depuis `node_modules`). Accessible au clavier, AA, 390 px.

### 4.5 Terminal `septim`

`septim` sans argument affiche l'aide en français. Commandes :

| Commande | Rôle |
| --- | --- |
| `video "sujet" [--template] [--lang] [--script] [--broll] [--no-notify]` | fabriquer une vidéo |
| `lint <script.json> [--template] [--lang]` | vérifier un script |
| `videos [--status]` | lister les vidéos |
| `voir <ref>` | détail d'une vidéo |
| `publier <ref>` | publier |
| `jeter <ref>` | jeter |
| `studio [--port 4321] [--host 127.0.0.1]` | Studio + API + MCP HTTP |
| `start` | tout, en permanence |
| `mcp` | serveur MCP stdio |
| `doctor` | diagnostic |
| `connect <client> [--write]` | brancher un client MCP |
| `setup` | brancher Claude Code + diagnostic |
| `design init [dossier]` | installer septim-design dans un autre projet |

Les alias anglais (`create`, `list`, `show`, `publish`, `reject`) sont acceptés. `npm run viral -- …` garde son comportement actuel.

### 4.6 Webhooks

`POST VIRAL_WEBHOOK_URL`. Corps :

```json
{"event", "at", "video": {"id", "ref", "status", "hook", "topic", "template", "durationMs", "caption", "hashtags", "videoUrl"}}
```

En-têtes :
- `X-Septim-Event` ;
- `X-Septim-Delivery` (uuid) ;
- `X-Septim-Signature: sha256=<hex>`, HMAC du corps brut avec `VIRAL_WEBHOOK_SECRET`.

Délai de 10 s, 3 essais (1 s puis 5 s). Un échec est journalisé et ne casse jamais l'usine. `videoUrl` n'est rempli que si `SEPTIM_PUBLIC_URL` est défini.

## 5. Erreurs et cas limites

- Port déjà pris : message clair, avec `--port`.
- Client MCP qui coupe pendant un rendu : la tâche continue sur disque.
- Deux portes qui publient en même temps : verrou fichier, la seconde reçoit `conflict` « déjà en cours ».
- Référence inconnue : 404. Référence ambiguë : 409 avec la liste.
- Script invalide : 400 avec les règles enfreintes.
- `.septim-viral` absent : créé.
- `job.json` corrompu : ignoré dans la liste, signalé sur stderr.
- Rendu impossible (Chrome manquant) : tâche `failed`, avec le message.

## 6. Tests

- vitest, en TDD :
  - `factory` (confirmation, ambiguïté, tâches, événements) ;
  - `store` (atomique, corrompu, `updateState` concurrent) ;
  - verrou ;
  - `publishWithLedger` multi-processus (deux processus réels via `child_process`) ;
  - serveur (vraies requêtes HTTP sur un port éphémère, avec garde-fous Host, Origin, token, 415, 413, Range) ;
  - OpenAPI ↔ routes ;
  - MCP (client SDK en mémoire : liste des outils, refus sans confirmation, création de tâche) ;
  - webhooks (signature vérifiable, nouvel essai) ;
  - `septim` (aide, `connect` pour chaque client, alias) ;
  - documentation des variables d'environnement.
- Navigateur (Playwright) : le Studio liste un vrai job, lit la vidéo, vérifie un script, publie en deux temps (mode manuel), 0 erreur console, 390 px sans débordement, clavier.
- De bout en bout : `septim studio`, puis POST `/api/v1/videos` (vrai rendu), puis la tâche passe à `done`. MCP stdio réel lancé par `septim mcp` et interrogé par un client SDK.
- Sous-agents :
  - test de la documentation : un agent neuf suit uniquement `docs/GUIDE.md` depuis un clone propre, puis lance chaque porte et rapporte chaque frottement ;
  - test GREEN de `/septim-viral:aide` et `/septim-viral:publier` ;
  - revue finale indépendante.

## 7. Addendum du 5 octobre : gratuit d'abord, qualité imbattable

Demandes de l'utilisateur pendant l'exécution : « trouve des alternatives puissantes et gratuites à celles payantes […], l'option payante doit venir en second lieu, l'option gratuite doit pouvoir tout faire », puis « je ne veux pas revenir sur la qualité des vidéos générées, elles doivent être imbattables » et « utilise autant d'outils que possible si ça perfectionne ».

Recherche du 5 octobre 2026 (sources dans `.claude/INVENTAIRE-DESIGN-2026.md`) : vidéo IA ouverte en local via ComfyUI — Wan 2.2 TI2V-5B (Apache 2.0, ~8 Go de VRAM en natif ComfyUI), LTX-2.3 (licence communautaire gratuite sous 10 M$ de revenus, son synchronisé, 8 Go+), HunyuanVideo 1.5 (~14 Go) ; banques vidéo libres Pexels et Pixabay (clé gratuite, usage commercial sans attribution) ; voix Chatterbox Multilingual (MIT, français) en plus de Piper ; musique ACE-Step 1.5 (open source, < 4 Go de VRAM) ; images FLUX.2 [klein] 4B et Qwen-Image (Apache 2.0) ; Hugging Face ZeroGPU : 5 min de GPU par jour en compte gratuit (trop peu pour une usine, cité comme dépannage).

| # | Décision | Pourquoi | Coût si faux |
| --- | --- | --- | --- |
| D21 | Gratuit d'abord : chaque capacité a une voie gratuite par défaut, sans compte ni crédit ; PRO n'est proposé qu'en amélioration, coût affiché, après un oui chiffré. La règle d'or de CLAUDE.md est réécrite dans cet ordre | Demande explicite ; la voie gratuite doit suffire | Rien |
| D22 | B-roll gratuit en trois étages, `VIRAL_BROLL=auto` : (1) IA locale ComfyUI (Wan 2.2 5B) si `COMFYUI_URL` répond, (2) banques libres Pexels puis Pixabay si une clé gratuite est posée, (3) fonds procéduraux Remotion. `--broll dossier` (tes clips, ou PRO) passe toujours avant. Un étage qui échoue passe au suivant : le rendu n'échoue jamais à cause du B-roll | Le B-roll en rapport avec le sujet est ce que vendent Higgsfield, Runway et Pika ; Pexels marche sans GPU, ComfyUI fait de l'IA sans crédit | Une clé à demander (Pexels, gratuite) ; un GPU pour l'étage IA |
| D23 | Un beat peut porter `visual` (description du plan, en anglais de préférence) ; sans elle, la requête vient du mot fort et du sujet | Claude écrit le script : il écrit aussi les plans. Les banques et les modèles vidéo comprennent mieux une description concrète | Rien (champ optionnel) |
| D24 | Voix : Piper reste le défaut (CPU) ; `VIRAL_TTS=chatterbox` (Chatterbox Multilingual, MIT) s'installe par `septim setup --voix-hd` dans le même venv | Voix plus expressive, gratuite ; Piper reste rapide partout | Téléchargement lourd (torch) ; GPU conseillé |
| D25 | Musique : `VIRAL_MUSIC_DIR` = dossier de pistes à toi (ACE-Step 1.5 en local, bibliothèques libres) ; l'usine en choisit une par vidéo à la place du lit procédural | Musique « vraie » sans crédit ; le lit procédural reste le défaut | Droits des pistes : à la charge de l'utilisateur (documenté) |
| D26 | Le diagnostic dit l'étage de B-roll, la voix et la musique, avec les commandes gratuites pour monter d'un cran (ComfyUI + Wan 2.2, clé Pexels, Chatterbox, ACE-Step) | Une seule commande pour savoir comment tout avoir en gratuit | Rien |
| D27 | Skills `hero-shot` et `cinematic-dolly` : échelle FREE code (Remotion) → FREE IA locale (ComfyUI Wan 2.2 / LTX-2) → PRO à crédits | Même règle pour le site | Rien |
| D28 | Qualité des templates mesurée, pas seulement regardée : hook entier à l'écran dès la première image, tout texte dans la zone sûre TikTok/Reels/Shorts, un changement visuel par segment, mot fort géant animé (compteur pour les nombres en maths), bruitages générés (whoosh par segment, « ding » au payoff), CRF 18. Vérifié par tests sur la mise en page et les temps, puis par rendus réels des 3 templates relus image par image | « Imbattable » doit être vérifiable | Rendus plus lourds (CRF 18) |
