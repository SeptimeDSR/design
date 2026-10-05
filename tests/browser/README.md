# Tests navigateur du site (Playwright)

Ils vérifient ce que les tests unitaires ne voient pas : rétention, accessibilité, mouvement réduit, sans JavaScript.

```bash
npm run build && npx next start -p 3123 &      # le site en production
export PW=$(npm root -g)/playwright            # ou : npm i -D playwright
node tests/browser/site-test.cjs     # 1440 / 390 / mouvement réduit : 0 erreur, HUD, son opt-in, fil infini
node tests/browser/a11y-test.cjs     # sans JS + mouvement réduit : tout doit valoir true, pauseButtons > 0
node tests/browser/pause-test.cjs    # bouton pause, pause respectée au retour
node tests/browser/overflow-test.cjs # aucun titre de carte ne déborde (1440, 1024, 768, 390)
node tests/browser/feed-test.cjs     # le fil infini grandit
node tests/browser/secret-test.cjs   # récompenses variables (moyenne ≈ 2,5 secrets par visite)
```

Variables : `SITE_URL` (défaut `http://localhost:3123`), `SP` (dossier des captures, défaut : dossier temporaire).
Dans une session cloud Claude Code, Chromium est déjà là : `PW=$(npm root -g)/playwright`.
Relancer le serveur après un build : `for p in $(pgrep -f '^next-server'); do kill $p; done; npx next start -p 3123 &`
