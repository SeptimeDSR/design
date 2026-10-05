---
description: Publie UNE vidéo de l'usine SEPTIM, désignée par sa référence (taper la commande vaut OUI #ref)
argument-hint: <ref>
---

L'utilisateur demande de publier la vidéo `$ARGUMENTS`. Taper cette commande avec une référence vaut sa confirmation « OUI #ref » pour cette vidéo-là, et seulement elle.

1. **Sans référence** (`$ARGUMENTS` vide, ou plusieurs références) : ne publie rien. Réponds : « Il faut la référence de la vidéo, par exemple `/septim-viral:publier 5f8a`. Les vidéos à valider : `/septim-viral:videos`. » Puis arrête-toi.
2. Trouve la commande : `septim` si `command -v septim` la trouve, sinon `node <usine>/bin/septim.mjs` (dossier courant s'il contient `bin/septim.mjs`, sinon `$SEPTIM_FACTORY`, sinon `~/septim`).
3. Montre d'abord ce qui va partir : `septim voir $ARGUMENTS` (hook, durée, légende). Si la référence est inconnue ou ambiguë, recopie le message de l'usine et arrête-toi : ne devine jamais la vidéo.
4. Publie : `septim publier $ARGUMENTS`. C'est le même cœur et le même registre que le Studio, le MCP et WhatsApp : verrou, jamais deux fois, plateformes déjà en ligne jamais reprises. N'appelle jamais Postiz toi-même.
5. Rapporte exactement ce que l'usine a répondu : publiée sur quelles plateformes, ou légende prête à coller (mode manuel, rappelle d'ajouter le son tendance dans l'app), ou échec partiel avec ce qui reste à faire.

Ne publie jamais une autre vidéo que `$ARGUMENTS`, et ne lance aucune option PRO à crédits.
