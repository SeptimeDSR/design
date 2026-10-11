#!/bin/sh
# Faux python pour les tests : « -c import piper » réussit, « -m piper … -f out.wav » écrit un WAV, le reste lance node (faux Chatterbox).
DIR=$(dirname "$0")
if [ "$1" = "-c" ]; then exit 0; fi
if [ "$1" = "-m" ]; then exec node "$DIR/fake-piper.mjs" "$@"; fi
exec node "$@"
