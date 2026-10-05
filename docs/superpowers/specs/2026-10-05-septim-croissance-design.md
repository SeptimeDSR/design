# SEPTIM Croissance : réseaux branchés, pub, copie de concept, templates d'élite, modes de l'agent — spec

Date : 2026-10-05 · Statut : décidé. L'utilisateur a délégué toutes les décisions (« tu es co-auteur et boss… sans mon intervention ») : chaque choix est noté ici et dans le registre `docs/handoff/ledger-septim-croissance.md`, avec son coût s'il est faux.

## 1. Demande

### Ce que l'utilisateur a dit

1. Tous les réseaux branchés **nativement** (page Facebook, pub, WhatsApp, TikTok, YouTube, Instagram, Telegram…), pour ne plus jamais sortir chercher un identifiant.
2. Fouiller tous les MCP disponibles et brancher les bons.
3. Payer seulement quand ça vaut la peine (un site impeccable, une vidéo qui peut faire des millions pour quelques centimes) et utiliser l'argent efficacement.
4. Templates « crème de la crème », réutilisables, jusqu'à 10, qui couvrent les contenus viraux ; comprendre pourquoi les meilleurs contenus accrochent.
5. Des agents qui copient un concept à partir d'**un seul exemple** vu sur Internet (style, audio, voix, vidéo, format), et qui comprennent « va fouiller la page Facebook de X, regarde comment il fait, copie le concept ».
6. Un volet **pub produits** et un volet **pub sur les réseaux** pour n'importe quelle application : à partir du README et de quelques pages, créer et lancer des pubs avec un clic vers l'URL ou un formulaire. Promouvoir automatiquement et viralement ses projets terminés.
7. L'agent principal a plusieurs modes : ultra-autonome (il fait tout) ou copilote (il pose beaucoup de questions, même sur WhatsApp, et mûrit l'idée avant de créer et publier).
8. Apprentissage continu.
9. Tout marche sous Ubuntu et Windows.
10. Installation ultra guidée, complète, facile pour tous : Claude Code, navigateur et toutes les autres interfaces.
11. Voix : edge-tts gratuit et ElevenLabs (gratuit et payant) avec une bascule ; avis sur Veo, Higgsfield.
12. Trois templates précis : UGC TikTok 9:16, pub Facebook 1:1, explication YouTube 16:9.
13. Publication auto : Meta (Page + Instagram), puis repost sur TikTok, YouTube Shorts, etc.
14. ComfyUI comme alternative complète, même avec 8 Go de VRAM : séries ou films d'une heure avec les mêmes personnages, plusieurs styles (dessin animé, réaliste…), installé complètement, pour sa machine (i9-13900HX, 32 Go, RTX 4070 portable).
15. Un brouillon de liste de MCP à « corriger, compléter et rejeter », puis autocritique jusqu'à « la perfection ultime ».

### Ce que j'en déduis (hypothèses, à corriger par l'utilisateur s'il le veut)

- H1. Les règles déjà décidées restent : jamais de publication sans « OUI #ref » écrit par un humain pour cette vidéo ; jamais de dépense sans coût affiché et oui chiffré ; voie gratuite toujours codée et par défaut.
- H2. « Natif » veut dire : un seul assistant de connexion qui ouvre la bonne page, dit quoi cliquer, récupère le jeton (OAuth sur `127.0.0.1` quand la plateforme le permet, sinon collage vérifié sur-le-champ) et le range dans un coffre local. Les plateformes exigent que chaque utilisateur crée sa propre « app développeur » quand l'outil est auto-hébergé : l'assistant ne peut pas supprimer cette étape, il la rend guidée et vérifiée.
- H3. Le public est d'abord francophone (Cameroun, Afrique de l'Ouest, France) ; l'anglais reste possible.
- H4. La machine de référence est un portable Windows 11 avec RTX 4070 Laptop 8 Go ; le code doit aussi tourner sans GPU (repli gratuit sans IA locale).

## 2. Point de départ (vérifié le 5 octobre 2026)

