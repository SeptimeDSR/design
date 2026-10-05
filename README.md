# Septim — Design Stack 2026

Ce repo contient deux choses :

1. **Le plugin Claude Code `septim-design`** (`plugins/septim-design`), un directeur artistique autonome utilisable dans tous tes projets.
2. **Un site de démo** Next.js 16 (`src/`) qui montre la stack : Lenis + GSAP + Motion, 3D, vidéo Remotion, chaque effet en version FREE et PRO.

## Installer le plugin une fois, pour tous les projets

Dans Claude Code :

```
/plugin marketplace add SeptimeDSR/design
/plugin install septim-design@septim
```

Ensuite, dans n'importe quel projet :

```
/septim-design:septim-design                      → il lit le projet, résume, pose une question
/septim-design:septim-design refais le hero       → il lit le projet et attaque directement
/septim-design:hero-shot                           → plan vidéo hero (FREE Remotion / PRO Higgsfield)
/septim-design:cinematic-dolly                     → travelling cinéma (FREE / PRO)
```

Il s'appuie sur **superpowers** (brainstorming → plan → exécution → vérification) quand il est installé. Si superpowers manque : `/plugin install superpowers@claude-plugins-official`.

## Lancer la démo

```bash
npm install
npm run dev            # version FREE, aucune clé requise
npm run video:studio   # éditeur vidéo Remotion
npm run video:render   # rend public/videos/hero-shot.mp4 (0 crédit)
```

Outils, prix et commandes : [`.claude/INVENTAIRE-DESIGN-2026.md`](.claude/INVENTAIRE-DESIGN-2026.md).
