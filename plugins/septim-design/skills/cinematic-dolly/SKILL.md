---
name: cinematic-dolly
description: Use when the user asks for a cinematic camera push, dolly-in, travelling shot, parallax camera move or /cinematic-dolly for a website video, free code version or paid AI version.
---

# Cinematic dolly

Travelling avant. Toujours deux versions.

1. **FREE, en premier, toujours.** Adapte `<src>/remotion/compositions/CinematicDolly.tsx`. C'est une parallaxe de calques : plus un calque est proche, plus sa `depth` est forte. Garde la `depth` du titre ≤ 0,5 pour qu'il reste lisible jusqu'à la fin. Vérifie une image tardive avec `npx remotion still <src>/remotion/index.ts cinematic-dolly out.png --frame=125`, puis rends avec `npm run video:dolly`.
2. **PRO, seulement si `higgsfield` ou `runway` est connecté et que l'utilisateur dit oui.** Affiche `BESOIN CREDIT: Higgsfield Seedance (ou Runway Gen-4.5) pour ce plan` avec l'estimation, attends le « oui », génère, puis dépose dans `public/videos/`.

Le composant qui affiche la vidéo garde toujours la branche FREE en fallback.
