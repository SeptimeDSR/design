# Installer l'usine chez toi (WSL Ubuntu)

```bash
git clone https://github.com/SeptimeDSR/design ~/septim && cd ~/septim
PUPPETEER_SKIP_DOWNLOAD=1 npm install   # Remotion, moteur, WhatsApp… (sans le Chromium de puppeteer : voir sécurité)
cp .env.example .env            # tout est optionnel, l'usine tourne sans rien
npm run viral:doctor            # dit ce qui manque, avec les commandes
```

| Brique | Coût | Commande |
| --- | --- | --- |
| Voix française (Piper) | gratuit | `pip install piper-tts` puis `python3 -m piper.download_voices fr_FR-tom-medium --data-dir .septim-viral/voices` |
| Voix anglaise (Kokoro) | gratuit | `npm i kokoro-js` |
| Script automatique (Ollama + qwen2.5) | gratuit | `curl -fsSL https://ollama.com/install.sh \| sh` puis `ollama pull qwen2.5:7b` (`qwen2.5:3b` si peu de RAM) |
| WhatsApp | gratuit, non officiel (un seul destinataire, faible volume) | `npm run viral:daemon`, scanner le QR une fois |
| Vraies vidéos WhatsApp | gratuit | installer Google Chrome, `WHATSAPP_CHROME_PATH=/usr/bin/google-chrome` |
| Publication | Postiz cloud 29 $/mois (apps approuvées) ou auto-hébergé gratuit (TikTok/YouTube privés sans audit) | `npm i -g postiz && postiz auth:login` |
| Tendances YouTube Cameroun | gratuit | `YOUTUBE_API_KEY=…` |
| Tendances TikTok Creative Center | offre gratuite Apify | `APIFY_TOKEN=…` |
| Démon permanent | gratuit | `npm i -g pm2 && pm2 start ecosystem.config.cjs && pm2 save` |

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
