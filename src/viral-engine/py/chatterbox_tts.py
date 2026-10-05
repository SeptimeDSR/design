"""Voix HD gratuite : Chatterbox Multilingual (Resemble AI, licence MIT), 23 langues dont le français.

Un seul processus pour toute la vidéo : le modèle se charge une fois, puis chaque ligne JSON
{"text", "lang", "out", "voice"?} sur l'entrée donne un WAV et une ligne {"ok": true} sur la sortie.
Installation : septim setup --voix-hd (dans le venv de l'usine). GPU conseillé ; marche aussi sur CPU, plus lentement.
VIRAL_CHATTERBOX_VOICE = un WAV de 10 s de ta voix pour la cloner (seulement ta voix, ou avec l'accord de la personne).
"""
import json
import os
import sys

import torch
import torchaudio as ta
from chatterbox.mtl_tts import ChatterboxMultilingualTTS


def main() -> None:
    device = "cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu")
    model = ChatterboxMultilingualTTS.from_pretrained(device=device)
    print(json.dumps({"ready": True, "device": device}), flush=True)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        job = json.loads(line)
        try:
            voice = job.get("voice") or os.environ.get("VIRAL_CHATTERBOX_VOICE") or None
            wav = model.generate(job["text"], language_id=job.get("lang", "fr"), audio_prompt_path=voice)
            ta.save(job["out"], wav, model.sr)
            print(json.dumps({"ok": True}), flush=True)
        except Exception as error:  # une phrase ratée ne tue pas le worker
            print(json.dumps({"ok": False, "error": str(error)}), flush=True)


if __name__ == "__main__":
    main()
