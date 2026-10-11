# Test navigateur du Studio

Vérifie le Studio dans un vrai Chromium : 0 erreur console, lecture vidéo, linter, publication en deux temps à la souris et au clavier, Échap, focus visible, fabrication, filtres, 390 px sans débordement, cibles tactiles, mouvement réduit.

```bash
SRC_JOB=.septim-viral/jobs/<id> bash tests/studio/run-studio-test.sh
```

- `SRC_JOB` : un job déjà rendu (`septim video "la tontine" --script …`). Il est copié deux fois dans un `VIRAL_HOME` temporaire : tes vraies vidéos ne bougent pas, la publication passe en mode manuel.
- Le Chromium de Playwright n'a pas de décodeur H.264 : le script fabrique une fois une copie VP9 dans le même conteneur MP4 (ffmpeg). Chrome, Edge, Safari et Firefox lisent le H.264 normal.
- Les rendus sont factices (3 s) pour tester la file et l'interface ; `REAL_RENDER=1` utilise Remotion.
- Captures : `studio-1440.png`, `studio-armed.png`, `studio-390.png` dans `OUT` (dossier temporaire par défaut).
