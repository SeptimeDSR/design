# REPRISE — continuer le projet Septim depuis un autre compte

Ce fichier contient tout ce qu'il faut pour qu'une nouvelle session Claude Code reprenne le travail exactement où il s'est arrêté, sans rien oublier.

1. Rendre le code disponible sur GitHub (§ 1).
2. Ouvrir une session Claude Code sur le dépôt.
3. Coller le prompt du § 2.

---

## 1. Mettre le code sur GitHub

**Fait.** Depuis le 5 octobre, le push marche : le travail est sur `claude/keen-euler-i983wb` (poussée après chaque tâche). La procédure ci-dessous ne sert que si un nouveau compte n'a pas encore l'app GitHub de Claude.

Historique : la première session n'avait pas pu pousser (403), d'où le bundle.

Tu as reçu `septim-design.bundle`, qui contient tout l'historique git. Depuis ton PC (WSL, macOS ou Linux, avec git et ton propre compte GitHub) :

```bash
git clone -b claude/happy-pascal-f10qin septim-design.bundle design
cd design
git remote set-url origin https://github.com/SeptimeDSR/design.git
git push -u origin claude/happy-pascal-f10qin
git push origin claude/happy-pascal-f10qin:main      # branche par défaut du dépôt
```

Ensuite, dans le **nouveau** compte claude.ai :
1. connecte GitHub sur https://claude.ai/connect-github ;
2. installe l'app Claude sur le dépôt `SeptimeDSR/design` (même page) ;
3. lance une session Claude Code sur ce dépôt.

Sans ça, la session pourra lire le code mais pas pousser.

---

## 2. Prompt de reprise (à coller tel quel dans la nouvelle session)

```text
Tu reprends le projet Septim (site qui retient + usine à vidéos virales SEPTIM-VIRAL-OS). Une session précédente a travaillé longtemps ; tout son état est dans le dépôt. Ne refais rien de ce qui est fait, ne redemande rien de ce qui est décidé.

1. Mets-toi sur le bon code :
   git fetch origin claude/keen-euler-i983wb
   Si ta session t'impose une autre branche : git checkout -B <ta-branche> origin/claude/keen-euler-i983wb
   Sinon : git checkout claude/keen-euler-i983wb
   Vérifie l'état exact dans docs/handoff/ledger-septim-portes.md (lignes « Task N: complete »).

2. Lis, dans cet ordre, avant toute action :
   - docs/REPRISE.md (ce guide de reprise : état, règles, pièges, décisions)
   - CLAUDE.md et AGENTS.md (règles du repo ; Next.js 16 diffère de ce que tu connais)
   - docs/superpowers/specs/2026-10-05-septim-portes-design.md (spec en cours, décisions D1–D20)
   - docs/superpowers/plans/2026-10-05-septim-portes.md (plan : 9 tâches, Global Constraints, Review Focus)
   - docs/handoff/ledger-septim-portes.md (registre : tâches 1 à 3 terminées, toutes les décisions)

3. Le registre superpowers (dossier ignoré par git) est remis en place tout seul par le hook SessionStart (.claude/hooks/restore-ledgers.sh). Vérifie que .superpowers/sdd/2026-10-05-septim-portes/progress.md existe ; sinon :
   mkdir -p .superpowers/sdd/2026-10-05-septim-portes
   cp docs/handoff/ledger-septim-portes.md .superpowers/sdd/2026-10-05-septim-portes/progress.md
   echo docs/superpowers/plans/2026-10-05-septim-portes.md > .superpowers/sdd/2026-10-05-septim-portes/plan-path

4. Vérifie l'état : npm install (avec PUPPETEER_SKIP_DOWNLOAD=1), puis npm test (tous verts), npm run typecheck, npm run lint.
   Si les skills superpowers sont absentes : /plugin install superpowers@claude-plugins-official.

5. Reprends l'exécution du plan avec la skill superpowers:executing-plans (exécution inline, par toi), à la première tâche sans ligne « complete » dans le registre. Tâches du plan :
   P4 serveur HTTP + API REST + OpenAPI · P5 serveur MCP stdio + HTTP · P6 Studio navigateur · P7 commande septim (terminal, start, studio, mcp, connect, setup) · P8 commandes /septim-viral:*, install.sh, docs/GUIDE.md complet · P9 vérification de bout en bout, tests par sous-agents (mode d'emploi suivi par un agent neuf sur un clone propre ; GREEN des commandes), revue finale par un relecteur neuf sur le modèle le plus capable, passe de corrections.
   TDD strict : test écrit d'abord, échec observé, puis code, puis suite complète. Chaque écart au plan = une ligne « Task N: Ruling: … — pourquoi — coût si faux » dans le registre. Après chaque tâche : commit, task-done, et recopie le registre dans docs/handoff/ledger-septim-portes.md (pour qu'il survive à un nouveau changement de compte).

6. Règles non négociables :
   - jamais de publication sans la phrase « OUI #ref » d'un humain pour CETTE vidéo ;
   - jamais de crédits dépensés (Higgsfield, Runway, Pika…) sans coût affiché et oui explicite ;
   - commentaire « // BESOIN CREDIT: … Alternative gratuite: … » et version FREE toujours codée ;
   - les templates du plugin septim-design sont la source de vérité : toute correction est reportée des deux côtés ;
   - aucun secret dans le repo.

7. L'utilisateur parle français, t'a délégué toutes les décisions (« décide tout pour moi »), veut le niveau des meilleurs, déteste les erreurs « commande introuvable », veut des rapports honnêtes (ce qui n'a pas été vérifié est dit). Décide, note la décision dans le registre, continue sans demander. Ne t'arrête que pour : action irréversible, action sensible (sécurité), effet hors du dépôt qui demande l'accord (push sur une autre branche, publication, dépense).

8. À la fin : message final en français avec « Décisions prises pour toi » (toutes les lignes Ruling, avec leur coût) et « Petits défauts laissés » (toutes les lignes minor deferred), ce qui a été vérifié et ce qui ne l'a pas été. Push sur la branche, puis lien vers docs/GUIDE.md.
```

