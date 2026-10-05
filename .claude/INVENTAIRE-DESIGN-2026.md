# Inventaire Design 2026

Audit réalisé le 5 octobre 2026. Les prix viennent de recherches web faites ce jour-là et changent souvent : vérifie sur le site de chaque outil avant d'acheter des crédits.

## Les 2 plugins Septim (tout est dedans)

Installation unique, valable pour tous tes projets :

```
/plugin marketplace add SeptimeDSR/design
/plugin install septim-design@septim
/plugin install septim-viral@septim
```

Dans une session cloud sur ce repo, le hook `.claude/hooks/session-start.sh` les installe tout seul (plus de « commande introuvable »).

### `septim-viral` (SEPTIM-VIRAL-OS)

| Contenu | Détail |
| --- | --- |
| Skill `viral` → `/septim-viral:viral "je veux une histoire sur…"` | Claude écrit le script H.E.A.T, le linter viral le valide (`--lint-only`), le moteur rend le MP4 gratuit, le message « Vidéo prête boss » part, rien n'est publié sans OUI, aucun crédit sans budget annoncé |
| Démon `npm run viral:daemon` (pm2) | Cycle toutes les 6 h, réponses WhatsApp OUI / NON / REFAIS / PRO, analytics à 48 h qui apprennent quels templates et hooks marchent (`LESSONS.md`) |
| `npm run viral:doctor` | Dit honnêtement ce qui tourne (voix, LLM, WhatsApp, publication) et donne les commandes pour le reste |

### `septim-design`

| Contenu du plugin | Détail |
| --- | --- |
| Skill `septim-design` | Directeur artistique autonome. Lit le projet (mémoire dans `.septim/PROJECT.md`), résume, pose **une** question ou attaque directement si tu donnes la demande, puis passe par superpowers (brainstorming → plan → exécution → vérification) |
| Skills `hero-shot`, `cinematic-dolly` | Plans vidéo, FREE Remotion d'abord, PRO à crédits seulement après ton « oui » |
| Skill `frontend-design` | La skill officielle Anthropic (Apache-2.0), incluse |
| 8 serveurs MCP | 21st, magicui, shadcn, remotion-docs, playwright, higgsfield, runway, pika |
| `bootstrap.mjs` | Installe dans chaque projet les paquets npm, les skills officielles GSAP et Remotion, les templates FREE/PRO. Corrige tsconfig et ESLint. Ne remplace aucun fichier |

Utilisation : `/septim-design:septim-design` (ou `/septim-design:septim-design <ta demande>`), `/septim-design:hero-shot`, `/septim-design:cinematic-dolly`.

superpowers n'est **pas** une dépendance forcée : une dépendance manquante empêche le plugin entier de charger, et ton superpowers vient de ton compte claude.ai (synchronisé), pas du marketplace officiel. Le skill l'utilise s'il est là. Sinon il donne la commande `/plugin install superpowers@claude-plugins-official`.

## Légende statut

| Statut | Signification |
| --- | --- |
| ✅ Installé + vérifié | Présent dans le repo, build/test OK dans le conteneur |
| 🔌 Configuré | Déclaré dans le plugin (`plugins/septim-design/.mcp.json`), se connecte sur ta machine (login OAuth ou clé API) |
| 🖥️ App externe | Ne s'installe pas via npm, il faut une app desktop |
| ❌ N'existe pas | Nom donné dans la demande introuvable, remplacé (voir plus bas) |

---

## A. Le cœur art (composants + 3D)

