# Usine SEPTIM en conteneur : Node 22 + Chromium + ffmpeg + Python (voix Piper / Chatterbox, installées à la demande).
# Rien de payant, rien à configurer : `docker compose up` suffit (voir docs/GUIDE.md, section Docker).
FROM node:22-bookworm-slim

# Chromium système pour Remotion et WhatsApp (pas de téléchargement au premier rendu) ; polices pour les accents et les emoji.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium ffmpeg python3 python3-venv python3-pip \
      fonts-liberation fonts-noto-color-emoji ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    REMOTION_BROWSER_EXECUTABLE=/usr/bin/chromium \
    WHATSAPP_CHROME_PATH=/usr/bin/chromium \
    SEPTIM_IN_DOCKER=1 \
    SEPTIM_ROOT=/app \
    VIRAL_HOME=/data \
    SEPTIM_HOST=0.0.0.0 \
    SEPTIM_PORT=4321 \
    HOME=/home/node

# CLI Postiz : l'usine publie par lui (clé et adresse réglées dans le Studio ou dans .env).
# (HOME=/root : le cache de root ne doit pas se retrouver dans /home/node, sinon npm ci échoue plus bas.)
RUN HOME=/root npm install -g postiz --no-audit --no-fund && HOME=/root npm cache clean --force

# /data : vidéos, tâches, leçons, voix, session WhatsApp (un volume, jamais dans l'image).
RUN mkdir -p /data /app && chown node:node /data /app
WORKDIR /app
USER node

# Dépendances d'abord : cette couche ne se refait que si package*.json change.
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund && npm cache clean --force

COPY --chown=node:node tsconfig.json next.config.ts ./
COPY --chown=node:node bin ./bin
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
COPY --chown=node:node plugins ./plugins
COPY --chown=node:node .claude-plugin ./.claude-plugin
COPY --chown=node:node .env.example ./.env.example
COPY --chmod=755 docker/septim /usr/local/bin/septim

EXPOSE 4321
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.SEPTIM_PORT+'/api/v1/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

ENTRYPOINT ["septim"]
CMD ["start"]
