// pm2 start ecosystem.config.cjs  → l'usine tourne en fond et redémarre toute seule.
module.exports = {
  apps: [
    {
      name: "septim-viral",
      script: "node_modules/.bin/tsx",
      args: "src/viral-engine/daemon.ts",
      env_file: ".env",
      autorestart: true,
      max_restarts: 20,
      restart_delay: 10000,
    },
  ],
};