| Outil | Statut | Prix | À quoi ça sert | Commande |
| --- | --- | --- | --- | --- |
| **21st MCP** (ex-Magic MCP, 21st.dev) | 🔌 MCP `21st` | Clé gratuite. Recherche/récupération de composants gratuite. Génération IA (`generate`) = abonnement 21st AI payant | Chercher et injecter des composants React/shadcn de la communauté 21st.dev | `export TWENTY_FIRST_API_KEY=...` (clé sur 21st.dev/mcp), puis demande « trouve un composant 21st pour un pricing avec toggle ». Alternative : `npx @21st-dev/cli@latest init --client claude` |
| **Magic UI MCP** | 🔌 MCP `magicui` | Gratuit (composants MIT ; templates Pro payants) | Effets marketing qui brillent : marquee, blur-fade, beams, grilles animées | « Ajoute un marquee de logos Magic UI » |
| **shadcn MCP** + registres `@magicui`, `@aceternity`, `@react-bits` | 🔌 MCP `shadcn`, ✅ `components.json` | Gratuit (Aceternity Pro / React Bits Pro payants en option) | Une seule porte d'entrée vers Aceternity UI et React Bits, l'alternative gratuite demandée | `npx shadcn@latest add @aceternity/<composant>`, ou « liste les composants React Bits de texte animé » via le MCP |
| **Spline** (MCP officiel) | 🖥️ intégré à l'app desktop Spline | Free · Starter 15 $/siège/mois · Professional 25 $/siège/mois | Scènes 3D interactives éditées en live par Claude | Installe l'app desktop Spline et ouvre-la : elle enregistre son MCP toute seule (127.0.0.1). Exporte la scène → `NEXT_PUBLIC_SPLINE_SCENE` |
| `@splinetool/react-spline` + `@splinetool/runtime` | ✅ | Gratuit | Afficher une scène Spline dans le site | `<HeroScene />` dans `src/components/hero/hero-scene.tsx` |
| `three` + `@react-three/fiber` + `@react-three/drei` | ✅ | Gratuit | Version FREE de la 3D : l'orbe codé qui s'affiche tant qu'il n'y a pas de scène Spline | `src/components/hero/orb-scene.tsx` |

## B. Le scroll luxe

| Outil | Statut | Prix | À quoi ça sert | Commande |
| --- | --- | --- | --- | --- |
| **Lenis** 1.3 | ✅ | Gratuit | Scroll beurre, piloté par le ticker GSAP pour rester synchro avec ScrollTrigger | `src/components/providers/smooth-scroll.tsx` (déjà branché dans `layout.tsx`) |
| **GSAP** 3.15 + **@gsap/react** | ✅ | Gratuit (tous les plugins, ScrollTrigger inclus) | Animations pilotées par le scroll : pin, scrub, timelines | `useGSAP()`, voir `scrub-text.tsx` et `stack-rail.tsx` |
| **Motion** 14 (ex-Framer Motion) | ✅ | Gratuit (Motion+ optionnel payant) | Apparitions, gestes, layout animations en React | `import { motion } from "motion/react"`, voir `reveal.tsx` |

## C. Motion design / vidéo qui fait vendre

