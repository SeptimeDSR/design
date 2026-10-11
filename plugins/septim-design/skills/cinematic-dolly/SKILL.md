---
name: cinematic-dolly
description: Use when the user asks for a cinematic camera push, dolly-in, travelling shot, parallax camera move or /cinematic-dolly for a website video, free code version or paid AI version.
---

# Cinematic dolly

Travelling avant. Gratuit d'abord : on monte d'un étage seulement si l'étage gratuit ne suffit pas.

1. **FREE, en premier, toujours.** Adapte `<src>/remotion/compositions/CinematicDolly.tsx`. C'est une parallaxe de calques : plus un calque est proche, plus sa `depth` est forte. Garde la `depth` du titre ≤ 0,5 pour qu'il reste lisible jusqu'à la fin. Vérifie une image tardive avec `npx remotion still <src>/remotion/index.ts cinematic-dolly out.png --frame=125`, puis rends avec `npm run video:dolly`.
2. **FREE IA locale, si ComfyUI tourne avec un GPU** (`$COMFYUI_URL` ou `http://127.0.0.1:8188/system_stats`) : Wan 2.2 5B ou LTX-2 au format API (`POST /prompt`, puis `/history/<id>` et `/view`), prompt « slow dolly-in, … », plan déposé dans `public/videos/`. Voir `docs/GUIDE.md` de l'usine, « Gratuit d'abord ».
3. **PRO en dernier, seulement si `higgsfield` ou `runway` est connecté et que l'utilisateur dit oui à un coût affiché.** Affiche `BESOIN CREDIT: Higgsfield Seedance (ou Runway Gen-4.5) pour ce plan` avec l'estimation, attends le « oui », génère, puis dépose dans `public/videos/`.

Le composant qui affiche la vidéo garde toujours la branche FREE en fallback.
