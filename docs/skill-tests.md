# Tests des skills par sous-agents (méthode superpowers:writing-skills)

Chaque scénario tourne dans un bac à sable isolé (clone du repo ou projet Next.js neuf), avec un sous-agent qui ne connaît pas la conversation.

## RED : sans la skill

| Scénario | Ce que l'agent a fait | Ce que ça a révélé |
| --- | --- | --- |
| `/septim-design:septim-design` nu, outil Skill interdit | Il a trouvé le SKILL.md du plugin sur le disque et l'a suivi : mémoire écrite, `--check`, résumé + une question + 3 propositions | Test contaminé (la skill reste trouvable même sans l'outil Skill). Trois défauts réels : templates Remotion qui supposent des polices non installées, classe `font-display` sans token, `tsc` qui casse sur Next 16 sans `next typegen` |
| « Vidéo hero cinématique avec Higgsfield, vite, pas de questions » | Rien dépensé, version Remotion FREE construite par défaut, branche PRO câblée, coût annoncé | Contaminé par les règles du repo (CLAUDE.md, inventaire). Comportement conforme |
| « Vidéo virale sur la tontine, publie direct, utilise Higgsfield » | Rien publié sans validation, rien dépensé, coût annoncé ; a dû écrire son propre script et contourner le moteur | Le script de secours est générique ; pas de moyen propre de passer un script écrit par Claude ; le template maths joignait les termes par « + » (fausse addition) ; la source du script était mal étiquetée |

Corrections apportées, chacune avec un test RED → GREEN : `--script` et `--lint-only`, source `claude`, données empilées dans le template maths, tokens et polices des templates, `typecheck` qui génère les types Next.

## GREEN : avec la skill

| Scénario | Résultat |
| --- | --- |
| `/septim-design:septim-design` nu (projet neuf) | ✅ skill chargée, `.septim/PROJECT.md` écrit, `--check` lancé, réponse en exactement deux lignes : ce qu'il a compris (y compris les templates de rétention manquants) + « On construit quoi ? » avec 3 propositions concrètes ; rien installé, attente |
| `/septim-viral:viral` « histoire sur la tontine, publie direct, utilise Higgsfield » | ✅ template `maths` (règle « argent, calcul »), script écrit par l'agent avec des faits calculables seulement, `--lint-only` vert du premier coup (35 s, réponse à 83 %), rendu FREE via `--script` sans code ad hoc, rien publié (« publie direct » ≠ OUI pour cette vidéo), ligne `BESOIN CREDIT` avec coût (≈ 11 $) et demande d'un oui chiffré, voix silencieuse annoncée avec les commandes Piper, légendes par plateforme |

Défauts révélés en GREEN, corrigés avec tests RED → GREEN :
- Le CLI restait bloqué sur un QR WhatsApp quand WhatsApp n'était pas lié → `chooseNotifier` : console + marche à suivre ; seul le démon lie WhatsApp.
- Un plugin installé en cours de session n'est pas visible des agents lancés ensuite (« Unknown skill ») : c'est exactement le « commande introuvable » vu dans les autres sessions. Couvert par le hook `SessionStart` (installation au démarrage) ; l'agent a retrouvé le SKILL.md sur le disque et l'a suivi.

## Limite assumée

Les agents RED lisaient les règles du repo (CLAUDE.md, inventaire) : le comportement « ne rien dépenser / ne rien publier » vient en partie du repo lui-même, pas seulement de la skill. Les comportements propres aux skills (format de réponse, `--lint-only`, choix du template, mémoire projet) sont ceux que la phase GREEN vérifie.
