@AGENTS.md

**Travail en cours (reprise) :** lire `docs/REPRISE.md` avant toute action. Plan en cours : `docs/superpowers/plans/2026-10-05-septim-portes.md` (tâches P1 à P3 faites, reprendre à P4), registre `docs/handoff/ledger-septim-portes.md`.

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

Commandes : `npm run dev`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run video:studio`.
Usine : `septim` (bin/septim.mjs, `npm link` ; sinon `npm run septim -- …`) — `video "sujet" [--template story|maths|film] [--script f.json] [--broll dossier]`, `lint f.json`, `videos`, `voir <ref>`, `publier <ref>`, `jeter <ref>`, `studio`, `start`, `mcp`, `connect <client> [--write]`, `setup [--voix]`, `doctor`. Toutes les portes passent par `src/viral-engine/factory.ts` ; serveur dans `src/viral-engine/server/`, MCP dans `mcp.ts`, Studio dans `studio/`. Mode d'emploi : `docs/GUIDE.md` (un test vérifie qu'il cite chaque commande, outil MCP, route et variable).
