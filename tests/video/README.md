# Audit image par image des templates

```bash
npx tsx tests/video/stills.ts /tmp/planches .septim-viral/jobs/<id>/job.json            # 3 templates, fonds procéduraux
npx tsx tests/video/stills.ts /tmp/planches .septim-viral/jobs/<id>/job.json story clips/a.mp4,clips/b.mp4   # avec B-roll (chemins sous public/)
```

Chaque template donne une planche (`<template>-sheet.png`) : le hook à 0 ms et à 400 ms, puis chaque segment 450 ms après son début. À relire avant de livrer : hook lisible en entier dès la première image, rien sous les boutons de l'app, aucun mot coupé ou collé, réponse lisible sur fond clair comme sur un vrai plan.
