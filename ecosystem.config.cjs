// pm2 start ecosystem.config.cjs  → l'usine tourne en fond et redémarre toute seule.
module.exports = {
  apps: [
    {
      name: "septim-viral",
      script: "node_modules/.bin/tsx",
      args: "src/viral-engine/septim.ts start", // démon + WhatsApp + cycle + Studio, API et MCP HTTP
      cwd: __dirname, // le démon charge lui-même .env (pm2 n'a pas d'option env_file)
      autorestart: true,
      max_restarts: 20,
      restart_delay: 10000,
    },
  ],
};