| Outil | Statut | Prix | À quoi ça sert | Commande |
| --- | --- | --- | --- | --- |
| **Remotion** 4 (`remotion`, `@remotion/player`, `@remotion/cli`) | ✅ MP4 rendu et vérifié | **Gratuit** jusqu'à 3 personnes. Au-delà : licence entreprise 25 $/dev/mois, minimum 100 $/mois | Vidéos écrites en React, rendues en MP4, **0 crédit** | `npm run video:studio` · `npm run video:render` (hero-shot) · `npm run video:dolly` |
| **Remotion docs MCP** (`@remotion/mcp`) | 🔌 MCP `remotion-docs` | Gratuit | Donne à Claude la doc Remotion à jour | Automatique |
| **Higgsfield MCP** (Soul + Seedance + Kling, Veo, Cinema Studio… 30+ modèles) | 🔌 MCP `higgsfield` | **PAYANT (crédits)**. Starter 19 $/mois (270 crédits) · Plus 59 $/mois (47 $ en annuel, 1 200 crédits) · Ultra 129 $/mois (99 $ en annuel, 3 000 crédits) · accès 3 $ = 40 crédits. Cinema Studio 5 s 720p ≈ 25 crédits ; Seedance 2.0 ≈ 3 $ les 10 s en 720p. Crédits d'abonnement non reportés d'un mois sur l'autre | `/septim-design:hero-shot` et `/septim-design:cinematic-dolly` en version cinéma | `/mcp` → `higgsfield` → login navigateur. Ensuite `/septim-design:hero-shot <brief>` |
| **Runway MCP** (génération) | 🔌 MCP `runway` | **PAYANT (crédits)**. Standard 15 $/mois · Pro 35 $/mois (2 250 crédits) · Max 95 $/mois (9 500 crédits). Gen-4.5 ≈ 25 crédits/s (10 s ≈ 250 crédits) ; Seedance 2.0 ≈ 3,60 $ les 10 s en 720p | Option PRO alternative : Gen-4.5, Seedance 2.0, Kling 3.0 | `/mcp` → `runway` → login |
| **Pika MCP** | 🔌 MCP `pika` | **PAYANT (crédits)**. Free = 0 crédit (packs seulement) · Starter 10 $/mois (900) · Creator 35 $/mois (3 150) · Fancy 95 $/mois (8 550+) | Option PRO : vidéo, image, musique, voix via ton Pika Agent | `/mcp` → `pika` → login. Plugin officiel aussi dispo : repo GitHub `Pika-Labs/Pika-Plugins` (commandes `/pika:*`) |

### Règle d'or appliquée dans le code

| Effet | Version PRO (crédits) | Version FREE (marche tout de suite) | Où |
| --- | --- | --- | --- |
| Vidéo hero | `NEXT_PUBLIC_HERO_VIDEO_URL` = rendu Higgsfield / Runway / Pika, avec le commentaire `// BESOIN CREDIT: Higgsfield Seedance pour cette vidéo. Alternative gratuite: Remotion <Video> installé ici` | Remotion `<Player>` qui joue la composition `HeroShot` | `src/components/video/hero-video.tsx` |
| Plan hero (commande) | `/septim-design:hero-shot` → Higgsfield Soul + Seedance, **après ta confirmation de dépense** | `/septim-design:hero-shot` → `HeroShot.tsx` puis `npm run video:render` | `plugins/septim-design/skills/hero-shot` |
| Travelling cinéma | `/septim-design:cinematic-dolly` → Higgsfield / Runway, **après confirmation** | Parallaxe de calques Remotion `CinematicDolly.tsx` | `plugins/septim-design/skills/cinematic-dolly` |
| 3D hero | Scène Spline (`NEXT_PUBLIC_SPLINE_SCENE`) | Orbe three.js/R3F | `src/components/hero/hero-scene.tsx` |

Variable PRO vide = version FREE affichée. Le site ne dépend jamais d'un crédit pour fonctionner.

## D. Skills design (dans `.claude/skills/`, chargées automatiquement par Claude Code)

| Skill | Statut | Prix | À quoi ça sert |
| --- | --- | --- | --- |
| **frontend-design** (officielle Anthropic, Apache-2.0) | ✅ incluse dans le plugin | Gratuit | Direction artistique forte, éviter le look « généré par IA » |
| **GSAP AI Skills** officielles (greensock) : core, scrolltrigger, timeline, react, plugins, frameworks, performance, utils | ✅ 8 skills | Gratuit | Claude écrit du GSAP propre (useGSAP, cleanup, ScrollTrigger) |
| **Remotion Agent Skills** officielles : best-practices, create, markup, render, studio, captions, multimedia, maps, saas, interactivity, docs, upgrade | ✅ 12 skills (`.agents/skills`, liées dans `.claude/skills`) | Gratuit | Claude respecte les conventions Remotion (timing, assets, rendu) |
| **septim-design** + `hero-shot` + `cinematic-dolly` | ✅ plugin `septim-design@septim` (ce repo) | Gratuit | L'orchestrateur autonome, voir la section du haut |
| **superpowers** | ✅ déjà sur ton compte (synchronisé claude.ai) | Gratuit | Méthode : brainstorming, plans, exécution, vérification |