---

## 3. État exact au moment du départ

**Branche :** `claude/keen-euler-i983wb` (repart de `claude/happy-pascal-f10qin`). L'état exact est dans le registre `docs/handoff/ledger-septim-portes.md`.

**Vérifié au départ :**
- 198 tests vitest verts ;
- typecheck, lint et build OK ;
- les 2 plugins passent `claude plugin validate --strict` ;
- tests navigateur du site OK (`tests/browser/`).

### Déjà fait (plan 1 : `docs/superpowers/plans/2026-10-05-septim-viral-os.md`, terminé et revu)

- **Site de rétention (Next.js 16)** :
  - 7 chapitres et HUD « Chapitre n sur 7 » ;
  - compte à rebours, rail d'interruptions ;
  - secrets aléatoires (récompense variable) ;
  - son opt-in, fil infini (pas de stopping cue) ;
  - aperçu vivant de l'usine (Players Remotion avec bouton pause) ;
  - visible sans JS, contrastes AA, mouvement réduit respecté.
- **Usine `src/viral-engine/`** :
  - tendances (Google Trends, YouTube, Apify) ;
  - script H.E.A.T (Ollama qwen2.5, ou script écrit par Claude via `--script`) ;
  - linter viral (`viral-checklist.json`) ;
  - voix Piper / Kokoro / silencieuse ;
  - rendu Remotion 9:16, 3 templates (`story`, `maths`, `film`) ;
  - message « Vidéo prête… Réponds OUI #ref » (WhatsApp ou console), boîte d'envoi pour que seul le démon parle à WhatsApp ;
  - publication Postiz avec registre par plateforme (jamais deux fois) ;
  - bandit de Thompson qui apprend des vues à 48 h, `LESSONS.md` ;
  - démon cron 6 h ; diagnostic `npm run viral:doctor`.
- **Plugins Claude Code** (marketplace `septim` à la racine) :
  - `/septim-design:septim-design` (+ frontend-design, hero-shot, cinematic-dolly, templates) ;
  - `/septim-viral:viral` ;
  - testés par sous-agents (RED/GREEN, voir `docs/skill-tests.md`).
- **Hook `SessionStart`** (`.claude/hooks/session-start.sh`) : installe les dépendances et les plugins dans chaque session cloud, pour éviter « commande introuvable ».

### Plan 2 en cours : `docs/superpowers/plans/2026-10-05-septim-portes.md`

