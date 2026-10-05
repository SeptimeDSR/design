#!/usr/bin/env bash
# Installe l'usine SEPTIM en une commande (Linux, WSL, macOS). Idempotent : relance-le quand tu veux.
#   bash scripts/install.sh                  npm, commande septim, .env, Claude Code (s'il est là), diagnostic
#   bash scripts/install.sh --voix           + voix française gratuite (Piper)
#   bash scripts/install.sh --voix-hd        + voix HD gratuite (Chatterbox, MIT ; GPU conseillé)
#   bash scripts/install.sh --sans-claude    sans toucher à la configuration de Claude Code
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SETUP_ARGS=()
for arg in "$@"; do
  case "$arg" in
    --voix) SETUP_ARGS+=(--voix) ;;
    --voix-hd) SETUP_ARGS+=(--voix-hd) ;;
    --sans-claude) SETUP_ARGS+=(--sans-claude) ;;
    -h | --help)
      sed -n '2,5p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Option inconnue : $arg (options : --voix, --voix-hd, --sans-claude)" >&2
      exit 1
      ;;
  esac
done

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() {
  printf '\n✗ %s\n' "$*" >&2
  exit 1
}

say "1/4 Node.js"
command -v node >/dev/null 2>&1 || fail "Node.js est absent. Installe Node 22 (https://nodejs.org ou nvm : nvm install 22), puis relance."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 22 ] || fail "Node $(node -v) est trop ancien : il faut Node 22 ou plus (nvm install 22)."
echo "✓ Node $(node -v)"

say "2/4 Dépendances (Remotion, moteur, MCP, WhatsApp)"
cd "$ROOT"
# Pas de Chromium de puppeteer : extract-zip n'a pas de correctif (docs/GUIDE.md, Sécurité).
PUPPETEER_SKIP_DOWNLOAD=1 npm install --no-audit --no-fund

say "3/4 Commande septim"
SEPTIM=(septim)
if npm link >/dev/null 2>&1 && command -v septim >/dev/null 2>&1; then
  echo "✓ septim est disponible partout : tape « septim » depuis n'importe quel dossier."
else
  SEPTIM=(node "$ROOT/bin/septim.mjs")
  echo "• npm link a besoin des droits ici (Node installé sans nvm). Deux solutions :"
  echo "    sudo npm link            (une fois, dans $ROOT)"
  echo "    alias septim='node $ROOT/bin/septim.mjs'   (à ajouter à ~/.bashrc ou ~/.zshrc)"
  echo "  En attendant, ce script utilise : node $ROOT/bin/septim.mjs"
fi

say "4/4 Réglages, Claude Code et diagnostic"
"${SEPTIM[@]}" setup ${SETUP_ARGS[@]+"${SETUP_ARGS[@]}"}
