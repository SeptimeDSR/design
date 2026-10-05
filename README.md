# Septim — sites et vidéos qu'on n'arrive pas à quitter

Ce repo contient trois choses :

1. **Deux plugins Claude Code** (`plugins/`) à installer une fois pour tous tes projets :
   - `septim-design` : directeur artistique autonome (sites qui retiennent, version FREE et PRO).
   - `septim-viral` : SEPTIM-VIRAL-OS, l'usine à vidéos courtes virales.
2. **L'usine** (`src/viral-engine/`, `src/remotion/viral/`) : tendances → hook H.E.A.T → voix → MP4 9:16 → WhatsApp « je publie ? » → publication sur OUI → apprentissage.
3. **Le site Septim** (`src/app/`) : refait selon la science de la rétention.

## Installer les plugins (une fois)

Dans Claude Code :

```
/plugin marketplace add SeptimeDSR/design
/plugin install septim-design@septim
/plugin install septim-viral@septim
```

Puis, dans n'importe quel projet :

```
/septim-design:septim-design                  → il lit le projet, résume, pose une question
/septim-design:septim-design refais le hero   → il attaque directement
/septim-viral:viral "je veux une histoire sur la tontine"
```

Dans une session cloud sur ce repo, le hook `.claude/hooks/session-start.sh` installe les deux plugins tout seul.

## Lancer l'usine chez toi (WSL)

```bash
npm install
npm run viral:doctor                      # ce qui tourne, ce qui manque, avec les commandes
npm run viral -- "je veux une histoire sur la tontine" --template maths
npm i -g pm2 && pm2 start ecosystem.config.cjs   # le démon : une vidéo toutes les 6 h, WhatsApp pour valider
```

Sans aucune clé, tout tourne en FREE : rendu Remotion, lit lo-fi généré, publication manuelle (légende prête à coller). Guide complet : `plugins/septim-viral/skills/viral/references/setup.md`.

## Lancer le site

```bash
npm run dev
npm test            # 128 tests du moteur viral
npm run typecheck && npm run lint && npm run build
```

Outils, prix, ce qui n'existe pas et pourquoi : [`.claude/INVENTAIRE-DESIGN-2026.md`](.claude/INVENTAIRE-DESIGN-2026.md).
