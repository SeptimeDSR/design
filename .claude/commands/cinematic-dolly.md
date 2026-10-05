---
description: Travelling avant cinématique — PRO Higgsfield/Runway (crédits) ou FREE Remotion (0 crédit)
argument-hint: "[sujet de la scène]"
---

Crée un plan "cinematic dolly" (travelling avant) : $ARGUMENTS

Règle d'or crédit / gratuit — toujours deux versions :

1. **Version FREE (toujours, en premier)** : adapte `src/remotion/compositions/CinematicDolly.tsx`
   (calques en parallaxe : plus un calque est proche, plus sa `depth` est forte), vérifie dans
   `npm run video:studio`, puis `npm run video:dolly` → `public/videos/cinematic-dolly.mp4`.

2. **Version PRO (seulement si le MCP `higgsfield` ou `runway` est connecté ET que je confirme
   la dépense)** : annonce `BESOIN CREDIT: Higgsfield Seedance (ou Runway Gen-4.5) pour ce plan`
   avec l'estimation, attends mon OK, génère, dépose dans `public/videos/`.

Le composant qui affiche la vidéo garde toujours la branche FREE en fallback.
