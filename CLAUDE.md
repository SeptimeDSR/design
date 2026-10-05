@AGENTS.md

# Règle d'or : PRO avec crédits / FREE tout de suite

Chaque effet visuel ou vidéo existe en deux versions :

- **PRO** (Higgsfield, Runway, Pika — payant en crédits) : commenter dans le code
  `// BESOIN CREDIT: <outil> pour <usage>. Alternative gratuite: <outil free> installé ici`
  et ne jamais lancer une génération payante sans confirmation explicite.
- **FREE** (Remotion, three.js/R3F, GSAP, Lenis, Motion) : toujours codée et fonctionnelle,
  c'est la branche par défaut quand la variable d'environnement PRO est vide.

Inventaire complet des outils, prix et commandes : `.claude/INVENTAIRE-DESIGN-2026.md`.

Commandes : `npm run dev`, `npm run typecheck`, `npm run lint`, `npm run build`,
`npm run video:studio`, `npm run video:render`, `npm run video:dolly`.
