---
name: hero-shot
description: Use when the user asks for a hero video, intro clip, opening shot or /hero-shot for a website, in either the free code version or the paid AI version (Higgsfield Soul, Seedance, Runway, Pika).
---

# Hero shot

Plan vidéo du hero. Toujours deux versions.

1. **FREE, en premier, toujours.** Adapte `<src>/remotion/compositions/HeroShot.tsx` au brief et aux tokens de `.septim/PROJECT.md`. Templates absents : lance d'abord le bootstrap du skill `septim-design`. Prévisualise avec `npm run video:studio`, puis rends avec `npm run video:render` → `public/videos/hero-shot.mp4`. Le composant `hero-video.tsx` l'affiche déjà sans crédit.
2. **PRO, seulement si un MCP vidéo est connecté et que l'utilisateur dit oui.** Affiche d'abord `BESOIN CREDIT: Higgsfield Soul (image clé) + Seedance (animation)` avec l'estimation (voir `references/stack.md` du skill `septim-design`). Attends le « oui ». Génère via `higgsfield` (sinon `runway` ou `pika`). Dépose le fichier dans `public/videos/` et renseigne `NEXT_PUBLIC_HERO_VIDEO_URL`.

Le code garde le commentaire :
`// BESOIN CREDIT: Higgsfield Seedance pour cette vidéo. Alternative gratuite: Remotion <Video> installé ici`
