# Septim — sites et vidéos qu'on n'arrive pas à quitter

> Reprendre le travail dans une nouvelle session ou un autre compte : [`docs/REPRISE.md`](docs/REPRISE.md) (prompt de reprise inclus).

Ce repo contient trois choses :

1. **Deux plugins Claude Code** (`plugins/`) à installer une fois pour tous tes projets :
   - `septim-design` : directeur artistique autonome (sites qui retiennent, version FREE et PRO).
   - `septim-viral` : SEPTIM-VIRAL-OS, l'usine à vidéos courtes virales.
2. **L'usine** (`src/viral-engine/`, `src/remotion/viral/`) : tendances → hook H.E.A.T → voix → MP4 9:16 → WhatsApp « je publie ? » → publication sur OUI → apprentissage.
3. **Le site Septim** (`src/app/`) : refait selon la science de la rétention.

## Installer et lancer (une commande)

```bash
git clone https://github.com/SeptimeDSR/design ~/septim
bash ~/septim/scripts/install.sh --voix     # npm, commande septim, .env, Claude Code, voix, diagnostic
septim studio                               # http://127.0.0.1:4321 : fabriquer, regarder, publier avec OUI
```

Toutes les portes de l'usine : navigateur (`septim studio`), terminal (`septim video "sujet"`), Claude Code (`/septim-viral:viral`, `:videos`, `:publier`, `:studio`, `:aide`), assistants MCP (`septim connect claude-desktop --write`, cursor, vscode, windsurf, codex, gemini), API REST + OpenAPI (n8n, Make, Zapier), webhooks signés, WhatsApp (`septim start`).

**Mode d'emploi complet : [`docs/GUIDE.md`](docs/GUIDE.md).**

Plugins Claude Code à la main (si tu n'utilises pas `install.sh`) :

```
/plugin marketplace add SeptimeDSR/design
/plugin install septim-design@septim
/plugin install septim-viral@septim
```

Dans une session cloud sur ce repo, le hook `.claude/hooks/session-start.sh` installe les deux plugins tout seul. Sans aucune clé, tout tourne en FREE : rendu Remotion, lit lo-fi généré, publication manuelle (légende prête à coller).

## Lancer le site

```bash
echo "NEXT_PUBLIC_WHATSAPP_NUMBER=2376XXXXXXXX" >> .env.local   # sinon le bouton WhatsApp n'arrive pas chez toi
npm run dev
npm test            # moteur viral + site
npm run typecheck && npm run lint && npm run build
```

Outils, prix, ce qui n'existe pas et pourquoi : [`.claude/INVENTAIRE-DESIGN-2026.md`](.claude/INVENTAIRE-DESIGN-2026.md).
