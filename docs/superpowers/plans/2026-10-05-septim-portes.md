# SEPTIM : toutes les portes — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** piloter l'usine SEPTIM depuis le navigateur, le terminal, Claude Code, n'importe quel client MCP, l'API HTTP (n8n, Make, Zapier…) et WhatsApp. Un seul cœur garantit partout « jamais sans OUI, jamais deux fois ». S'y ajoutent une installation en une commande et un mode d'emploi complet.

**Architecture :**
- `factory.ts` est la seule façade métier.
- Un serveur `node:http` sert l'API REST, l'OpenAPI, le Studio HTML et le MCP HTTP.
- `septim mcp` sert le MCP en stdio.
- Un exécutable `septim` regroupe toutes les commandes.
- La sûreté entre processus repose sur des écritures atomiques et des verrous de fichier.

**Tech Stack :** Node 22, TypeScript (tsx), vitest 5, `@modelcontextprotocol/sdk` 1.x, zod (déjà requis par le SDK), Playwright (tests navigateur, déjà installé globalement).

**Spec :** `docs/superpowers/specs/2026-10-05-septim-portes-design.md`

## Global Constraints

- Aucune porte ne publie sans la phrase `OUI #<ref>` (D7). Seules exceptions : `septim publier <ref>` et `/septim-viral:publier <ref>`, où l'humain tape lui-même la commande.
- Aucune porte n'appelle `runJob`, `publishJob` ou Postiz directement. Tout passe par `factory.ts` (D1).
- Écoute par défaut sur `127.0.0.1:4321`. Un autre hôte sans `SEPTIM_TOKEN` fait refuser le démarrage (D10).
- Corps des requêtes : 1 Mo maximum ; POST seulement en `application/json`.
- Erreurs JSON `{error:{code,message,details?}}`. Codes : `bad_request` 400, `unauthorized` 401, `forbidden` 403, `not_found` 404, `ambiguous_ref` 409, `conflict` 409, `payload_too_large` 413, `unsupported_media_type` 415, `confirmation_required` 428.
- Le MCP stdio n'écrit rien sur stdout hors protocole ; ses logs vont vers stderr.
- Textes destinés à l'utilisateur en français. Noms de code en anglais, comme dans l'existant.
- Les templates du plugin restent la source de vérité (CLAUDE.md). Tout fichier ajouté au plugin passe `claude plugin validate --strict`.
- Aucune nouvelle dépendance sauf `@modelcontextprotocol/sdk` (et `zod` si le SDK ne l'apporte pas en dépendance utilisable).
- Sujet : 500 caractères maximum, une fois nettoyé. Liste : `limit` maximum 100, 20 par défaut.

## Review Focus

1. **Lancement depuis un autre dossier** (`septim studio` lancé depuis `~`) : l'usine doit trouver `.env`, `.septim-viral` et `src/remotion` du repo. Test en Task 7 : `septim doctor` lancé depuis un dossier temporaire sort en 0 et lit le bon `VIRAL_HOME`.
2. **Client qui coupe pendant un rendu** : la tâche continue et finit `done` sans que personne n'interroge. Test en Task 2.
3. **Référence tapée « #5F8A » ou « 5f8a »** : même vidéo dans les portes HTTP, MCP et CLI. Test en Task 2 (`normalizeRef`).
4. **`video.mp4` supprimé du disque** : `GET …/video` répond 404 JSON, jamais un plantage. Test en Task 4.
5. **Sujet avec accents ou emojis, ou trop long** : les accents survivent de bout en bout ; plus de 500 caractères donne 400. Test en Task 4.

---

### Task 1 : Sûreté multi-processus (store, verrous, registre de publication)

**Files :**
- Create : `src/viral-engine/lock.ts`
- Modify : `src/viral-engine/store.ts`, `src/viral-engine/daemon.ts` (`publishWithLedger`, `collectRewards`), `src/viral-engine/pipeline.ts` (fin de `runJob` : `updateState`), `src/viral-engine/notify.ts` (déconnexion WhatsApp)
- Test : `src/viral-engine/__tests__/store.test.ts` (nouveau), `src/viral-engine/__tests__/daemon.test.ts`, `src/viral-engine/__tests__/notify.test.ts`, `src/viral-engine/__tests__/fixtures/publish-child.ts` (processus enfant pour le test multi-processus)

**Interfaces :**
- Produces :
  - `tryLock(path: string, staleMs = 15*60_000): (() => void) | null` ;
  - `withLock<T>(path: string, fn: () => T | Promise<T>, opts?: {waitMs?: number; staleMs?: number}): Promise<T>`, qui attend en scrutant toutes les 25 ms jusqu'à `waitMs` (5000 par défaut), puis lève `LockTimeout` ;
  - `writeJsonAtomic(path, data): void` ;
  - `Store.updateState(fn: (s: ViralState) => ViralState): Promise<ViralState>` ;
  - `Store.resolveRef(ref: string): Job`, qui lève `RefError` avec `code: "not_found" | "ambiguous_ref"` et `matches: Job[]` ;
  - `normalizeRef(input: string): string`, qui enlève `#` et les espaces et passe en minuscules.
- Consumes : `Job`, `ViralState` (existants).

- [ ] **Step 1 : tests en échec** dans `store.test.ts`.
  - `saveJob est atomique : aucun fichier .tmp ne reste et le JSON est complet`.
  - `listJobs ignore un job.json corrompu et le signale sur stderr` : un fichier `{"id":` est écrit à la main ; `listJobs()` renvoie les 2 jobs valides ; `console.error` est appelé une fois.
  - `updateState ne perd aucune mise à jour` : 20 appels `updateState(s => ({...s, viewsHistory:[...s.viewsHistory, i]}))` en parallèle (`Promise.all`) donnent un `viewsHistory` de longueur 20.
  - `resolveRef : préfixe unique, insensible à # et à la casse` : `resolveRef("#5F8A")` renvoie le job `5f8a…`.
  - `resolveRef : préfixe ambigu → ambiguous_ref avec la liste` : jobs `ab12…` et `ab34…`, `resolveRef("ab")` lève une erreur avec `code` `ambiguous_ref` et `matches.length === 2`.
  - `resolveRef : inconnu → not_found`.
  - `tryLock : un second verrou échoue tant que le premier n'est pas relâché ; un verrou plus vieux que staleMs est repris`.
- [ ] **Step 2 : tests en échec** dans `daemon.test.ts`.
  - `publishWithLedger relit le job sous verrou : déjà publié par un autre processus → aucun appel à publish`. On appelle avec un objet `job` périmé (`status "notified"`) alors que le disque dit `published` ; `publish` est appelé 0 fois et le message dit « déjà publiée ».
  - `deux processus qui publient en même temps : une seule publication`. Deux enfants lancent `tsx fixtures/publish-child.ts <home> <id>` en même temps. Leur `publish` factice ajoute une ligne dans `<home>/calls.log` après 300 ms. Le fichier a exactement 1 ligne.
- [ ] **Step 3 : test en échec** dans `notify.test.ts`.
  - `WhatsApp déconnecté → le processus quitte (pm2 relance)`. `createWhatsAppNotifier(cfg, {load, exit})` reçoit un `load` qui renvoie une fausse lib : le Client est un `EventEmitter` qui émet `ready`, `info.wid._serialized = "me@c.us"`, et `initialize` se résout. Après `start()`, on émet `disconnected` : `exit` est appelé avec 1. Même chose pour `auth_failure`.
- [ ] **Step 4 : lancer** `npx vitest run src/viral-engine/__tests__/store.test.ts src/viral-engine/__tests__/daemon.test.ts src/viral-engine/__tests__/notify.test.ts`. Attendu : les nouveaux tests échouent, sur fonction absente ou sur une assertion.
- [ ] **Step 5 : implémenter.**
  - `lock.ts` : `openSync(path,"wx")` ; on écrit `pid` et la date dans le fichier ; un verrou orphelin est repéré par son `mtime`.
  - `store.ts` : `writeJsonAtomic` (tmp + `renameSync`) pour `saveJob` et `saveState` ; `updateState` sous `withLock(join(home,"state.lock"))`, qui relit l'état puis l'écrit.
  - `publishWithLedger` :
    1. `tryLock(join(jobsDir,id,"publish.lock"))` ; s'il échoue, notifier « Publication de #ref déjà en cours. » et sortir ;
    2. relire le job avec `store.getJob(id)` ;
    3. si le job est `published`, notifier « #ref est déjà publiée. » et sortir ;
    4. sinon garder la logique actuelle sur le job relu ;
    5. relâcher le verrou dans `finally`.
  - `runJob` (fin) et `collectRewards` passent par `updateState`.
  - `createWhatsAppNotifier(cfg, deps?: {load?: () => Promise<{lib, qrcode}>; exit?: (code:number)=>void})` : sur `disconnected` et `auth_failure`, `console.error` puis `exit(1)`.
- [ ] **Step 6 : lancer** `npm test`. Attendu : tout vert (165 + nouveaux).
- [ ] **Step 7 : commit** `fix(viral): sûreté multi-processus — écritures atomiques, verrous, références ambiguës, WhatsApp qui se relance`.

### Task 2 : Cœur `factory.ts` (tâches, confirmation, événements)

**Files :**
- Create : `src/viral-engine/factory.ts`, `src/viral-engine/errors.ts`
- Test : `src/viral-engine/__tests__/factory.test.ts`

**Interfaces :**
- Consumes : de la Task 1, `createStore`, `Store.resolveRef`, `normalizeRef`, `RefError`. Existants : `runJob(req, partial)`, `checkScript`, `cleanTopic`, `publishWithLedger(job, deps)`, `publishJob`, `resolveModeFromEnv`, `diagnose`, `probe`, `loadConfig`, `jobRef`, `postText`.
- Produces :
  - `errors.ts` :
    - `class FactoryError extends Error { code: ErrorCode; status: number; details?: unknown }` ;
    - `type ErrorCode = "bad_request"|"unauthorized"|"forbidden"|"not_found"|"ambiguous_ref"|"conflict"|"payload_too_large"|"unsupported_media_type"|"confirmation_required"` ;
    - `STATUS: Record<ErrorCode, number>`.
  - `factory.ts`, types :
    - `type Task = {id: string; kind: "create"|"redo"; status: "queued"|"running"|"done"|"failed"; request: VideoRequest; jobId?: string; ref?: string; error?: string; createdAt: string; updatedAt: string}` ;
    - `type VideoRequest = {topic?: string; template?: TemplateId; lang?: Lang; script?: Partial<ViralScript>}` ;
    - `type VideoSummary = {id; ref; status; hook; topic; template; lang; durationMs; voice; source; createdAt; publishedAt?; hasVideo: boolean}` ;
    - `type VideoDetail = VideoSummary & {caption; hashtags; script: ViralScript; videoPath?: string; posted?; error?; publishMode}` ;
    - `type FactoryEvent = "video.ready"|"video.failed"|"video.published"|"video.rejected"`.
  - `factory.ts`, fabrique :

    ```ts
    createFactory(deps?: Partial<{
      env: Env;
      runJob: (req: JobRequest, partial: Partial<PipelineDeps>) => Promise<Job>;
      publish: (job: Job) => Promise<PublishResult>;
      notify: (text: string, media?: string) => Promise<void>;
      probe: () => Promise<Probes>;
    }>)
    ```

  - `factory.ts`, méthodes renvoyées :
    - `createVideo(req: VideoRequest): Task` ;
    - `redo(ref: string): Task` ;
    - `getTask(id: string): Task` (lève `not_found`) ;
    - `listTasks(): Task[]` ;
    - `idle(): Promise<void>` (la file est vide) ;
    - `listVideos(q?: {status?: JobStatus; limit?: number}): VideoSummary[]` ;
    - `getVideo(ref: string): VideoDetail` ;
    - `videoFile(ref: string): string` (chemin absolu ; lève `not_found` si le fichier manque) ;
    - `lintScript(script: unknown, opts?: {topic?: string; template?: TemplateId; lang?: Lang}): {ok: boolean; issues: {rule: string; message: string}[]; durationMs: number; payoffRatio: number}` ;
    - `publish(ref: string, confirm: string): Promise<{ref; status: JobStatus; posted; manualText?: string; message: string}>` ;
    - `reject(ref: string): VideoSummary` ;
    - `doctor(): Promise<ReturnType<typeof diagnose>>` ;
    - `lessons(): {text: string; arms: {arm: string; alpha: number; beta: number; mean: number}[]}` ;
    - `on(event: FactoryEvent, handler: (v: VideoDetail) => void): () => void` ;
    - `home: string`.

- [ ] **Step 1 : tests en échec** dans `factory.test.ts`. Ils tournent dans un `VIRAL_HOME` temporaire, avec un faux `runJob` qui écrit un job `notified` et un fichier `video.mp4`.
  - `createVideo rend la main tout de suite (queued) et la tâche finit done avec jobId et ref, même si personne n'interroge` : on attend `idle()`, puis on relit le fichier `tasks/<id>.json` sur disque.
  - `createVideo : template inconnu → bad_request ; langue autre que fr/en → bad_request ; sujet nettoyé de plus de 500 caractères → bad_request`.
  - `createVideo avec un script refusé par le linter → bad_request avec details.issues, aucune tâche créée`.
  - `les tâches passent une par une (file)` : deux `createVideo`, et le second `runJob` démarre après la fin du premier.
  - `runJob qui lève → tâche failed avec le message, événement video.failed`.
  - `publish sans confirmation ou avec « oui » → confirmation_required`.
  - `publish avec « OUI #<ref> » d'une AUTRE vidéo → confirmation_required`.
  - `publish avec « oui #5F8A » (casse et # libres) → publie une fois, événement video.published`.
  - `getVideo("#5F8A") et getVideo("5f8a") → même vidéo ; référence ambiguë → ambiguous_ref (409) avec details.matches`.
  - `videoFile : mp4 supprimé → not_found`.
  - `reject → statut rejected, événement video.rejected ; publish après reject → conflict`.
  - `lessons : classe les bras par moyenne alpha/(alpha+beta) décroissante et renvoie LESSONS.md (chaîne vide si absent)`.
- [ ] **Step 2 : lancer** `npx vitest run src/viral-engine/__tests__/factory.test.ts`. Attendu : échec, module introuvable.
- [ ] **Step 3 : implémenter.**
  - Les tâches sont persistées par `writeJsonAtomic(home/tasks/<id>.json)`, avec un id `randomUUID().slice(0,8)`.
  - La file est une chaîne de promesses par instance.
  - Le `runJob` par défaut est celui de `pipeline.ts`, avec un `notify` par défaut sur la console. Le pipeline ne sait que rendre ; c'est la fabrique qui émet `video.ready` après le `runJob`.
  - Le `publish` par défaut reprend `publishJob(job, resolveModeFromEnv(env), cfg.platforms, cfg.tiktokMethod)`, enveloppé dans `publishWithLedger` avec un `notify` qui capture le message renvoyé.
  - La confirmation est valide quand `confirm` correspond à `^\s*oui\s*#?\s*([0-9a-f]{4,})\s*$` (insensible à la casse) et que `resolveRef` de ce groupe donne le même `job.id`.
- [ ] **Step 4 : lancer** `npm test`. Attendu : tout vert.
- [ ] **Step 5 : commit** `feat(viral): factory — un seul cœur pour toutes les portes (tâches, OUI #ref, événements)`.

### Task 3 : Webhooks sortants

**Files :**
- Create : `src/viral-engine/webhooks.ts`
- Test : `src/viral-engine/__tests__/webhooks.test.ts`

**Interfaces :**
- Consumes : `FactoryEvent` et `VideoDetail` (Task 2), `factory.on`.
- Produces :
  - `signBody(body: string, secret: string): string`, qui renvoie `"sha256=" + hex HMAC` ;
  - `deliverWebhook(url, event, payload, opts: {secret?: string; fetchImpl?: typeof fetch; retryDelaysMs?: number[]}): Promise<{ok: boolean; attempts: number}>` ;
  - `attachWebhooks(factory, env, fetchImpl?): () => void` (sans effet si `VIRAL_WEBHOOK_URL` est vide) ;
  - `webhookPayload(event, video: VideoDetail, publicUrl?: string)`.

- [ ] **Step 1 : tests en échec.**
  - `signBody est vérifiable avec crypto.createHmac côté récepteur`.
  - `deliverWebhook envoie X-Septim-Event, X-Septim-Delivery (uuid), X-Septim-Signature et Content-Type JSON`.
  - `500 puis 200 → 2 essais, ok` (avec `retryDelaysMs: [0,0]`).
  - `3 échecs → ok false, ne lève jamais`.
  - `payload : videoUrl seulement si SEPTIM_PUBLIC_URL, sans chemin disque`.
  - `attachWebhooks sans URL ne s'abonne pas`.
- [ ] **Step 2 : lancer** `npx vitest run src/viral-engine/__tests__/webhooks.test.ts`. Attendu : échec.
- [ ] **Step 3 : implémenter.** Délais par défaut `[1000, 5000]` ; chaque requête a un délai de 10 s (`AbortSignal.timeout`).
- [ ] **Step 4 : lancer** `npm test`. Attendu : vert.
- [ ] **Step 5 : commit** `feat(viral): webhooks signés vers n'importe quel logiciel`.

### Task 4 : Serveur HTTP + API REST + OpenAPI

**Files :**
- Create : `src/viral-engine/server/http.ts` (création du serveur, garde-fous, routeur), `src/viral-engine/server/routes.ts` (routes API), `src/viral-engine/server/openapi.ts` (objet OpenAPI 3.1), `src/viral-engine/server/static.ts` (fichiers du Studio et police), `src/viral-engine/studio/index.html` (provisoire : titre et `<main>` vide, rempli en Task 6)
- Test : `src/viral-engine/__tests__/server.test.ts`

**Interfaces :**
- Consumes : `createFactory` et ses méthodes (Task 2), `FactoryError` et `STATUS` (Task 2), `attachWebhooks` (Task 3).
- Produces :
  - `startServer(opts: {factory: Factory; port?: number; host?: string; token?: string; corsOrigins?: string[]; mcp?: McpHttpHandler}): Promise<{url: string; port: number; close(): Promise<void>}>`. Lève `FactoryError("forbidden")` si l'hôte n'est pas une boucle locale et que `token` est vide.
  - `type McpHttpHandler = (req: IncomingMessage, res: ServerResponse, body: unknown) => Promise<void>`, branché en Task 5.
  - `openapi: object` ; `ROUTES: {method: string; path: string}[]`, la table du routeur, exportée pour le test de cohérence.

- [ ] **Step 1 : tests en échec** (vrai serveur sur le port 0, fabrique avec un faux `runJob`, `fetch` natif).
  - `GET /api/v1/health → 200 {ok:true, version} même avec token`.
  - `POST /api/v1/videos {topic:"La tontine à Douala 🇨🇲"} → 202, tâche queued, et le sujet garde ses accents dans la tâche finie`.
  - `POST /api/v1/videos sujet de 501 caractères → 400 bad_request`.
  - `POST sans Content-Type JSON → 415 ; corps de plus de 1 Mo → 413 ; JSON invalide → 400`.
  - `Host: evil.example → 403 (DNS rebinding) ; Origin: https://evil.example → 403`.
  - `token défini : sans Authorization → 401 ; avec Bearer → 200`.
  - `startServer host 0.0.0.0 sans token → refuse de démarrer`.
  - `GET /api/v1/videos/:ref en 4 caractères, avec # encodé → 200 ; référence ambiguë → 409 avec details.matches`.
  - `POST /api/v1/videos/:ref/publish sans confirm → 428 ; avec « OUI #ref » → 200, une seule publication`.
  - `GET /api/v1/videos/:ref/video avec Range: bytes=0-99 → 206, Content-Length 100, Content-Type video/mp4 ; sans Range → 200 ; mp4 supprimé → 404 JSON`.
  - `GET /api/v1/tasks/:id, /lessons, /doctor (probe factice), POST /lint → formes attendues`.
  - `GET / → 200 text/html ; GET /studio/../../package.json → 404 (pas de traversée)`.
  - `chaque route de ROUTES figure dans openapi.paths avec la même méthode, et réciproquement`.
  - `route inconnue → 404 JSON not_found`.
- [ ] **Step 2 : lancer** `npx vitest run src/viral-engine/__tests__/server.test.ts`. Attendu : échec.
- [ ] **Step 3 : implémenter.**
  - Routeur en table, segments `:param`.
  - Lecture du corps limitée à 1 Mo.
  - Hôtes permis : `localhost`, `127.0.0.1` et `[::1]` avec le port, plus l'hôte du serveur quand il écoute ailleurs et que le token est défini.
  - `Origin` permis : celui du serveur et `corsOrigins`.
  - `/studio/*` est servi depuis `src/viral-engine/studio/` (chemin résolu et vérifié sous la racine). La police vient de `/studio/fonts/anybody.woff2`, lue dans `node_modules/@fontsource-variable/anybody/files/anybody-latin-wght-normal.woff2`.
  - `version` lue dans `package.json`.
- [ ] **Step 4 : lancer** `npm test`. Attendu : vert.
- [ ] **Step 5 : commit** `feat(viral): API HTTP locale sécurisée + contrat OpenAPI`.

### Task 5 : Serveur MCP (stdio + HTTP)

**Files :**
- Create : `src/viral-engine/mcp.ts`
- Modify : `package.json` (dépendance `@modelcontextprotocol/sdk`)
- Test : `src/viral-engine/__tests__/mcp.test.ts`

**Interfaces :**
- Consumes : `Factory` (Task 2), `McpHttpHandler` (Task 4), `viral-checklist.json`, `plugins/septim-viral/skills/viral/references/heat.md`.
- Produces :
  - `createMcpServer(factory: Factory): McpServer` ;
  - `runStdio(factory): Promise<void>` ;
  - `mcpHttpHandler(factory): McpHttpHandler`, en mode sans état : un serveur et un transport par requête, `sessionIdGenerator: undefined`.
- Outils, ressources et prompt : exactement les noms du spec §4.3. Chaque outil renvoie `content:[{type:"text", text: JSON lisible}]` ; une erreur métier renvoie `isError: true` avec `code` et `message`.

- [ ] **Step 1 : installer** `npm i @modelcontextprotocol/sdk`, puis lire `node_modules/@modelcontextprotocol/sdk/README.md` (API `McpServer.registerTool`, `registerResource`, `registerPrompt`, `InMemoryTransport`, `StreamableHTTPServerTransport`).
- [ ] **Step 2 : tests en échec** (`Client` du SDK relié par `InMemoryTransport.createLinkedPair()`).
  - `liste les 9 outils, les 2 ressources et le prompt nouvelle_video`.
  - `septim_publish_video sans la bonne confirmation → isError, code confirmation_required, aucune publication`.
  - `septim_create_video wait_seconds 5 avec faux runJob rapide → renvoie la tâche done et la ref`.
  - `septim_create_video wait_seconds absent → renvoie tout de suite la tâche queued`.
  - `septim_get_video "#5F8A" → détail ; référence ambiguë → isError ambiguous_ref`.
  - `prompt nouvelle_video {sujet} → message qui cite le sujet, la règle OUI #ref et septim_lint_script`.
  - `HTTP : POST /mcp initialize puis tools/list via le serveur de la Task 4 → 9 outils`.
- [ ] **Step 3 : lancer** `npx vitest run src/viral-engine/__tests__/mcp.test.ts`. Attendu : échec.
- [ ] **Step 4 : implémenter** avec des schémas zod. Le texte de la description de `septim_publish_video` est fixé : « Publie une vidéo. N'appelle cet outil QUE si l'humain a écrit lui-même "OUI #<ref>" pour cette vidéo dans la conversation ; passe cette phrase telle quelle dans confirmation. »
- [ ] **Step 5 : lancer** `npm test`. Attendu : vert.
- [ ] **Step 6 : commit** `feat(viral): serveur MCP (stdio + HTTP) — l'usine dans Claude, Cursor, VS Code, n8n…`.

### Task 6 : Studio navigateur

**Files :**
- Create : `src/viral-engine/studio/index.html`, `src/viral-engine/studio/studio.css`, `src/viral-engine/studio/studio.js`
- Test : `scratchpad/studio-test.cjs` (Playwright, hors repo), plus un test vitest `studio.test.ts` qui vérifie que les fichiers du Studio n'appellent que des routes présentes dans `ROUTES`

**Interfaces :**
- Consumes : API de la Task 4, toutes routes `/api/v1/*`.
- Produces : rien en code ; seulement l'interface.

- [ ] **Step 1 : direction visuelle** (skill `septim-design:frontend-design`). C'est un outil de travail : dense, lisible, palette du site (nuit #121640, craie #e9ecf2, camwood #b4432b, raphia #e8c15a, brume #8f97c8), Anybody pour les titres, police système pour le texte.
- [ ] **Step 2 : test en échec** `studio.test.ts` : `studio.js n'appelle que des routes de ROUTES` (extraction des `api("…")` par regex).
- [ ] **Step 3 : implémenter** les sections du spec §4.4.
  - `fetch` avec `Authorization` quand un token est en `localStorage` ; `?token=` est lu une fois puis retiré de l'URL.
  - Interrogation des tâches toutes les 2 s tant qu'une tâche est `queued` ou `running`.
  - Publication en deux temps : « Publier #ref », puis « Confirmer : OUI #ref », qui envoie `confirm: "OUI #ref"`.
  - Erreurs affichées en clair dans une zone `role="status"`.
  - Pas de `innerHTML` avec des données : `textContent`.
- [ ] **Step 4 : test navigateur.** Lancer `septim studio --port 4399` sur un `VIRAL_HOME` temporaire contenant une copie du vrai job `5f8a4d25`, avec `VIRAL_PUBLISH_MODE=manual`. Vérifier :
  - 0 erreur console ;
  - la vidéo se lit (`readyState ≥ 2`) ;
  - « Vérifier » sur un script refusé affiche les règles ;
  - « Publier », puis « Confirmer », puis le statut passe à `published` et la légende s'affiche ;
  - 390 px sans défilement horizontal ;
  - tout le parcours au clavier (Tab + Entrée) ;
  - captures 1440 px et 390 px relues.
- [ ] **Step 5 : lancer** `npm test`, `npm run lint`, `npm run typecheck`. Attendu : vert.
- [ ] **Step 6 : commit** `feat(viral): Studio navigateur — fabriquer, regarder, publier avec OUI`.

### Task 7 : Exécutable `septim` (terminal, start, connect, setup)

**Files :**
- Create : `bin/septim.mjs`, `src/viral-engine/septim.ts` (répartiteur), `src/viral-engine/connect.ts` (configurations des clients MCP), `src/viral-engine/setup.ts`
- Modify : `src/viral-engine/cli.ts` (exporter `runCli(argv: string[])`, sans exécution à l'import), `src/viral-engine/daemon.ts` (`main` démarre aussi le serveur quand `SEPTIM_PORT` ≠ `0`), `package.json` (`"bin": {"septim": "bin/septim.mjs"}`, script `"septim": "tsx src/viral-engine/septim.ts"`), `ecosystem.config.cjs` (`args: "src/viral-engine/septim.ts start"`)
- Test : `src/viral-engine/__tests__/septim.test.ts`

**Interfaces :**
- Consumes : `createFactory`, `startServer`, `runStdio`, `mcpHttpHandler`, `attachWebhooks`, `runCli`, `diagnose`, `probe`, `formatDiagnosis`.
- Produces :
  - `parseCommand(argv: string[]): {command: string; args: string[]}`. Les alias anglais deviennent les noms français : `create→video`, `list→videos`, `show→voir`, `publish→publier`, `reject→jeter`.
  - `HELP: string`.
  - `MCP_CLIENTS = ["claude-code","claude-desktop","cursor","vscode","windsurf","codex","gemini"] as const`.
  - `mcpConfig(client, {root: string; node: string}): {path: string; content: string; command?: string[]}`.
  - `repoRoot(): string`, qui renvoie `SEPTIM_ROOT` ou le dossier parent de `bin/`.

- [ ] **Step 1 : tests en échec.**
  - `septim sans argument → aide en français qui liste video, studio, start, mcp, connect, publier`.
  - `alias : publish 5f8a → publier ; create → video`.
  - `commande inconnue → sortie 1 avec suggestion`.
  - `mcpConfig pour chaque client : chemin du fichier de config attendu et commande absolue` :
    - claude-desktop → `claude_desktop_config.json` avec `mcpServers.septim.command` absolu ;
    - cursor → `.cursor/mcp.json` ;
    - vscode → `.vscode/mcp.json` avec la clé `servers` et `type: "stdio"` ;
    - windsurf → `~/.codeium/windsurf/mcp_config.json` ;
    - codex → `~/.codex/config.toml` avec `[mcp_servers.septim]` ;
    - gemini → `~/.gemini/settings.json` ;
    - claude-code → `command` = `["claude","mcp","add","--scope","user","septim","--",node,"<root>/bin/septim.mjs","mcp"]`.
  - `lancé depuis un autre dossier : bin/septim.mjs doctor (cwd = dossier temporaire) sort en 0 et affiche « état de l'usine »`. C'est le vrai processus, avec `VIRAL_NOTIFIER=console`.
  - `septim mcp (vrai processus) répond à initialize puis tools/list sur stdio, sans rien d'autre sur stdout` (Client du SDK + `StdioClientTransport`).
- [ ] **Step 2 : lancer** `npx vitest run src/viral-engine/__tests__/septim.test.ts`. Attendu : échec.
- [ ] **Step 3 : implémenter.**
  - `bin/septim.mjs` :
    1. `process.chdir(root)` ;
    2. `register()` de `tsx/esm/api` ;
    3. `import("../src/viral-engine/septim.ts")`.
  - Les commandes `video`, `lint` et `publier` délèguent à `runCli` (comportement inchangé : `npm run viral` = `septim video`).
  - `videos` et `voir` passent par la fabrique.
  - `studio` démarre le serveur, puis affiche l'URL, et l'URL avec `?token=` quand un token existe.
  - `start` lance le démon (`daemon.main`) ; le démon démarre la fabrique, le serveur (`SEPTIM_PORT`, 4321 par défaut) et les webhooks.
  - `mcp` lance `runStdio`.
  - `connect` affiche la configuration ; `--write` l'écrit en fusionnant avec un JSON existant (sans écraser les autres serveurs) ; pour claude-code, il lance la commande.
  - `setup` :
    1. `.env` depuis `.env.example` s'il est absent ;
    2. si `claude` est présent : `claude plugin marketplace add <root>`, puis `claude plugin install septim-design@septim` et `septim-viral@septim`, puis `connect claude-code` ;
    3. `doctor`.
  - `design init [dossier]` lance `node plugins/septim-design/skills/septim-design/scripts/bootstrap.mjs` avec `cwd = dossier`.
- [ ] **Step 4 : lancer** `npm test`, `npm link`, puis `cd /tmp && septim` et `septim connect cursor`. Attendu : aide et configuration affichées.
- [ ] **Step 5 : commit** `feat: commande septim — terminal, start, studio, mcp, connect, setup`.

### Task 8 : Claude Code, installation et documentation

**Files :**
- Create : `plugins/septim-viral/commands/studio.md`, `videos.md`, `publier.md`, `aide.md` ; `scripts/install.sh` ; `docs/GUIDE.md` ; `docs/n8n-septim.json` (workflow de départ : webhook entrant `video.ready` → nœud HTTP qui demande la confirmation) ; `src/viral-engine/__tests__/docs.test.ts`
- Modify : `plugins/septim-viral/skills/viral/SKILL.md` (§ « Portes » : MCP si disponible, sinon `septim`), `plugins/septim-viral/.claude-plugin/plugin.json` (version 1.1.0), `.claude-plugin/marketplace.json` (versions), `README.md`, `.env.example` (`SEPTIM_PORT`, `SEPTIM_HOST`, `SEPTIM_TOKEN`, `SEPTIM_PUBLIC_URL`, `SEPTIM_CORS_ORIGINS`, `SEPTIM_ROOT`, `VIRAL_WEBHOOK_URL`, `VIRAL_WEBHOOK_SECRET`, plus toute variable lue par le code et pas encore listée), `.claude/INVENTAIRE-DESIGN-2026.md`, `CLAUDE.md` (commandes), `.mcp.json` (nouveau, à la racine : `septim` en stdio via `node bin/septim.mjs mcp`)

**Interfaces :**
- Consumes : la commande `septim` (Task 7), les routes (Task 4), les outils MCP (Task 5).

- [ ] **Step 1 : test en échec** dans `docs.test.ts`.
  - `chaque variable lue dans src/viral-engine (process.env.X, env.X) figure dans .env.example`.
  - `GUIDE.md cite chaque commande septim de HELP, chaque client MCP, chaque outil MCP et chaque route d'API`.
  - `les commandes du plugin appellent septim (pas npm run depuis un autre dossier)`.
- [ ] **Step 2 : lancer.** Attendu : échec (GUIDE absent, variables manquantes).
- [ ] **Step 3 : écrire.**
  - Les commandes `/septim-viral:*`, avec un frontmatter `description` et `argument-hint` ; `publier` exige une référence.
  - `install.sh` :
    - `set -euo pipefail` ;
    - vérifie Node ≥ 22 ;
    - `PUPPETEER_SKIP_DOWNLOAD=1 npm install` ;
    - `npm link` (en cas d'échec, explique `npm run septim -- …`) ;
    - option `--voix` (pip `--user` piper-tts + voix) ;
    - lance `septim setup`.
  - Le `GUIDE.md`, avec ces sections : En 1 minute, Installer, Les portes, Navigateur, Terminal, Claude Code, MCP (un bloc par client), API (curl par route), Webhooks (vérifier la signature en Node et en Python), WhatsApp, Recettes (n8n, Make, Zapier, Raccourcis iPhone), Tout lancer en permanence, Le site, Configuration (table de toutes les variables), Dépannage, Sécurité, Ce qui manque encore.
- [ ] **Step 4 : lancer** `npm test`, puis `claude plugin validate --strict plugins/septim-viral` et `claude plugin validate --strict .`, puis `bash -n scripts/install.sh`. Attendu : vert.
- [ ] **Step 5 : commit** `docs: mode d'emploi complet, installation en une commande, commandes /septim-viral:*`.

### Task 10 : Gratuit d'abord (D21–D27)

**Files :** Create `src/viral-engine/broll.ts`, `src/viral-engine/music.ts`, `src/viral-engine/py/chatterbox_tts.py` ; Modify `pipeline.ts`, `types.ts` (`Beat.visual?`), `tts.ts` (moteur chatterbox), `doctor.ts`, `setup.ts` (`--voix-hd`), `septim.ts`, `.env.example`, `docs/GUIDE.md`, `.claude/INVENTAIRE-DESIGN-2026.md`, `CLAUDE.md`, skills `hero-shot`, `cinematic-dolly`, `viral`, `references/heat.md` ; Test `broll.test.ts`, `music.test.ts`, `pipeline.test.ts`, `doctor.test.ts`, `audio.test.ts`.

- [ ] Tests en échec : chaîne ComfyUI → Pexels → Pixabay → procédural (faux serveurs) ; requête construite depuis `visual`, sinon mot fort + sujet ; Pexels choisit un fichier vertical ≥ 1080 de haut ; ComfyUI : POST /prompt, /history, /view ; un étage qui lève passe au suivant ; `--broll` prioritaire ; musique choisie de façon stable par job ; diagnostic des étages ; commande Chatterbox.
- [ ] Implémenter, `npm test`, commit `feat(viral): gratuit d'abord — B-roll IA locale ou banques libres, musique, voix HD`.

### Task 11 : Templates imbattables (D28)

**Files :** Modify `src/remotion/viral/{shared,ViralStory,ViralMaths,ViralFilm,props}.tsx`, `src/viral-engine/render.ts` (CRF 18), `src/viral-engine/sfx.ts` (nouveau, bruitages générés) ; Test `src/viral-engine/__tests__/layout.test.ts`, `sfx.test.ts`.

- [ ] Tests en échec : zones sûres, hook complet dès 0 ms, un changement de scène par segment, taille des sous-titres, temps des bruitages.
- [ ] Implémenter ; rendre les 3 templates ; planches d'images relues ; corriger jusqu'à ce que chaque planche soit irréprochable ; commit `feat(viral): templates imbattables — hook dès la 1re image, zones sûres, bruitages, compteurs`.

### Task 9 : Vérification de bout en bout et tests par sous-agents

- [ ] **Step 1 : vrai rendu par l'API.** `septim studio`, puis `curl POST /api/v1/videos` avec le script tontine. La tâche passe à `done` et `GET …/video` renvoie 206 sur une Range.
- [ ] **Step 2 : MCP stdio réel** (déjà couvert par le test de la Task 7). Plus `claude mcp add` en local, puis `claude mcp list` qui montre `septim … ✓ Connected`.
- [ ] **Step 3 : sous-agent « mode d'emploi ».**
  - Clone propre dans le scratchpad ; l'agent ne lit que `docs/GUIDE.md`.
  - Il installe (`scripts/install.sh`, sans `setup` Claude pour ne pas toucher la config de la session), lance le Studio, appelle l'API, se connecte en MCP et lance `septim videos`.
  - Il rapporte chaque frottement.
  - Chaque frottement réel est corrigé.
- [ ] **Step 4 : sous-agent GREEN** pour `/septim-viral:aide` et `/septim-viral:publier sans référence`. Attendu : la carte des portes, puis un refus avec la marche à suivre.
- [ ] **Step 5 : vérification complète.** `npm test`, typecheck, lint, build, validation des plugins, tests navigateur du site (non régression).
- [ ] **Step 6 : revue finale** par un relecteur neuf, sur le modèle le plus capable, puis une passe de corrections, puis le registre des décisions.
- [ ] **Step 7 : régénérer** le bundle et l'archive des plugins, retenter le push, puis envoyer le guide.
