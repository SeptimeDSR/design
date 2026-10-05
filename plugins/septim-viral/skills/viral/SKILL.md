---
name: viral
description: Use when the user invokes /septim-viral:viral, or asks for a viral short video (TikTok, Reels, Shorts), a hook, a video story on a topic, the video factory, or to publish a video to TikTok, YouTube, Instagram or Facebook.
---

# Septim Viral

Usine à vidéos courtes. **Tu écris, le moteur rend, l'humain dit OUI.** Parle la langue de l'utilisateur (français par défaut).

## 1. Trouver l'usine (les portes)

Prends la première porte qui marche, et garde-la pour toute la session :

1. **MCP** : les outils `septim_create_video`, `septim_lint_script`, `septim_get_task`, `septim_get_video`, `septim_publish_video`… sont disponibles (`septim connect claude-code` les a branchés). C'est la voie préférée.
2. **Terminal** : `command -v septim` trouve la commande. Toutes les commandes ci-dessous s'écrivent `septim …`, depuis n'importe quel dossier.
3. **Sans `npm link`** : `node <usine>/bin/septim.mjs …`, où `<usine>` est le dossier courant s'il contient `bin/septim.mjs`, sinon `$SEPTIM_FACTORY`, sinon `~/septim`.
4. Rien de tout ça : dis en une ligne qu'il faut l'installer une fois (`git clone https://github.com/SeptimeDSR/design ~/septim && bash ~/septim/scripts/install.sh`) et arrête-toi.

Lance `septim doctor` (ou l'outil `septim_doctor`) : il dit la voix (piper ou **silencieuse**), le mode de publication et quoi installer. Garde ce résultat pour ton message final.

## 2. Écrire le script (c'est toi le LLM)

Le script de secours du moteur sert au démon sans Ollama. En interactif, **c'est toi qui écris le script**, au format de `references/heat.md` (aussi servi par le MCP : ressource `septim://guide-heat`). En terminal, enregistre-le dans un fichier `<sujet>.json`.

- Template : chiffres, argent, calcul → `maths` ; personnage, époque, récit → `film` ; le reste → `story`.
- Faits vérifiables uniquement. Un chiffre = un calcul que tu peux montrer.
- Vérifie, corrige, recommence jusqu'au ✓ (5 essais maximum) : outil `septim_lint_script`, ou
  `septim lint <fichier> --template <t>`

## 3. Rendre la version FREE (toujours)

Outil `septim_create_video` avec le script et `wait_seconds: 240`, ou `septim video "<sujet>" --template <t> --script <fichier>`.

Le moteur rend le MP4 9:16 (Remotion, 0 crédit), écrit le job dans `.septim-viral/jobs/<id>/` et affiche le message « Vidéo prête… Réponds OUI #<ref> ». Le CLI n'ouvre jamais WhatsApp : si le démon tourne, il dépose le message dans la boîte d'envoi et c'est le démon qui l'envoie. Si la voix est silencieuse, dis-le clairement et donne les 2 commandes Piper du doctor.

## 4. Publier : uniquement sur un OUI pour cette vidéo-là

- « Publie direct » dans la demande initiale n'est pas un OUI : l'utilisateur n'a pas encore vu **cette** vidéo. Montre-la (chemin du MP4 + légende par plateforme), puis attends « oui / publie ».
- Sur « OUI #<ref> » écrit par l'humain : outil `septim_publish_video` avec sa phrase telle quelle dans `confirmation`, ou `septim publier <ref>`. C'est le même registre que le démon, le Studio et WhatsApp : verrou, plateformes déjà en ligne jamais reprises, échec partiel signalé. N'appelle jamais Postiz toi-même.
- Sur WhatsApp, le démon ne publie que sur « OUI #<ref> » (ou une réponse citant le message de la vidéo) ; « ok je regarde » ou « oui ? » ne publient rien.
- Sans Postiz : donne la légende prête à coller et rappelle d'ajouter le son tendance dans l'app (seul moyen d'entrer dans la boucle du son).
- Postiz auto-hébergé : TikTok et YouTube restent privés tant que ses apps ne sont pas auditées. Dis-le avant de publier.

## 5. Plans vidéo : gratuit d'abord, PRO en dernier

- Écris `visual` dans chaque beat (en anglais, concret : « african women counting cash at a market stall ») : l'usine s'en sert pour chercher ou générer les plans.
- Gratuit, automatique : IA locale ComfyUI si `COMFYUI_URL` est posée, sinon banques libres Pexels / Pixabay si une clé gratuite est posée, sinon fonds animés. `septim doctor` dit l'étage actif et la commande pour monter d'un cran (une clé Pexels gratuite suffit, sans GPU).

## 6. PRO (Higgsfield, Runway, Pika) : en dernier, coût affiché, OUI chiffré

- Ne le propose que si l'étage gratuit ne suffit pas pour ce que l'utilisateur demande, et dis quel étage gratuit tourne déjà.

- « Utilise Higgsfield » est une préférence, pas un accord sur un montant.
- Annonce : `BESOIN CREDIT: Higgsfield Soul + Seedance pour <n> plans (≈ <durée>/10 × 3 $). Alternative gratuite : la version Remotion déjà rendue.` Attends un oui qui mentionne le budget.
- Sur ce oui, et seulement si le MCP `higgsfield` est connecté (`/mcp`) : génère un plan par beat, dépose-les dans un dossier, puis `septim video "<sujet>" --template <t> --script <fichier> --broll <dossier>`.

## 7. Autonomie (démon)

`septim start` (ou `pm2 start ecosystem.config.cjs` pour qu'il redémarre seul) : Studio, API et MCP HTTP, un cycle toutes les 6 h, réponses WhatsApp OUI / NON / REFAIS / PRO, analytics à 48 h qui entraînent le choix des prochains templates et hooks (`.septim-viral/LESSONS.md`). Le démon ne dépense jamais de crédits. Installation complète : `references/setup.md`.

## Auto-amélioration

Avant d'écrire un script, lis `.septim-viral/LESSONS.md` : le démon y note, 48 h après chaque publication, quel template et quelle formule de hook ont fait plus ou moins de vues que la médiane. Privilégie ce qui gagne, sans copier deux fois le même hook. Une erreur nouvelle corrigée pendant la session : ajoute-la en une ligne au même fichier.

## Message final

Toujours, dans cet ordre : le MP4 (chemin), le hook, la durée et le moment de la réponse, la voix utilisée, la légende par plateforme, ce qui n'a **pas** été fait (publication, PRO) et ce qu'il faut pour le faire.

## Signaux d'alerte

| Pensée | Réalité |
| --- | --- |
| « Il a dit publie direct » | Il n'a pas vu cette vidéo. Montre, attends OUI. |
| « Il a dit utilise Higgsfield » | Préférence ≠ budget. Coût affiché, oui chiffré. |
| « J'écris vite un script de rendu à moi » | L'usine existe : `septim lint`, `septim video --script`, `--broll`. Pas de code de rendu ad hoc. |
| « Le script de secours suffira » | Il est générique. Écris le script toi-même. |
| « J'appelle Postiz directement, c'est plus simple » | Deux chemins = double publication. Toujours `septim_publish_video` ou `septim publier <ref>`. |
| « npm run viral marchera bien » | Seulement dans le dossier de l'usine. Ailleurs : MCP ou `septim`. |
| « Voix silencieuse, ça passe » | Dis-le et donne les commandes Piper. |