## E. Bonus utile

| Outil | Statut | Prix | À quoi ça sert |
| --- | --- | --- | --- |
| **Playwright MCP** (Microsoft) | 🔌 MCP `playwright` | Gratuit | Claude ouvre le site dans un vrai navigateur et vérifie que l'animation marche |
| `@fontsource-variable/bricolage-grotesque`, `jetbrains-mono` | ✅ | Gratuit | Polices auto-hébergées (aucun appel Google Fonts au build) |
| `clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react` | ✅ | Gratuit | Base requise par les composants shadcn / Magic UI / Aceternity / 21st |

---

## F. SEPTIM-VIRAL-OS (l'usine à vidéos)

| Brique | Statut | Prix | À quoi ça sert | Commande |
| --- | --- | --- | --- | --- |
| Moteur `src/viral-engine` (165 tests avec le site) | ✅ | Gratuit | Tendances → hook H.E.A.T → voix → rendu 9:16 → WhatsApp → publication → apprentissage | `npm run viral -- "sujet"` |
| 3 templates 9:16 (story, maths, film) | ✅ MP4 rendus et vérifiés | Gratuit | Sous-titres mot à mot, coup visuel à chaque beat, barre de progression, réponse à ≥ 80 %, CTA « garde ça » | `--template story\|maths\|film` |
| Voix Piper (FR) / Kokoro (EN) | ✅ code vérifié avec une vraie voix Piper | Gratuit, local | Voix grave à 1,1× | voir `viral:doctor` |
| Lit lo-fi généré par code | ✅ | Gratuit, sans droits | Fond sonore qui ne fatigue pas | automatique |
| Ollama + qwen2.5 | 🔌 chez toi | Gratuit, local | Script automatique du démon (repli conforme sinon) | `ollama pull qwen2.5:7b` |
| Tendances | ✅ code | Google Trends (gratuit), YouTube (clé gratuite), Apify (offre gratuite) | Sujet du jour | `YOUTUBE_API_KEY`, `APIFY_TOKEN` |
| WhatsApp (whatsapp-web.js) | ✅ code, 🔌 QR chez toi | Gratuit, **non officiel** | « Vidéo prête boss, je publie ? » | `npm run viral:daemon` |
| Postiz | 🔌 chez toi | Cloud 29 $/mois (publication publique) · auto-hébergé gratuit (TikTok/YouTube privés sans audit) | Publication TikTok, YouTube, Instagram, Facebook + analytics | `npm i -g postiz && postiz auth:login` |
| PRO Higgsfield (B-roll) | ✅ branche rendue et vérifiée avec des clips de test | ≈ 3 $ / 10 s en 720p | Plans cinéma derrière les sous-titres | `--broll <dossier>` après ton OUI chiffré |

## G. Le site

Refait selon la science de la rétention : clarté en 0,5 s, promesse ouverte payée au chapitre 7 (≥ 80 % de la page), HUD « Chapitre n sur 7 », interruptions visuelles, secrets tirés au hasard (2,5 par visite en moyenne), son généré **opt-in**, fil infini au lieu d'un footer (mentions légales dans l'en-tête), titres qui s'étirent avec la vitesse du scroll, téléphones qui jouent les vrais templates de l'usine. Palette indigo du tissu Ndop, polices Anybody + Instrument Sans.

## Ce qui n'existe pas dans la demande et ce qui le remplace

