---
description: Plan hero vidéo — PRO Higgsfield (Soul + Seedance, crédits) ou FREE Remotion (0 crédit)
argument-hint: "[description du plan]"
---

Crée le plan hero vidéo du site : $ARGUMENTS

Règle d'or crédit / gratuit — toujours deux versions :

1. **Version FREE (toujours, en premier)** : adapte `src/remotion/compositions/HeroShot.tsx`
   au brief (titre, tagline, couleurs, rythme), vérifie dans `npm run video:studio`, puis
   rends le MP4 avec `npm run video:render` → `public/videos/hero-shot.mp4`.
   Le site affiche déjà cette version via `<HeroVideo />` (Remotion `<Player>`), sans crédit.

2. **Version PRO (seulement si le serveur MCP `higgsfield` est connecté ET que je confirme
   la dépense)** : annonce d'abord `BESOIN CREDIT: Higgsfield Soul (image) + Seedance (vidéo)`
   avec l'estimation de crédits, attends mon OK, puis génère via le MCP `higgsfield`
   (Soul pour le personnage / le visuel clé, Seedance pour l'animation). Alternatives
   payantes si Higgsfield est indisponible : MCP `runway` (Gen-4.5 / Seedance 2.0) ou `pika`.
   Dépose le fichier dans `public/videos/` et renseigne `NEXT_PUBLIC_HERO_VIDEO_URL`.

Dans le code, laisse le commentaire :
`// BESOIN CREDIT: Higgsfield Seedance pour cette vidéo. Alternative gratuite: Remotion <Video> installé ici`
