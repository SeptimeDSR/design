---
name: hero-shot
description: Use when the user asks for a hero video, intro clip, opening shot or /hero-shot for a website, in either the free code version or the paid AI version (Higgsfield Soul, Seedance, Runway, Pika).
---

# Hero shot

Plan vidéo du hero. Gratuit d'abord : on monte d'un étage seulement si l'étage gratuit ne suffit pas pour ce brief.

1. **FREE, en premier, toujours.** Adapte `<src>/remotion/compositions/HeroShot.tsx` au brief et aux tokens de `.septim/PROJECT.md`. Templates absents : lance d'abord le bootstrap du skill `septim-design`. Prévisualise avec `npm run video:studio`, puis rends avec `npm run video:render` → `public/videos/hero-shot.mp4`. Le composant `hero-video.tsx` l'affiche déjà sans crédit.
2. **FREE IA locale, si l'utilisateur a un GPU NVIDIA 8 Go+ et ComfyUI** (`curl -s http://127.0.0.1:8188/system_stats` répond, ou `$COMFYUI_URL`) : génère le plan avec Wan 2.2 5B (Apache 2.0) ou LTX-2 en envoyant le workflow au format API à `POST /prompt`, récupère le MP4 par `/history/<id>` puis `/view`, et dépose-le dans `public/videos/`. Sans GPU : un plan libre Pexels vertical (clé gratuite) peut servir de fond, avec le titre en Remotion par-dessus. Installation : `docs/GUIDE.md` de l'usine, section « Gratuit d'abord ».
3. **PRO en dernier, seulement si un MCP vidéo est connecté et que l'utilisateur dit oui à un coût affiché.** Affiche d'abord `BESOIN CREDIT: Higgsfield Soul (image clé) + Seedance (animation)` avec l'estimation (voir `references/stack.md` du skill `septim-design`). Attends le « oui ». Génère via `higgsfield` (sinon `runway` ou `pika`). Dépose le fichier dans `public/videos/` et renseigne `NEXT_PUBLIC_HERO_VIDEO_URL`.

Le code garde le commentaire :
`// BESOIN CREDIT: Higgsfield Seedance pour cette vidéo. Alternative gratuite: Remotion <Video> installé ici`