| Demandé | Réalité (vérifié sur le registre npm et la doc officielle) | Remplacé par |
| --- | --- | --- |
| `@modelcontextprotocol/server-facebook` / `server-youtube` | 404 sur npm | Postiz (publie FB, IG, YouTube, TikTok) ; MCP communautaires optionnels listés dans `plugins/septim-viral/skills/viral/references/setup.md` |
| « TikTok MCP le plus étoilé » pour publier | Seym0n/tiktok-mcp (159 ⭐) lit seulement, ne publie pas | Postiz pour publier, Apify pour les tendances |
| « MCP WhatsApp officiel » | Il n'existe pas ; lharries/whatsapp-mcp est non officiel | whatsapp-web.js dans le démon (toi seul comme destinataire) |
| Kokoro pour la voix française | kokoro-js ne fait que l'anglais | Piper `fr_FR-tom-medium` (FR), Kokoro (EN) |
| « Son trending scrappé et utilisé » | Aucune API ne permet d'attacher un son de la bibliothèque TikTok | Le message WhatsApp donne le son tendance, à ajouter dans l'app au moment de poster |
| « Publie automatiquement partout » | TikTok et YouTube forcent le privé pour les apps non auditées | Postiz cloud (apps approuvées) ou mode manuel (légende prête à coller) |
| « X trending sounds » | X n'a pas de sons, son API est payante | Google Trends, YouTube, TikTok Creative Center |
| Cron dans WSL | WSL ne lance pas cron sans systemd | `node-cron` dans le démon, gardé en vie par pm2 |
| `npx @21st-dev/mcp-server` | 404 sur npm. Magic MCP est devenu « 21st MCP » | Serveur HTTP `https://21st.dev/api/mcp` + clé API (ou `@21st-dev/cli init`) |
| `@splinetool/mcp` | 404 sur npm. Le MCP Spline est intégré à l'app desktop. Le serveur communautaire `aydinfer/spline-mcp-server` est archivé | App desktop Spline + R3F en FREE |
| `npx remotion mcp` | Ce n'est pas une commande. Le MCP officiel `@remotion/mcp` sert à la **doc** ; le rendu passe par le CLI + les skills | `@remotion/mcp` + Remotion CLI + 12 skills. Le paquet communautaire `remotion-mcp` existe mais n'est pas officiel, donc pas installé |
| « Higgsfield Soul MCP + Seedance MCP » | Un seul MCP hébergé officiel donne accès à Soul **et** Seedance (et 30+ modèles). Le paquet npm `higgsfield-mcp` est communautaire, pas officiel | `https://mcp.higgsfield.ai/mcp` |
| « Runway MCP » | Attention, 2 produits portent ce nom : `runway.team` (gestion de releases mobiles, hors sujet) et RunwayML (vidéo) | `https://mcp.runwayml.com/mcp` (RunwayML, génération) |

## Première connexion sur ta machine

0. Usine vidéo : `npm run viral:doctor`, suis ses commandes (voix, Ollama, WhatsApp, Postiz), puis `npm i -g pm2 && pm2 start ecosystem.config.cjs`.
1. `npm install`, puis `npm run dev` : le site tourne en version FREE, sans aucune clé.
2. Dans Claude Code : `/plugin marketplace add SeptimeDSR/design` puis `/plugin install septim-design@septim`. Pour 21st : `export TWENTY_FIRST_API_KEY=...` (clé gratuite sur 21st.dev/mcp) avant de lancer `claude`.
3. Dans Claude Code : `/mcp` → connecte `higgsfield`, `runway`, `pika` (login navigateur, aucune clé API à copier).
4. Spline : installe l'app desktop et ouvre-la, le MCP s'enregistre tout seul.
5. Copie `.env.example` en `.env.local` et remplis les variables PRO quand tu as des assets payants.

## Preuves de vérification (conteneur cloud)

