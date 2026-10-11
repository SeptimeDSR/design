# REPRISE — continuer le projet Septim (Ubuntu, nouvelle session, nouveau compte)

Dernière mise à jour : 11 octobre 2026. Branche : `claude/keen-euler-i983wb`. Version du package : **0.2.0** (à augmenter à chaque livraison : `septim.cmd` s'en sert pour savoir que l'usine Docker est périmée).

Ce fichier suffit pour reprendre sans rien demander : l'état exact, ce qui reste (détaillé), les pièges, les règles, le prompt à coller.

---

## 1. Installer sur Ubuntu (`dsr@SEPTIME-DSR:~/projects$`)

Le dépôt est sur GitHub : `https://github.com/SeptimeDSR/design`, branche `claude/keen-euler-i983wb`. Rien d'autre à copier : les clés vont dans `.env` (jamais dans le dépôt).

**A. Prérequis (une fois)** :
```bash
sudo apt update && sudo apt install -y git ffmpeg python3 python3-venv curl
# Node 22 (nvm) : le projet exige Node >= 22
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc && nvm install 22
```
`ffmpeg` est obligatoire pour les films. Les formats courts (Remotion) téléchargent leur navigateur au premier rendu, ou utilise `REMOTION_BROWSER_EXECUTABLE=/usr/bin/chromium`.

**B. Cloner et installer** :
```bash
cd ~/projects
git clone -b claude/keen-euler-i983wb https://github.com/SeptimeDSR/design septim
cd septim
bash scripts/install.sh --voix      # npm, commande septim, .env, diagnostic, voix Piper gratuite
```
Si `npm link` demande les droits : `sudo npm link`, ou `alias septim='node ~/projects/septim/bin/septim.mjs'` dans `~/.bashrc`.

**C. Régler les clés (terminal)** :
```bash
septim env init            # assistant : Pexels, Pixabay, YouTube, Apify, Postiz, ComfyUI…
septim env check           # teste chaque clé
septim doctor              # ce qui tourne, les commandes pour le reste
```

**D. Lancer** :
```bash
septim start               # Studio + API + MCP + démon (adresse et token affichés)
# ou seulement le Studio :
septim studio
```
**E. Un film** :
```bash
septim video "la dette de Mireille" --duree 1h --genre drame --qualite eco
septim taches              # avancement ; septim annuler <id> pour arrêter
```
**Variante Docker sur Ubuntu** : `docker compose up -d --build` (Docker Engine ou Docker Desktop avec intégration WSL). `host.docker.internal` est déjà mappé (`extra_hosts: host-gateway`) pour joindre l'Ollama et le ComfyUI de la machine. Les dossiers `musique/`, `voix/`, `certificats/` sont montés en lecture seule. Sous Linux, ouvre `http://localhost:4321/?token=…` (`docker compose logs septim`). `LANCER.bat`, `LANCER.ps1` et `septim.cmd` ne servent que sous Windows.

**Ollama / ComfyUI sous WSL** : s'ils tournent sous Windows, depuis WSL `OLLAMA_HOST=http://$(ip route | awk '/default/ {print $3}'):11434` (ou active le mode réseau « mirrored » de WSL2 : `localhost` marche alors). `septim comfy http://…:8188` dit ce que ComfyUI a installé.

---

## 2. Où en est le projet

