#!/usr/bin/env bash
# Lance un serveur neuf (VIRAL_HOME temporaire), joue le test navigateur, arrête le serveur.
set -u
SP=$(cd "$(dirname "$0")" && pwd)
OUT_DIR=${OUT:-$(mktemp -d)}
SRC_JOB="$(cd "${SRC_JOB:?SRC_JOB=dossier d un job rendu, ex. .septim-viral/jobs/2e5b66e3}" && pwd)"; export SRC_JOB
# Chromium de Playwright ne décode pas H.264 : copie VP9 (même conteneur MP4) fabriquée une fois.
[ -f "$OUT_DIR/vp9.mp4" ] || ffmpeg -v error -y -i "$SRC_JOB/video.mp4" -vf scale=540:960 -c:v libvpx-vp9 -deadline realtime -cpu-used 8 -b:v 1M -c:a libopus "$OUT_DIR/vp9.mp4"
cd "$SP/../.."
# Groupe de processus à part : on l'arrête entier à la fin, sans viser d'autres processus par leur nom.
VP9="$OUT_DIR/vp9.mp4" PORT=4399 setsid npx tsx "$SP/start-studio.ts" > "$OUT_DIR/studio-server.log" 2>&1 &
SERVER=$!
for _ in $(seq 1 30); do curl -s -m 1 http://127.0.0.1:4399/api/v1/health >/dev/null && break; sleep 0.5; done
OUT="$OUT_DIR" node "$SP/studio-test.cjs"
RC=$?
kill -- -"$SERVER" 2>/dev/null
exit $RC
