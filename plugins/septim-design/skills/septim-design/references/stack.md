# Stack Septim Design (prix relevés en octobre 2026, à revérifier avant achat)

## Serveurs MCP (fournis par le plugin, actifs dans tous les projets)

| MCP | Prix | Usage | Connexion |
| --- | --- | --- | --- |
| `21st` | Clé gratuite. Génération IA = abonnement 21st | Chercher et récupérer des composants 21st.dev | Variable d'env `TWENTY_FIRST_API_KEY` (clé sur 21st.dev/mcp) |
| `magicui` | Gratuit | Composants animés Magic UI | Aucune |
| `shadcn` | Gratuit | Registres `@magicui`, `@aceternity`, `@react-bits` (alternative gratuite à Aceternity Pro / React Bits Pro) | Aucune. Les registres se déclarent dans le `components.json` du projet |
| `remotion-docs` | Gratuit | Doc Remotion à jour | Aucune |
| `playwright` | Gratuit | Vérifier le site dans un vrai navigateur | Aucune |
| `higgsfield` | **Crédits** : Starter 19 $/mois (270) · Plus 59 $/mois (1 200) · Ultra 129 $/mois (3 000) · 3 $ = 40 crédits. Cinema Studio 5 s 720p ≈ 25 crédits ; Seedance 2.0 ≈ 3 $ / 10 s 720p | Soul (image, personnage cohérent) + Seedance (vidéo) + 30 modèles | `/mcp` → login navigateur |
| `runway` | **Crédits** : Standard 15 $/mois · Pro 35 $/mois (2 250) · Max 95 $/mois (9 500). Gen-4.5 ≈ 25 crédits/s | Gen-4.5, Seedance 2.0, Kling 3.0 | `/mcp` → login navigateur |
| `pika` | **Crédits** : Starter 10 $/mois (900) · Creator 35 $/mois (3 150) · Fancy 95 $/mois (8 550+) | Vidéo, image, musique, voix | `/mcp` → login navigateur |

Spline : le MCP officiel est intégré à l'app desktop Spline (127.0.0.1) et s'enregistre tout seul à l'ouverture. Plans : Free · Starter 15 $/siège · Professional 25 $/siège.

## Paquets npm (installés par `bootstrap.mjs`, gratuits)

`lenis` · `gsap` + `@gsap/react` · `motion` · `three` + `@react-three/fiber` + `@react-three/drei` · `@splinetool/react-spline` + `@splinetool/runtime` · `remotion` + `@remotion/player` + `@remotion/cli`.
Licence Remotion : gratuite jusqu'à 3 personnes, ensuite 25 $/dev/mois (minimum 100 $/mois).

## Skills

| Skill | Source | Installée par |
| --- | --- | --- |
| `superpowers:*` | `superpowers@claude-plugins-official` (ou synchronisé depuis claude.ai) | déjà présent sur ton compte, sinon `/plugin install superpowers@claude-plugins-official` |
| `frontend-design` | skill officielle Anthropic (Apache-2.0) | incluse dans ce plugin |
| `gsap-*` (8) | `greensock/gsap-skills` (MIT) | `bootstrap.mjs`, dans le projet |
| `remotion-*` (12) | `npx remotion skills add` | `bootstrap.mjs`, dans le projet |

## Templates (copiés par `bootstrap.mjs`)

| Fichier | FREE | PRO |
| --- | --- | --- |
| `components/septim/smooth-scroll.tsx` | Lenis + GSAP ticker | — |
| `components/septim/reveal.tsx` | Motion, `onMount` pour le hero | — |
| `components/septim/scrub-text.tsx` | GSAP ScrollTrigger scrub | — |
| `components/septim/hero-scene.tsx` + `orb-scene.tsx` | Orbe R3F | `NEXT_PUBLIC_SPLINE_SCENE` |
| `components/septim/hero-video.tsx` | Remotion `<Player>` | `NEXT_PUBLIC_HERO_VIDEO_URL` (Higgsfield / Runway / Pika) |
| `remotion/compositions/HeroShot.tsx`, `CinematicDolly.tsx` | Rendu MP4 sans crédit | — |

`smooth-scroll.tsx` s'enveloppe autour du contenu dans le layout racine. Les variables `NEXT_PUBLIC_*` sont pour Next.js ; sous Vite, utilise `import.meta.env.VITE_*`.
