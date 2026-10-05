@AGENTS.md

# Règle d'or : PRO avec crédits / FREE tout de suite

Chaque effet visuel ou vidéo existe en deux versions :

- **PRO** (Higgsfield, Runway, Pika — payant en crédits) : commenter dans le code
  `// BESOIN CREDIT: <outil> pour <usage>. Alternative gratuite: <outil free> installé ici`
  et ne jamais lancer une génération payante sans confirmation explicite.
- **FREE** (Remotion, three.js/R3F, GSAP, Lenis, Motion) : toujours codée et fonctionnelle,
  c'est la branche par défaut quand la variable d'environnement PRO est vide.

Inventaire complet des outils, prix et commandes : `.claude/INVENTAIRE-DESIGN-2026.md`.

Plugins `septim-design` et `septim-viral` dans `plugins/` (marketplace `septim` : `.claude-plugin/marketplace.json`). Les templates de `plugins/septim-design/skills/septim-design/templates/` sont la source de vérité des composants génériques (`smooth-scroll`, `reveal`, `retention/*`) : une correction faite dans `src/components/` doit y être reportée, et inversement. Valider avec `claude plugin validate --strict plugins/<nom>`.

Usine vidéo : `src/viral-engine/` (TDD, `npm test`), templates `src/remotion/viral/` (imports relatifs uniquement). Toute règle virale chiffrée vit dans `src/viral-engine/viral-checklist.json`. Le démon ne publie jamais sans OUI et ne dépense jamais de crédits.

Commandes : `npm run dev`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`,
`npm run viral -- "sujet" [--template story|maths|film] [--script f.json] [--lint-only] [--broll dossier]`,
`npm run viral:doctor`, `npm run viral:daemon`, `npm run video:studio`.
