@AGENTS.md

**Reprise :** lire `docs/REPRISE.md` avant toute action. Plan `docs/superpowers/plans/2026-10-05-septim-portes.md` terminé (P1 à P11) ; décisions et mineurs restants dans le registre `docs/handoff/ledger-septim-portes.md`.

# Règle d'or : FREE d'abord, PRO en second

Chaque effet visuel, vidéo, voix ou musique a une voie gratuite qui tourne par défaut, sans compte ni crédit :

- **FREE** (Remotion, three.js/R3F, GSAP, Lenis, Motion ; IA locale ComfyUI + Wan 2.2 / LTX-2 ; banques libres Pexels/Pixabay ; Piper, Chatterbox ; ACE-Step) : toujours codée et fonctionnelle, c'est la branche par défaut quand la variable PRO est vide.
- **PRO** (Higgsfield, Runway, Pika — payant en crédits) : seulement en second, quand le gratuit ne suffit pas, coût affiché et oui explicite. Commenter dans le code
  `// BESOIN CREDIT: <outil> pour <usage>. Alternative gratuite: <outil free> installé ici`
  et ne jamais lancer une génération payante sans confirmation explicite.

Inventaire complet des outils, prix et commandes : `.claude/INVENTAIRE-DESIGN-2026.md`.

Plugins `septim-design` et `septim-viral` dans `plugins/` (marketplace `septim` : `.claude-plugin/marketplace.json`). Les templates de `plugins/septim-design/skills/septim-design/templates/` sont la source de vérité des composants génériques (`smooth-scroll`, `reveal`, `retention/*`) : une correction faite dans `src/components/` doit y être reportée, et inversement. Valider avec `claude plugin validate --strict plugins/<nom>`.

Usine vidéo : `src/viral-engine/` (TDD, `npm test`), templates `src/remotion/viral/` (imports relatifs uniquement). Toute règle virale chiffrée vit dans `src/viral-engine/viral-checklist.json`. Le démon ne publie jamais sans OUI et ne dépense jamais de crédits.

Commandes : `npm run dev`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run video:studio`.
Usine : `septim` (bin/septim.mjs, `npm link` ; sinon `npm run septim -- …`) — `video "sujet" [--template story|maths|film] [--script f.json] [--broll dossier]`, `lint f.json`, `videos`, `voir <ref>`, `publier <ref>`, `jeter <ref>`, `studio`, `start`, `mcp`, `connect <client> [--write]`, `setup [--voix]`, `doctor`. Toutes les portes passent par `src/viral-engine/factory.ts` ; serveur dans `src/viral-engine/server/`, MCP dans `mcp.ts`, Studio dans `studio/`. Mode d'emploi : `docs/GUIDE.md` (un test vérifie qu'il cite chaque commande, outil MCP, route et variable).