### Fait (tout est poussé, testé)
1. **Site de rétention** (Next.js 16) et **format court** (Remotion 9:16, 3 templates, H.E.A.T) : voir l'historique `docs/handoff/ledger-septim-portes.md`.
2. **Les 6 portes** (Studio, terminal `septim`, Claude Code, MCP stdio+HTTP, API REST + OpenAPI, webhooks, WhatsApp) sur un cœur unique `src/viral-engine/factory.ts`. Règle d'or : rien ne se publie sans « OUI #ref » d'un humain pour CETTE vidéo, aucun crédit dépensé sans accord chiffré.
3. **Réglages** (Studio + `septim env`) : interrupteurs, clés, installations (Piper, Chatterbox, Ollama), QR WhatsApp, détection ComfyUI (`septim comfy`), Postiz.
4. **Docker** (`Dockerfile`, `compose.yaml`, `docker/septim`) + Windows (`LANCER.bat/.ps1`, `septim.cmd` qui reconstruit l'usine tout seul si la version diffère).
5. **Réseau qui lit le HTTPS** : `septim reseau`, dossier `certificats/`, jamais de vérification désactivée ; dossier `voix/` pour les voix téléchargées à la main.
6. **Durée au choix** (`src/viral-engine/duration.ts`) : `--duree 45s|3min|1h30`, 15 s à 4 h. ≤ 60 s : format court Remotion ; > 60 s : film.
7. **Films** (`src/viral-engine/film/`, 100 % ffmpeg, pas de Chromium) :
   - `writer.ts` : Ollama écrit bible → actes → scènes → plans, point de reprise par étape (`story/`), suite demandée si une scène est trop courte ;
   - `voice.ts` : voix Piper par plan (narrateur = voix principale, femmes = `fr_FR-siwis-medium`), pas de film muet (`requireVoice`) ;
   - `visuals.ts` : Flux 2 klein (ComfyUI) si prêt, sinon photos Pexels/Pixabay, sinon cartes ; jamais deux fois la même photo ;
   - `music.ts` : `VIRAL_MUSIC_DIR`, sinon ACE-Step 1.5 (ComfyUI), sinon ambiance générée ;
   - `ffmpeg.ts`, `ass.ts` : Ken Burns (zoompan), sous-titres ASS, fondus, chapitres, collage sans réencodage ;
   - `run.ts` : orchestration scène par scène, nettoyage des fichiers de travail, reprise ; `job.ts` : id = hash de la demande (un film « ratée » est repris, un film terminé n'est jamais écrasé) ;
   - `comfy-film.ts` : workflows Flux 2 klein et ACE-Step 1.5, détection des fichiers manquants.
8. **Gouvernance de fabrication** : tâches avec `progress`, annulation (`septim annuler`, `POST /api/v1/tasks/:id/cancel`, `septim_cancel_task`), estimation (`GET /api/v1/estimate`), un film long est confié à l'usine qui tourne (le terminal peut se fermer), refus avant de commencer s'il n'y a pas la place disque.
9. **Qualité** : 611 tests vitest verts, typecheck, lint et `npm run build` propres **sur un clone neuf** (vérifié le 11/10), Studio testé au navigateur (56/56), vrais rendus ffmpeg (film de 27 s, film de 11 min en 5,6 min sur 4 cœurs), film de bout en bout par le CLI depuis un clone neuf.

### Mesures utiles
- ffmpeg 720p, images + zoompan + sous-titres : environ **2× la vitesse réelle** sur 4 cœurs (1 h de film ≈ 30 min de rendu). L'écriture Ollama et la voix s'y ajoutent.
- Poids : eco ≈ 0,9 Mo/min, standard ≈ 1,8 Mo/min, hd ≈ 4 Mo/min (images réelles ; des cartes unies pèsent moins).

---

## 3. Ce qui reste (détaillé, par ordre de priorité)

### A. À vérifier sur la vraie machine de l'utilisateur (non vérifiable depuis le cloud)
1. **Un vrai film avec une vraie voix Piper** (`septim setup --voix`, puis `septim video "…" --duree 10min`) : durée réelle de la voix vs estimation, qualité d'écriture du modèle Ollama choisi (essayer `VIRAL_LONG_MODEL` avec un modèle plus gros que qwen2.5:3b), temps total.
2. **ComfyUI réel** : `septim comfy` doit montrer « Images du film : Flux 2 klein prêt » et « Musique : ACE-Step prêt ». Il manque chez l'utilisateur `qwen_3_4b.safetensors` (`models/text_encoders`) et `flux2-vae.safetensors` (`models/vae`). Les graphes de `film/comfy-film.ts` suivent les nœuds officiels (EmptyFlux2LatentImage, Flux2Scheduler, CFGGuider, SamplerCustomAdvanced ; TextEncodeAceStepAudio1.5, EmptyAceStep1.5LatentAudio) mais n'ont **jamais tourné sur un vrai ComfyUI** : en cas d'erreur 400, lire `node_errors` dans la réponse et ajuster (`COMFYUI_WORKFLOW`-style : exporter un workflow qui marche en « API format » et recopier les paramètres).
3. **`septim reseau`** sur le réseau de l'utilisateur : Hugging Face et Apify étaient en « certificat remplacé » ; identifier l'émetteur, créer `certificats/reseau.crt`, ou déposer les voix dans `voix/`.
4. **Windows** : exécution réelle de `LANCER.bat`, `LANCER.ps1` (nettoyage du PATH) et `septim.cmd` (reconstruction automatique `:stale`) jamais testée sous Windows.
5. **Publication d'un film long** sur Postiz (YouTube/Facebook) : taille du fichier, délai d'envoi du CLI `postiz upload` ; un film de 1 h fait des centaines de Mo.
6. **Docker** : l'image n'a pas été reconstruite depuis l'ajout des films dans le cloud (apt bloqué ici) ; `docker compose up -d --build` sur la machine, puis `docker compose exec septim ffmpeg -version`.
7. Clé YouTube (erreur 400 : activer « YouTube Data API v3 ») et Apify (ne répondait pas, probablement le même problème de certificat).

### B. Améliorations connues, non faites
1. **Voix masculine des personnages** : tous les hommes parlent avec la voix du narrateur. Ajouter une 3e voix (ex. `fr_FR-upmc-medium`) et l'attribuer aux `gender: "h"` qui ne sont pas le narrateur.
2. **Jeter un film ne supprime pas son dossier** (`.septim-viral/jobs/<id>`) : ajouter un nettoyage (`septim jeter` + option) pour récupérer la place disque.
3. **Zoompan légèrement saccadé** sur les zooms très lents (arrondi entier de x/y) : essayer une source 3× ou un `scale` + `crop` à pas fractionnaire.
4. **Qualité d'écriture** : un petit modèle écrit des histoires plates. Pistes : deuxième passe « relecture/amélioration » par scène, fiche de continuité (objets, lieux, secrets) passée à chaque scène, choix automatique du plus gros modèle présent dans `ollama list`.
5. **Vidéo IA locale pour quelques plans clés** (LTX-Video 2B distillé ≈ 4 Go, ou Wan 2.2 5B) : option `--plans-ia N` dans un film, avec le profil déjà codé dans `broll.ts` (`wan22-5b`) ; non faite pour économiser le disque.
6. **Miniature** (`thumbnail.jpg`) du film pour YouTube : non générée.
7. **Reprise sur coupure de l'usine** : un film dont le processus est mort passe « ratée » (tâche `settle`) ; relancer la même commande reprend. Une reprise automatique au démarrage n'existe pas.
8. **Ollama et ComfyUI sur le même GPU** : l'écriture se termine avant les images (décharge `keep_alive: 0`), mais pas de file d'attente si deux films sont lancés (un seul à la fois, voulu).
9. **Intermédiaires de certificats** : `septim reseau` n'exporte qu'un certificat ; une chaîne avec CA intermédiaire peut demander plusieurs fichiers dans `certificats/`.
10. Chatterbox (voix HD) est très lourd (torch, ~2 Go) et lent sans GPU, surtout en Docker : déconseillé là.

### C. Anciens « petits défauts » (voir `docs/handoff/ledger-septim-portes.md`, lignes `Final:`)
La durée du script court est estimée (pas mesurée sur la vraie voix), la règle « aucun mot de la réponse dans le hook » n'est pas appliquée, `render.ts` garde en cache un bundle raté, etc. Liste complète dans le registre.

---

## 4. Carte du dépôt

| Chemin | Rôle |
| --- | --- |
| `src/app/`, `src/components/retention/` | le site |
| `src/remotion/viral/` | templates des formats courts (imports relatifs uniquement) |
| `src/viral-engine/` | l'usine : `factory.ts` (cœur), `pipeline.ts` (court), `duration.ts`, `features.ts` (Réglages), `septim.ts` (terminal), `mcp.ts`, `server/` (API), `studio/` (UI), `remote.ts` |
| `src/viral-engine/film/` | le moteur de films (voir § 2.7) |
| `src/viral-engine/__tests__/` | 49 fichiers de tests (`film-*.test.ts`, `factory-film.test.ts`, `cli-film.test.ts`…) |
| `plugins/septim-design/`, `plugins/septim-viral/` | plugins Claude Code ; `references/film.md` = format d'un film |
| `docs/GUIDE.md` | mode d'emploi complet (un test vérifie qu'il cite chaque commande, outil MCP, route, variable) |
| `docs/handoff/ledger-septim-portes.md` | registre de toutes les décisions (Ruling) et défauts (minor) |
| `Dockerfile`, `compose.yaml`, `docker/septim` | Docker ; `LANCER.*`, `septim.cmd` : Windows |
| `scripts/install.sh` | installation Linux/WSL/macOS |
| `tests/studio/` | test navigateur du Studio (`SRC_JOB=<dossier d'un job rendu> bash tests/studio/run-studio-test.sh`) |

Non versionné : `.septim-viral/` (jobs, état, venv Piper), `deliverables/`, `.superpowers/`, `.env`.

---

## 5. Pièges connus

| Piège | Solution |
| --- | --- |
| `tsc` casse sur un clone neuf | `npm run typecheck` (= `next typegen && tsc --noEmit`) |
| Pas de top-level await dans un `.ts` lancé par tsx (CommonJS) | fonction async |
| Un test qui lit `.septim-viral/…` casse sur un clone neuf | fixtures dans `__tests__/fixtures/` |
| Le MCP stdio ne doit rien écrire sur stdout | tout sur stderr |
| `pkill -f vitest` tue son propre shell (la ligne de commande contient « vitest ») | ne jamais tuer par nom ; `kill <pid>` |
| `amix` de ffmpeg 5.1 (Debian) n'a pas `normalize` | `volume=2` après `amix` (déjà fait) |
| `zoompan` : `-loop 1 -t 10` donne 250 images d'entrée × d sorties | une seule image d'entrée (`-framerate 1 -loop 1 -t 1`), déjà fait |
| CSP du Studio : pas d'attribut `style` | largeur par `el.style.width` (voir `meter()`) |
| Le test docs exige : variable lue → dans `.env.example` ; route → dans GUIDE ; outil MCP → dans GUIDE ; commande de HELP → dans GUIDE | à chaque ajout, mettre à jour les trois |
| Next 16 diffère de ce que tu connais | lire `node_modules/next/dist/docs/` avant d'écrire du Next |
| Pas d'apt ni de Hugging Face dans le cloud de développement | Docker/Piper non testables là-bas |

---

## 6. Règles non négociables

- jamais de publication sans « OUI #ref » écrit par un humain pour CETTE vidéo ;
- jamais de crédits dépensés (Higgsfield, Runway, Pika…) sans coût affiché et oui explicite ; FREE d'abord, commentaire `// BESOIN CREDIT: … Alternative gratuite: …` ;
- aucun secret dans le dépôt ; la vérification TLS n'est jamais désactivée ;
- TDD : test écrit d'abord, échec vu, puis code ; chaque décision = une ligne dans le registre ;
- push seulement sur `claude/keen-euler-i983wb`, pas de PR sans demande ;
- l'utilisateur parle français, ne veut pas de questions (« décide tout »), veut des commandes exactes pas à pas, des rapports honnêtes (ce qui n'est pas vérifié est dit) ; Ubuntu/WSL (`dsr@SEPTIME-DSR:~/projects`), disque limité, Ollama et ComfyUI déjà installés avec leurs modèles (qwen2.5:3b, flux-2-klein-4b-fp8, ace_step_1.5_turbo_aio, wan2.2_vae…).

