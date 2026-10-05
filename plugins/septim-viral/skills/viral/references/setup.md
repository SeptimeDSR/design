# Installer l'usine chez toi (Linux, WSL Ubuntu, macOS)

```bash
git clone https://github.com/SeptimeDSR/design ~/septim
bash ~/septim/scripts/install.sh --voix   # npm, commande septim, .env, Claude Code, voix française, diagnostic
```

Le script est idempotent : relance-le quand tu veux. Ensuite, `septim doctor` dit ce qui manque, avec les commandes. Mode d'emploi complet : `docs/GUIDE.md`.

| Brique | Coût | Commande |
| --- | --- | --- |
| Voix française (Piper) | gratuit | `septim setup --voix` (Piper dans `.septim-viral/venv`, voix `fr_FR-tom-medium`) |
| Voix anglaise (Kokoro) | gratuit | `npm i kokoro-js` |
| Script automatique (Ollama + qwen2.5) | gratuit | `curl -fsSL https://ollama.com/install.sh \| sh` puis `ollama pull qwen2.5:7b` (`qwen2.5:3b` si peu de RAM) |
| WhatsApp | gratuit, non officiel (un seul destinataire, faible volume) | `septim start`, scanner le QR une fois |
| Vraies vidéos WhatsApp | gratuit | installer Google Chrome, `WHATSAPP_CHROME_PATH=/usr/bin/google-chrome` |
| Publication | Postiz cloud 29 $/mois (apps approuvées) ou auto-hébergé gratuit (TikTok/YouTube privés sans audit) | `npm i -g postiz && postiz auth:login` |
| Tendances YouTube Cameroun | gratuit | `YOUTUBE_API_KEY=…` |
| Tendances TikTok Creative Center | offre gratuite Apify | `APIFY_TOKEN=…` |
| Démon permanent | gratuit | `npm i -g pm2 && pm2 start ecosystem.config.cjs && pm2 save` |

## Valider une vidéo

Le message « Vidéo prête » se termine par une référence, par exemple `#5f8a`. Pour publier, réponds `OUI #5f8a` (ou réponds en citant le message de la vidéo). « ok », « oui ? » ou « je regarde » ne publient rien. `NON #5f8a` jette, `REFAIS #5f8a` en fait une autre, `PRO #5f8a` donne le coût de la version Higgsfield.

Si WhatsApp ne transmet pas ta réponse (bibliothèque non officielle), publie depuis le terminal : `septim publier 5f8a` (ou le Studio, ou `/septim-viral:publier 5f8a`). C'est le même registre que le démon : une vidéo n'est jamais publiée deux fois.

WSL ne lance pas cron sans systemd : le démon utilise `node-cron`, pm2 le garde en vie. Pour le relancer au démarrage de Windows : Planificateur de tâches → `wsl -e bash -lc "cd ~/septim && pm2 resurrect"`.

## MCP optionnels (usage interactif dans Claude Code)

Postiz couvre déjà la publication. Ces serveurs servent si tu veux piloter une plateforme directement depuis Claude :

| MCP | Pour | Installation |
| --- | --- | --- |
| Apify (officiel) | tendances TikTok à la demande | `claude mcp add apify -e APIFY_TOKEN=… -- npx -y @apify/actors-mcp-server` |
| WhatsApp (lharries/whatsapp-mcp, non officiel) | lire/écrire WhatsApp depuis Claude | Go 1.22 + uv, voir le README du dépôt |
| YouTube Uploader (anwerj/youtube-uploader-mcp) | upload YouTube direct | script d'installation du dépôt |
| Meta (oliverames/meta-mcp-server) | Facebook / Instagram / Threads | bundle MCPB du dépôt |

N'existent pas : `@modelcontextprotocol/server-facebook`, `@modelcontextprotocol/server-youtube` ; le TikTok MCP le plus étoilé lit seulement, il ne publie pas.

## Sécurité

- `npm audit` signale `extract-zip` (via whatsapp-web.js → puppeteer) : aucune version corrigée n'existe. Il ne sert qu'au téléchargement du Chromium de puppeteer ; avec `PUPPETEER_SKIP_DOWNLOAD=1` et `WHATSAPP_CHROME_PATH` (Google Chrome installé), ce code ne s'exécute jamais. `basic-ftp` est forcé en version corrigée (`overrides` du package.json).
- WhatsApp passe par une bibliothèque non officielle : un seul destinataire (toi), faible volume. Pour un usage pro à grande échelle, l'API WhatsApp Cloud officielle de Meta est la voie sûre.