| Tâche | État | Contenu |
| --- | --- | --- |
| P1 | ✅ `29af0fb` | `lock.ts` (verrou de fichier entre processus, écriture atomique), `store` (job corrompu ignoré, `updateState` sous verrou, `resolveRef` qui refuse l'ambiguïté, `normalizeRef`), `publishWithLedger` verrouillé et qui relit le job, WhatsApp déconnecté → le processus quitte et pm2 relance |
| P2 | ✅ `0f8d8be` | `factory.ts`, cœur unique : tâches persistées dans `.septim-viral/tasks/`, file d'un rendu à la fois, confirmation `OUI #ref`, événements ; `errors.ts` (`FactoryError`, `STATUS`) |
| P3 | ✅ `30b0c45` | `webhooks.ts` : HMAC-SHA256, 3 essais, `attachWebhooks(factory, env)` |
| P4 | ✅ | serveur HTTP, API REST, OpenAPI, garde-fous |
| P5 | ✅ | MCP stdio + HTTP (9 outils, 2 ressources, prompt) |
| P6 | ✅ | Studio navigateur + test Playwright (`tests/studio/`) |
| P7 | ✅ | commande `septim` (bin, connect, setup, start) |
| P8 | ✅ | commandes `/septim-viral:*`, `install.sh`, `docs/GUIDE.md`, n8n, `.mcp.json` |
| P10 | ✅ | gratuit d'abord : B-roll ComfyUI/Pexels/Pixabay, musique, voix HD Chatterbox |
| P11 | voir registre | templates imbattables (zone sûre, hook dès 0 ms, bruitages, compteurs) |
| P9 | voir registre | vérification de bout en bout, sous-agents, revue finale |

### Interfaces déjà livrées (à utiliser telles quelles)

- `createFactory(deps?: Partial<{env, runJob, publish, notify, probe}>)` renvoie :
  - `createVideo(req)`, `redo(ref)`, `getTask(id)`, `listTasks()`, `idle()` ;
  - `listVideos({status?, limit?})`, `getVideo(ref)`, `videoFile(ref)` ;
  - `lintScript(script, opts?)` ;
  - `publish(ref, confirm)`, `reject(ref)` ;
  - `doctor()`, `lessons()` ;
  - `on(event, handler)`, où le handler reçoit `{video?, task?, error?}` (voir Ruling Task 2) ;
  - `home`.
- `FactoryError(code, message, details?)` porte un `.status`. Codes : `bad_request` 400, `unauthorized` 401, `forbidden` 403, `not_found` 404, `ambiguous_ref` 409, `conflict` 409, `payload_too_large` 413, `unsupported_media_type` 415, `confirmation_required` 428.
- `attachWebhooks(factory, env, fetchImpl?)`, `webhookPayload(event, payload, publicUrl?)`, `signBody(body, secret)`.
- `store.updateState(fn)`, `store.resolveRef(ref)`, `normalizeRef(s)`, `tryLock(path, staleMs)`, `withLock(path, fn)`, `writeJsonAtomic(path, data)`.

---

## 4. Carte du dépôt

| Chemin | Rôle |
| --- | --- |
| `src/app/`, `src/components/retention/` | le site (chapitres, HUD, rail, secrets, son, fil infini, ViralPhone) |
| `src/remotion/` | compositions Remotion ; `src/remotion/viral/` : templates `story`, `maths`, `film` (imports relatifs uniquement) |
| `src/viral-engine/` | l'usine (TDD, `npm test`) ; `__tests__/` et `__tests__/fixtures/` |
| `src/viral-engine/viral-checklist.json` | toutes les règles virales chiffrées |
| `plugins/septim-design/`, `plugins/septim-viral/` | plugins Claude Code ; `templates/` est la source de vérité des composants génériques |
| `.claude-plugin/marketplace.json` | marketplace `septim` |
| `.claude/hooks/session-start.sh`, `.claude/settings.json` | installation automatique en session cloud |
| `.claude/INVENTAIRE-DESIGN-2026.md` | inventaire des outils, prix, ce qui n'existe pas |
| `docs/superpowers/specs/`, `docs/superpowers/plans/` | specs et plans (plan 1 terminé, plan 2 en cours) |
| `docs/handoff/ledger-septim-portes.md` | registre du plan 2, versionné |
| `docs/skill-tests.md` | résultats des tests de skills par sous-agents |
| `tests/browser/` | tests Playwright du site (voir leur README) |
| `ecosystem.config.cjs` | démon pm2 |
| `.env.example` | toutes les variables (à compléter en P8) |

**Non versionné (local seulement) :**
- `.septim-viral/` : jobs rendus, `state.json`, scripts ;
- `deliverables/` : bundle, archive des plugins, `demo-tontine-maths.mp4` ;
- `.superpowers/` : registre de travail.

---

## 5. Pièges connus (déjà rencontrés, ne pas les redécouvrir)

| Piège | Solution |
| --- | --- |
| `tsc` casse sur un clone neuf (`LayoutProps` introuvable) | `npm run typecheck` (= `next typegen && tsc --noEmit`) |
| `package.json` n'a pas `"type": "module"` : pas de top-level await dans un `.ts` lancé par tsx | envelopper dans une fonction async, ou `void promesse` |
| Un test qui lit `.septim-viral/…` casse sur un clone neuf (dossier ignoré) | fixtures dans `src/viral-engine/__tests__/fixtures/` |
| Le MCP stdio ne doit rien écrire sur stdout | le `notify` par défaut de la fabrique écrit sur stderr ; en P5, rediriger `console.log` vers stderr au démarrage du serveur stdio |
| `pkill -f "next start"` se tue lui-même | `for p in $(pgrep -f '^next-server'); do kill $p; done` |
| Playwright dans le conteneur cloud | `PW=$(npm root -g)/playwright`, ne jamais lancer `playwright install` |
| Rendus Remotion en cloud | `REMOTION_BROWSER_EXECUTABLE`, posé par le hook ; un rendu dure environ 2 min |
| Voix française absente du conteneur | rendu muet (« voix silent ») ; chez l'utilisateur : `pip install piper-tts` + voix `fr_FR-tom-medium` |
| `npm audit` : `extract-zip` sans correctif (via whatsapp-web.js) | `PUPPETEER_SKIP_DOWNLOAD=1` + Google Chrome (`WHATSAPP_CHROME_PATH`) ; `basic-ftp` forcé dans `overrides` |
| Plugin installé en cours de session invisible des agents lancés ensuite | le hook SessionStart installe au démarrage ; sinon, lire le SKILL.md sur le disque |
| Le push GitHub refusé (403) | voir § 1 ; ne jamais pousser ailleurs que sur la branche de travail |
| Tests navigateur qui écrivent des captures dans `undefined/` | `SP` a maintenant un défaut (dossier temporaire) |
| Next 16 : lire `node_modules/next/dist/docs/` avant d'écrire du Next | règle d'AGENTS.md |

---

## 6. Décisions déjà prises (ne pas les rediscuter)

Toutes celles du plan 2 sont dans `docs/handoff/ledger-septim-portes.md` et dans le spec (D1–D20). Celles du plan 1, en résumé :

1. Débit de parole fixé à 3,0 mots/s en français et 3,2 en anglais : à 2,5, le hook d'exemple de l'utilisateur dépassait 3 s.
2. Le script de secours raccourcit sa réponse pour qu'elle arrive à au moins 80 % de la vidéo.
3. kokoro-js reste optionnel (lourd, anglais seulement).
4. Les vidéos WhatsApp partent en document sans Google Chrome.
5. Pas de Google Trends pour le Cameroun ; YouTube le couvre avec une clé gratuite.
6. Palette du site : nuit #121640, ndop #24307a, craie #e9ecf2, camwood #b4432b, raphia #e8c15a, brume #8f97c8 ; police Anybody (axe de largeur).
7. Les plugins s'installent depuis le dossier cloné, par le hook SessionStart.
8. Pas de MCP Apify dans le plugin : il démarrerait à chaque session sans clé.
9. Rétention sans piège : son opt-in, aucune donnée collectée, pause des vidéos, mouvement réduit respecté.
10. WhatsApp non officiel accepté, avec un seul destinataire. Si les réponses ne passent pas : `npm run viral -- --publish <ref>`.

---

## 7. Petits défauts connus, laissés pour plus tard

- La durée du script est vérifiée sur une estimation, pas sur la vraie voix.
- La règle « aucun mot de la réponse dans le hook » n'est pas appliquée.
- `render.ts` :
  - garde en cache un bundle qui a échoué ;
  - ne nettoie pas ses copies temporaires ;
  - dépend du dossier courant (P7 le règle avec `chdir` dans `bin/septim.mjs`).
- Avec un script écrit par Claude, le bandit crédite une formule tirée au hasard.
- Le diagnostic annonce Kokoro pour le français.
- Dans le template film, les chapitres commencent à « II ».
- Son du site :
  - `start`/`stop` sont appelés dans un updater, ce qui double le son en StrictMode dev ;
  - les rampes de gain n'ont pas d'ancre, d'où un clic à l'arrêt.
- `stretch-driver` : boucle rAF jamais au repos.
- `chapter-hud` : « 7 chapitres » est écrit en dur ; les templates sont livrés avec les textes de Septim.
- Kokoro est rechargé à chaque segment ; la requête Ollama n'est jamais interrompue.
- Les jobs anglais tirent des sujets de secours en français.
- Les versions de Remotion sont mélangées (`^` et exactes).
- Le hook utilise `npm install` (peut réécrire le lockfile).

**Corrigés depuis par P1 :**
- `job.json` écrit de façon atomique ;
- mises à jour du bandit perdues ;
- WhatsApp sourd après une déconnexion ;
- références ambiguës, qui donnent maintenant une erreur au lieu de prendre la plus récente.

---

## 8. Vérifier que tout va bien

```bash
PUPPETEER_SKIP_DOWNLOAD=1 npm install
npm test                         # 198 verts au départ
npm run typecheck && npm run lint && npm run build
claude plugin validate --strict plugins/septim-design
claude plugin validate --strict plugins/septim-viral
claude plugin validate --strict .
npm run viral:doctor             # état de l'usine + commandes pour ce qui manque
npm run viral -- "la tontine" --template maths --script src/viral-engine/__tests__/fixtures/tontine.json --no-notify   # vrai rendu (~2 min)
```

Tests navigateur du site : `tests/browser/README.md`.
