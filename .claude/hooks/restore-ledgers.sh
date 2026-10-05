#!/bin/bash
# Les registres superpowers (.superpowers/, ignoré par git) sont versionnés dans docs/handoff/.
# Sur un clone neuf (autre compte, autre machine), on les remet en place pour que executing-plans reprenne au bon endroit.
set -uo pipefail
cd "${1:-${CLAUDE_PROJECT_DIR:-$(pwd)}}" || exit 0
for ledger in docs/handoff/ledger-*.md; do
  [ -f "$ledger" ] || continue
  plan=$(head -1 "$ledger" | sed -n 's/^# SDD ledger — plan: //p')
  [ -n "$plan" ] || continue
  dir=".superpowers/sdd/$(basename "$plan" .md)"
  if [ ! -f "$dir/progress.md" ]; then
    mkdir -p "$dir"
    cp "$ledger" "$dir/progress.md"
    echo "$plan" > "$dir/plan-path"
    echo "[septim] registre restauré : $dir/progress.md" >&2
  fi
done
exit 0
