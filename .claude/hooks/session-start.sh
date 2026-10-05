#!/bin/bash
# Sessions cloud : dépendances installées + plugins Septim chargés depuis ce repo,
# pour que /septim-design:septim-design et /septim-viral:viral marchent dès le premier message.
set -uo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" || exit 0
warn() { echo "[septim] $*" >&2; }

npm install --no-audit --no-fund >/dev/null 2>&1 || warn "npm install a échoué (tests et rendus indisponibles)"

if command -v claude >/dev/null 2>&1; then
  claude plugin marketplace add "$PWD" >/dev/null 2>&1 || warn "marketplace septim non ajouté"
  for plugin in septim-design@septim septim-viral@septim; do
    claude plugin install "$plugin" --scope user >/dev/null 2>&1 || warn "installation de $plugin impossible"
  done
fi

# Rendus Remotion sans téléchargement : le Chrome headless préinstallé du conteneur.
shell=$(ls -d /opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell 2>/dev/null | head -1)
if [ -n "$shell" ] && [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export REMOTION_BROWSER_EXECUTABLE=$shell" >> "$CLAUDE_ENV_FILE"
fi

exit 0