- 330 tests verts, typecheck, lint, build ; plugins `septim-design` et `septim-viral` validés `--strict`.
- Usine : script H.E.A.T, linter, voix Piper / Kokoro / Chatterbox, 3 templates 9:16 (`story`, `maths`, `film`), B-roll ComfyUI / Pexels / Pixabay, musique, bruitages, publication Postiz ou manuelle, WhatsApp (whatsapp-web.js), bandit qui apprend des vues à 48 h, Studio, API, MCP, webhooks, commande `septim`.
- Connecteurs claude.ai du compte : **Meta Ads (« meta ds ») connecté** (outils `ads_*` : campagnes, ensembles, créas, upload, boost Instagram, bibliothèque de pubs, tests A/B, statistiques) ; Figma connecté ; Gmail, Agenda et Drive présents mais non connectés au départ.
- Ce conteneur : pas de GPU, YouTube / TikTok / Hugging Face / Pexels bloqués par le proxy, Microsoft Edge TTS refusé (403). PyPI et npm joignables (edge-tts 7.2.8 et yt-dlp 2026.8.19 s'installent). Tout ce qui parle à ces services est donc testé contre de faux serveurs qui suivent les formats documentés, et dit « non vérifié ici » dans le rapport.

## 3. Le brouillon reçu : gardé, corrigé, rejeté

(Rempli à partir de la recherche du 5 octobre 2026, sources en fin de document.)

RECHERCHE_EN_COURS

## 4. Décisions

| # | Décision | Pourquoi | Coût si faux |
| --- | --- | --- | --- |
| D29 | Un plan, douze sous-projets (C1 à C12), chacun utile seul, puis une vérification (C13). Toujours un seul cœur : toute nouvelle capacité passe par la fabrique (`createFactory`) et ses portes (terminal, Studio, API, MCP, téléphone, skills) | La règle « jamais sans OUI » et le registre de publication restent uniques | Un plan long |
| D30 | **Coffre local** `~/.septim/comptes.json` (droits 600, dossier changeable par `SEPTIM_SECRETS_DIR`), hors du dépôt. Une variable d'environnement déjà posée l'emporte sur le coffre. Aucun secret affiché en entier (masqué `abcd…wxyz`), aucun secret dans les journaux ni dans les webhooks | Un endroit, partagé par tous les clones et toutes les portes ; rien ne peut partir dans git | Fichier en clair protégé par les droits du compte (comme `~/.ssh`, `gh`, `postiz`) ; un trousseau système viendra si un paquet natif fiable est retenu |
| D31 | **Assistant de connexion** par réseau : `septim comptes` (état de tout), `septim comptes connecter <réseau>` (étapes numérotées, liens exacts, valeurs à copier, test immédiat), la page **Comptes** du Studio (même assistant, boutons), et la commande téléphone « comptes ». OAuth avec PKCE et redirection sur `127.0.0.1` quand la plateforme l'accepte ; sinon collage du jeton, validé tout de suite par un appel « qui suis-je » | « Ne jamais sortir chercher un identifiant » : on sort une fois, guidé, et la machine vérifie | Les écrans des consoles développeur changent : les étapes vivent dans un seul fichier par réseau, faciles à corriger |
| D32 | Réseaux branchés en natif, gratuits : voir § 3 et § 6.2 (liste finale après recherche) | Gratuit et sans intermédiaire | Une app développeur par plateforme (guidée) |
| D33 | Publication par **routeur** : pour chaque plateforme, l'éditeur natif s'il est connecté, sinon Postiz s'il l'est, sinon le mode manuel. Le registre par plateforme reste la seule vérité (jamais deux fois). Avant le OUI, le message dit pour chaque plateforme ce qui va réellement se passer : public, privé (app non auditée), brouillon à finir dans l'app | Honnêteté sur les limites des API ; une plateforme en panne n'empêche pas les autres | Un éditeur par plateforme à maintenir |
| D34 | **Telegram** devient le canal téléphone recommandé (API officielle, gratuite, sans Chrome, vidéos jusqu'à 50 Mo). WhatsApp (whatsapp-web.js, non officiel) reste. `VIRAL_NOTIFIER=telegram\|whatsapp\|console` | Aucun risque de blocage, installation en 2 minutes avec @BotFather | Deux canaux à maintenir |
| D35 | **Claude sur le téléphone** : documenté et préparé par `septim setup --telephone` : (a) Remote Control (l'app Claude pilote la session Claude Code du PC, MCP locaux compris) ; (b) les *channels* Telegram de Claude Code (aperçu de recherche : `/plugin install telegram@claude-plugins-official`, `/telegram:configure <jeton>`, `claude --channels plugin:telegram@claude-plugins-official`, appairage). Deux bots distincts : un pour le démon, un pour Claude (un jeton ne peut être lu que par un seul programme) | Le copilote le plus intelligent est Claude lui-même ; le démon reste le pilote automatique gratuit quand Claude dort | Channels peut changer (aperçu de recherche) ; demande Bun |
| D36 | **Modes de l'agent** : `autonome` (aucune question ; il choisit sujet, angle, template, rend, et demande seulement « OUI #ref ») et `copilote` (jusqu'à 5 questions numérotées, 3 hooks proposés, aperçu, puis rendu). `SEPTIM_MODE`, changeable à chaud (« mode copilote » sur le téléphone, `septim mode copilote`, Studio). Les deux modes gardent OUI pour publier et OUI PUB pour dépenser | Les deux postures demandées ; la publication et l'argent restent des décisions humaines quel que soit le mode | Aucun |
| D37 | **Copilote sans LLM obligatoire** : les questions sont à choix numérotés (1, 2, 3…) et se comprennent sans IA ; Ollama (gratuit, local) interprète les réponses libres s'il est là ; dans Claude Code, c'est Claude qui mène la conversation | Marche partout, même sans GPU ni Internet | Moins de souplesse sans Ollama |
| D38 | **Voix** : edge-tts (gratuit, en ligne, non officiel, voix neuronales Microsoft, timings mot à mot) devient la première voix gratuite quand il est installé ; Piper reste le repli hors ligne ; Chatterbox la voix HD locale (GPU) ; **ElevenLabs** en PRO (clé, coût affiché, plafond mensuel de caractères égal à l'offre gratuite par défaut, au-delà retour à la voix gratuite). Les sous-titres suivent les vrais temps des mots quand la voix les donne | Meilleure voix gratuite et sous-titres exacts ; ElevenLabs seulement quand l'utilisateur l'active | edge-tts peut cesser de marcher (service non officiel) : repli automatique |
| D39 | **Templates d'élite** : 10 au total — `story`, `maths`, `film` (existants), `chat` (histoire en messages), `top` (classement), `quiz` (défi chronométré), `avant-apres` (transformation), `ugc` (face caméra ou plans, sous-titres géants), `pub` (pub produit 1:1 / 4:5 / 9:16), `explainer` (démo d'app 16:9 / 9:16). Un registre décrit chaque template (famille organique ou pub, formats, voix, règles du linter, exemple). Le bandit ne choisit que parmi les templates organiques | Couvre les formats viraux et les formats pub demandés, sans dupliquer de code | 7 compositions de plus à tenir au niveau des 3 premières |
| D40 | **Formats multiples** : 9:16 (1080×1920), 1:1 (1080×1080), 4:5 (1080×1350), 16:9 (1920×1080). La composition prend sa taille dans les props (`calculateMetadata` renvoie largeur et hauteur) ; une mise en page mesurée par format (zones sûres de chaque plateforme) ; tests : aucune boîte hors zone sûre, aucun texte qui déborde | Une vidéo, plusieurs placements (Reels, fil, YouTube) | Les zones sûres des apps bougent : constantes dans un seul fichier |
| D41 | **Pub** : `septim pub <url\|README\|dossier>` → fiche produit (promesse, douleurs, public, preuves, offre, appel à l'action, URL) → 3 angles → vidéos par format → textes (texte principal, titre, description, bouton) → plan de campagne. Liens avec paramètres UTM par angle. Côté Meta : campagne créée **en pause** par l'API Marketing avec le compte connecté, ou par le MCP officiel Meta Ads dans Claude. Activation seulement sur « OUI PUB #ref <montant> » écrit par l'humain, montant ≤ reste du plafond mensuel, date de fin obligatoire, budget quotidien plafonné | Promouvoir un projet fini en une commande, sans risque de dépense accidentelle | Le texte d'un README peut être pauvre : la fiche est montrée et corrigeable avant tout rendu en mode copilote |
| D42 | **Argent** : registre `~/.septim/budget.json` ; `septim budget plafond <montant>` ; plafond mensuel 0 par défaut (rien ne peut être dépensé tant que l'humain n'a pas fixé un plafond) ; toute dépense (pub, crédits PRO, ElevenLabs au-delà du gratuit) passe par la même porte : estimation, phrase de confirmation avec le montant, vérification du plafond, écriture au registre. Conseiller : « booste seulement ce qui gagne déjà » (vidéo organique ≥ 3× la médiane à 48 h → proposition chiffrée) | « Payer quand ça vaut la peine », jamais par accident | Un réglage à faire une fois |
| D43 | **Copie de concept** : `septim copie <url>` (une vidéo) et `septim analyse <url de page ou chaîne>` (plusieurs vidéos, classées par vues). yt-dlp télécharge, ffmpeg mesure (format, durée, coupes, rythme, niveau sonore, couleurs), faster-whisper transcrit (mots et temps), une planche d'images clés est faite ; Claude (dans sa session) ou un modèle de vision local (Ollama) décrit le style. Le résultat est une **carte concept** (JSON) : structure, hook, rythme, sous-titres, palette, voix, musique, template conseillé. `septim video "<sujet>" --concept <carte>` applique la dynamique à un sujet neuf. Jamais de réutilisation du contenu d'autrui : contrôle d'originalité (recouvrement de texte avec la source sous un seuil), voix clonée seulement si c'est la sienne | « Comme un créateur qui regarde quelques vidéos » ; copier la mécanique, pas l'œuvre | Les sites changent leurs protections (mise à jour de yt-dlp ; cookies du navigateur de l'utilisateur pour les profils) |
| D44 | **Apprentissage continu** : le bandit apprend aussi par concept et par plateforme (vues natives quand le réseau les donne) ; rapport de la semaine envoyé sur le téléphone (ce qui gagne, ce qu'on arrête, 5 idées) ; bibliothèque de concepts notée par les résultats | La machine s'améliore sans intervention | Peu de données au début (le bandit explore) |
| D45 | **Séries locales (ComfyUI, 8 Go)** : `septim serie` : bible (personnages avec images de référence, voix, style), découpage en plans, images clés cohérentes, animation image→vidéo, voix par personnage, montage d'épisode (16:9 ou 9:16) ; cache par plan et reprise après coupure ; repli « motion comic » (images clés animées par caméra) pour tenir une heure sur 8 Go | Alternative gratuite à Higgsfield/Runway pour des séries | Lent (des heures pour un épisode long) : file de nuit, honnêtement estimée |
| D46 | **Installation** : `scripts/install.ps1` (Windows 11 natif, winget), `scripts/install.sh` (Ubuntu/WSL/macOS) enrichi ; `septim setup` devient un assistant (questions si terminal interactif, options sinon) ; `septim config set CLE=valeur` remplace les `echo … >> .env` (même commande sous Windows et Linux) ; `septim doctor` donne des commandes adaptées au système ; CI GitHub Actions Ubuntu + Windows | « Ultra guidé, pour tous », preuve que Windows marche | Une CI à garder verte |
| D47 | **Windows** : `python3` n'existe pas toujours (Python lancé par `py -3` ou `python`), `claude`/`npm` sont des `.cmd` : lancement par `cross-spawn` ; écriture atomique qui réessaie sur `EPERM`/`EBUSY` ; tests propres à bash sautés seulement sous Windows avec leur équivalent PowerShell | Défauts trouvés à l'audit du code | Aucun |
| D48 | **MCP septim** : nouveaux outils pour les comptes, la pub, la copie de concept, les séries et le budget ; aucun ne publie ni ne dépense sans la phrase de l'humain (« OUI #ref », « OUI PUB #ref <montant> ») | Les assistants voient toutes les capacités | Plus d'outils à décrire |
| D49 | **Connecteurs claude.ai** : catalogue honnête dans le guide (connectés une fois sur claude.ai, disponibles dans Claude Code, Desktop, web et mobile) ; pas de doublon dans les plugins quand un connecteur officiel existe | Pas de serveur qui échoue à chaque session (D8 du plan 1) | Rien |
| D50 | Règles de CLAUDE.md complétées : « OUI PUB #ref <montant> » pour activer une pub ; plafond mensuel ; le démon ne dépense jamais de crédits IA | La pub est une dépense d'argent réelle | Rien |

## 5. Architecture

```
téléphone ── Telegram / WhatsApp ──┐
app Claude ── Remote Control ──────┤        ┌──────────────── fabrique (factory.ts) ────────────────┐
Claude Code ── skills, MCP stdio ──┤        │ vidéos (pipeline, templates, voix, B-roll, rendu)     │
navigateur ── Studio ──────────────┼─ portes┤ comptes (coffre, assistants, OAuth)                    │
n8n, Make ── API REST, MCP HTTP ───┤        │ publication (routeur → éditeurs natifs / Postiz / manuel)│
terminal ── septim <commande> ─────┘        │ pub (fiche, angles, kit, campagnes en pause, OUI PUB)  │
                                            │ copie (yt-dlp, ffmpeg, whisper → carte concept)        │
                                            │ séries (ComfyUI : bible, plans, cache, montage)        │
                                            │ argent (plafond, registre, conseiller)                 │
                                            │ apprentissage (bandit, rapports, bibliothèque)         │
                                            └────────────────────────────────────────────────────────┘
```

Nouveaux dossiers dans `src/viral-engine/` (TDD, imports relatifs) :

| Dossier | Contenu |
| --- | --- |
| `comptes/` | `vault.ts` (coffre), `oauth.ts` (PKCE + rappel local), `networks.ts` (registre des réseaux : libellé, capacités, étapes), un fichier par réseau (`telegram.ts`, `meta.ts`, `youtube.ts`, `tiktok.ts`, `bluesky.ts`…) avec `check`, `publish`, `stats` |
| `publication/` | `router.ts` (choix de l'éditeur par plateforme, registre), `formats.ts` (règles par plateforme : durée, taille, ratio, légende) |
| `pub/` | `brief.ts`, `angles.ts`, `copy.ts`, `campaign.ts` (plan), `meta-ads.ts` (API Marketing), `utm.ts` |
| `copie/` | `fetch.ts` (yt-dlp), `measure.ts` (ffmpeg), `transcribe.ts` (faster-whisper), `concept.ts` (carte), `originality.ts` |
| `series/` | `bible.ts`, `shots.ts`, `comfy-workflows.ts`, `queue.ts`, `episode.ts` |
| `argent/` | `budget.ts` (plafond, registre, confirmation), `catalogue.ts` (prix PRO datés et sourcés), `conseil.ts` |
| `agent/` | `modes.ts`, `copilot.ts` (conversation à choix numérotés), `commands.ts` (commandes téléphone) |

Remotion : `src/remotion/viral/formats.ts` (tailles, zones sûres), `registry.ts`, un fichier par nouveau template, imports relatifs uniquement.

## 6. Sous-projets

### 6.1 C1 — Comptes : coffre, assistant, OAuth

- `vault.ts` : `readVault()`, `saveAccount(network, data)`, `removeAccount`, `secret(name)` (env d'abord, coffre ensuite), écriture atomique, droits 600 (sans effet sous Windows, où le dossier du profil est déjà privé), masquage.
- `oauth.ts` : `startOAuth({provider, authorizeUrl, tokenUrl, clientId, clientSecret?, scopes, port})` → URL à ouvrir (état aléatoire + PKCE S256), serveur de rappel sur `127.0.0.1` (la route `/oauth/<réseau>/rappel` du serveur Septim quand il tourne, sinon un serveur temporaire), échange du code, refus si l'état ne correspond pas, délai de 10 minutes.
- `networks.ts` : pour chaque réseau, `label`, `capacités` (publier, messages, pub, statistiques), `gratuit` (ce qui est gratuit et la limite réelle), `etapes()` (texte français, liens), `connecter(entrée)`, `verifier()`.
- Portes : `septim comptes`, `septim comptes connecter <réseau>`, `septim comptes oublier <réseau>`, Studio « Comptes », API `GET /api/v1/comptes`, `POST /api/v1/comptes/<réseau>`, MCP `septim_comptes`.

### 6.2 C2–C4 — Réseaux et publication

Liste et chemins exacts : § 3 (recherche). Principes :
- Un éditeur par réseau : `publish(video, texte, options) → {id, url, visibilite}` et `stats(id) → {vues, likes…}`.
- Téléversement résumable pour les gros fichiers, délais et nouvelles tentatives bornées, erreurs traduites en français avec l'action à faire.
- Formats : une vidéo 9:16 sert TikTok, Reels, Shorts, Threads, Telegram ; le 16:9 sert YouTube ; la légende est adaptée par plateforme (longueur, hashtags).
- Le message « Vidéo prête » liste, par plateforme : connecté ou non, public / privé / brouillon.

### 6.3 C5 — Téléphone et modes

- `telegram.ts` (notifier) : `getUpdates` en attente longue, `sendMessage`, `sendVideo` (≤ 50 Mo, sinon `sendDocument` ou lien du Studio), seul l'identifiant appairé est écouté.
- Commandes : `aide`, `mode autonome|copilote`, `video <sujet>`, `idees`, `copie <url>`, `pub <url>`, `stats`, `budget`, `comptes`, `OUI #ref`, `NON #ref`, `REFAIS #ref`, `OUI PUB #ref <montant>`.
- Copilote : conversation par chat, questions à choix numérotés, mémoire 30 minutes, reprise après redémarrage (fichier d'état).

### 6.4 C6 — Voix

- edge-tts dans le venv de l'usine (`septim setup --voix` installe edge-tts et Piper), petit script Python qui écrit le MP3/WAV et un JSON des mots (début, durée).
- ElevenLabs : appel « avec horodatage », coût estimé par caractère, plafond mensuel ; au-delà ou en erreur, voix gratuite suivante.
- `synthesize` renvoie `words?` ; la timeline garde les mots ; `captionPages` les utilise s'ils sont là.

### 6.5 C7–C8 — Templates

| Template | Formats | Famille | Structure |
| --- | --- | --- | --- |
| `story` | 9:16 | organique | existant |
| `maths` | 9:16 | organique | existant |
| `film` | 9:16 | organique | existant |
| `chat` | 9:16 | organique | messages qui arrivent (bulles, « en train d'écrire… », sons), dernier message = la chute |
| `top` | 9:16 | organique | classement 5 → 1, chaque rang = un beat, le n° 1 à ≥ 80 % |
| `quiz` | 9:16, 1:1 | organique | question, choix, compte à rebours, réponse, « ton score en commentaire » |
| `avant-apres` | 9:16, 1:1 | organique | état avant, bascule (volet), état après, chiffres qui montent |
| `ugc` | 9:16 | organique ou pub | ton clip face caméra (`--clip`) ou plans + voix ; sous-titres géants 1–3 mots, zooms, bruitages, carte finale |
| `pub` | 1:1, 4:5, 9:16 | pub | problème → solution, capture du produit dans un cadre d'appareil, 3 bénéfices, preuve, offre, bouton + URL |
| `explainer` | 16:9, 9:16 | pub ou organique | chapitres, captures d'écran zoomées, titres en bas, voix posée, écran de fin avec URL |

Champs de script ajoutés (tous optionnels, le linter du template dit ce qui manque) : `format`, `product` ({name, url, promise, offer, proof[], cta}), `style` (palette, police, sous-titres, rythme, issus d'une carte concept), et par beat `from` (chat), `rank` (top), `choices` / `answer` (quiz), `side` (avant-apres), `image` (capture).

Captures d'un site : `septim capture <url>` prend des captures (bureau 1440 px et téléphone 390 px, plusieurs hauteurs) avec puppeteer-core et le Chrome de Remotion ; elles nourrissent `pub` et `explainer`.

### 6.6 C9 — Pub

Flux : fiche produit → 3 angles (douleur/solution, avant/après, démonstration ; preuve sociale si le README en donne) → pour chaque angle, un script `pub` ou `ugc` + un `explainer` 16:9 optionnel → rendu dans les formats demandés → textes par placement → plan JSON + résumé lisible → brouillons en pause chez Meta si connecté → message « Campagne prête #ref : 3 pubs, 5 $/jour pendant 3 jours, Cameroun 18–45, clic vers <url>. Réponds OUI PUB #ref 5 pour lancer. »

### 6.7 C10 — Copie de concept

Voir D43. Sortie lisible (« Ce qui marche dans cette vidéo : hook question en 1,4 s, coupe toutes les 1,7 s, sous-titres jaunes 2 mots, réponse à 86 %, musique énergique, voix masculine grave ») et carte JSON réutilisable.

### 6.8 C11 — Séries ComfyUI

Profils de machine (`8go` par défaut pour la machine de l'utilisateur, `12go`, `24go`, `cpu` = motion comic seulement), workflows au format API avec emplacements nommés, file de plans avec cache par empreinte, montage d'épisode Remotion. Détails des modèles : § 3.

### 6.9 C12 — Installation, guide, CI

- `install.ps1` : vérifie et installe avec winget Node LTS, Git, FFmpeg, Python 3.12 ; clone si besoin ; `npm install` ; `npm link` ; `septim setup`.
- `install.sh` : idem sous Ubuntu (apt pour ffmpeg et python3-venv, nvm si Node manque).
- `septim setup` interactif : voix, téléphone, comptes, ComfyUI, mode de l'agent ; chaque étape peut être sautée et relancée.
- `docs/GUIDE.md` réécrit : un chemin par interface (Claude Code terminal / bureau / web, app Claude, Studio, téléphone, autres clients MCP, n8n), « Brancher mes réseaux », « Faire de la pub », « Copier un concept », « Séries », « Argent », « Windows ».
- CI `.github/workflows/ci.yml` : `npm ci`, typecheck, lint, tests sur `ubuntu-latest` et `windows-latest`.

## 7. Sécurité, argent, éthique

- Secrets : coffre hors dépôt, jamais affichés en entier, jamais dans un webhook ni un journal ; `state` OAuth à usage unique ; rappel OAuth seulement sur `127.0.0.1`.
- Argent : D42 ; une campagne est toujours créée en pause, avec date de fin ; aucune porte (ni MCP, ni API, ni démon) n'active une pub sans la phrase de l'humain avec le montant.
- Publication : D7 du plan 2 inchangé.
- Copie : on copie la mécanique (structure, rythme, style), jamais le texte, les images, la voix ou la musique d'autrui ; voix clonée = la sienne ou avec accord écrit.
- Pub : rappel des catégories spéciales de Meta (finance, logement, emploi, politique) ; la tontine et les prêts relèvent souvent de la finance : le plan le signale.

## 8. Tests et preuves

- TDD partout (test vu en échec d'abord), faux serveurs pour chaque API (formats documentés), tests de mise en page par format, rendus réels des templates relus image par image (planches).
- Non vérifiable dans ce conteneur et dit comme tel : appels réels aux réseaux, edge-tts, ElevenLabs, yt-dlp sur de vraies URL, ComfyUI sur GPU, Windows (couvert par la CI GitHub quand elle tourne).

## 9. Hors périmètre de ce plan

- Application mobile dédiée (Telegram, WhatsApp, l'app Claude et le Studio en Wi-Fi couvrent le téléphone).
- Docker.
- Publication sur X (API payante) et LinkedIn page entreprise (programme partenaire) en natif : via Postiz.