---

## 7. Prompt de reprise (à coller tel quel dans une nouvelle session Claude Code)

```text
Tu reprends le projet Septim (usine à vidéos : formats courts Remotion + films de 1 min à 4 h en ffmpeg). Ne refais rien de ce qui est fait, ne redemande rien de ce qui est décidé.

1. git fetch origin claude/keen-euler-i983wb && git checkout claude/keen-euler-i983wb. Lis dans cet ordre : docs/REPRISE.md (état, ce qui reste, pièges, règles), CLAUDE.md et AGENTS.md, docs/handoff/ledger-septim-portes.md (toutes les décisions), docs/GUIDE.md (mode d'emploi).
2. Vérifie : PUPPETEER_SKIP_DOWNLOAD=1 npm install, puis npm test (611 verts attendus), npm run typecheck, npm run lint. Il faut ffmpeg (sudo apt install ffmpeg).
3. Travaille la section « 3. Ce qui reste » de docs/REPRISE.md : d'abord ce que tu peux faire ici (B.1 voix masculine, B.2 nettoyage au jeter, B.4 qualité d'écriture, B.6 miniature), ensuite prépare pour l'utilisateur les commandes exactes pour A (vérifications sur sa machine).
4. TDD strict, une ligne « Ruling »/« minor » dans le registre par décision, commit + push sur claude/keen-euler-i983wb après chaque tâche, mets à jour docs/REPRISE.md et augmente la version du package à chaque livraison.
5. Règles : jamais de publication sans « OUI #ref » d'un humain ; jamais de crédit dépensé sans accord chiffré ; FREE d'abord ; pas de secret dans le dépôt ; Windows et ComfyUI réels ne sont pas testables depuis le cloud : dis-le, ne l'invente pas.
6. L'utilisateur parle français, veut des commandes exactes pas à pas pour Ubuntu (dsr@SEPTIME-DSR:~/projects), des rapports honnêtes, et t'a délégué toutes les décisions. Termine par : « Décisions prises pour toi », « Petits défauts laissés », ce qui est vérifié / pas vérifié.
```