- `npm run typecheck`, `npm run lint`, `npm run build` : OK.
- Navigateur headless, desktop 1440 px + mobile 390 px : 0 erreur console, 0 débordement horizontal, canvas 3D rendu, section épinglée GSAP qui défile à l'horizontale.
- `npm run video:render` : MP4 1920×1080, 6 s, 1,7 Mo, rendu sans crédit.
- `npm audit --omit=dev` : 0 vulnérabilité dans les dépendances de prod.
- Plugin : `claude plugin validate --strict` OK (plugin + marketplace). Installé depuis le marketplace local : statut « enabled », 4 skills et 8 MCP détectés, ~365 tokens ajoutés par session.
- Bootstrap testé sur un projet Next.js vierge : installe tout, 2ᵉ passage = `ready: true`, typecheck + ESLint + build OK avec les templates branchés.
- Usine et site : 165 tests vitest verts ; rendus réels des 3 templates ; pipeline de bout en bout avec une vraie voix Piper (MP4 h264 + aac) ; démon lancé, cycle hors ligne, réponse « oui » → publié en mode manuel ; branche PRO B-roll rendue avec des clips de test.
- Site : navigateur 1440 / 390 / reduced-motion : 0 erreur, 0 débordement, HUD qui avance, aucun AudioContext avant un clic, fil infini qui grandit, secrets aléatoires.
- Skills testées par sous-agents : 3 scénarios RED sans skill (ils ont révélé 5 vrais défauts, corrigés) puis GREEN avec skill (voir `docs/skill-tests.md`).
- Limite : depuis le conteneur, seuls npm et le CDN des skills étaient joignables. Les endpoints MCP (21st, Higgsfield, Runway, Pika) et les registres de composants n'ont pas pu être appelés ici ; ils sont configurés, et la connexion se fait chez toi.

## Sources

- 21st MCP : README du paquet npm `@21st-dev/magic` · https://21st.dev/mcp
- Magic UI MCP : https://github.com/magicuidesign/mcp
- shadcn MCP / registres : https://ui.shadcn.com/docs/mcp · React Bits MCP : https://pro.reactbits.dev/docs/mcp
- Spline MCP : https://docs.spline.design/generate/spline-mcp-server · https://thenewstack.io/spline-v2-mcp-agents/
- Remotion MCP / skills / licence : https://remotion.dev/docs/ai/mcp · https://www.remotion.dev/docs/ai/skills · https://www.remotion.dev/docs/license
- GSAP skills : https://github.com/greensock/gsap-skills
- Higgsfield MCP : https://higgsfield.ai/creator-hub/help-center/integrations/how-do-i-connect-higgsfield-to-ai-agent · tarifs : https://www.layer3labs.io/guides/higgsfield-ai-pricing
- Runway MCP : https://runwayml.com/news/mcp · https://help.runwayml.com/hc/en-us/articles/51931843164691-Runway-MCP · tarifs : https://creatify.ai/blog/runway-pricing-(2026)-plans-credits-and-what-you-ll-actually-pay
- Pika MCP : https://mcp.pika.me/ · https://github.com/Pika-Labs/Pika-Plugins · tarifs : https://pricingsaas.com/companies/pika
- Comparatif 21st / Magic UI / Aceternity : https://vp0.com/blogs/21st-dev-vs-magic-ui-vs-aceternity
- Spline tarifs : https://costbench.com/software/ai-3d-generation/spline/
- Postiz : https://github.com/gitroomhq/postiz-app · tarifs : https://postplanify.com/postiz-pricing
- TikTok Content Posting API (apps non auditées en privé) : https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
- YouTube videos.insert (projets non audités en privé) : https://developers.google.com/youtube/v3/docs/videos/insert
- Piper voix FR : https://huggingface.co/rhasspy/piper-voices · Kokoro : https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX
- WhatsApp MCP (non officiel) : https://github.com/lharries/whatsapp-mcp · TikTok MCP : https://github.com/Seym0n/tiktok-mcp
- Apify TikTok Creative Center : https://apify.com/eunit/tiktok-trends-scraper
- Statistique des 3 secondes : https://jellymarketing.ca/blog/stop-the-scroll-in-3-seconds-secrets-to-high-performing-short-form-video-hooks/
