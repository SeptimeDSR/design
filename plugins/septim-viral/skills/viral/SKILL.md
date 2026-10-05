---
name: viral
description: Use when the user invokes /septim-viral:viral, or asks for a viral short video (TikTok, Reels, Shorts), a hook, a video story on a topic, the video factory, or to publish a video to TikTok, YouTube, Instagram or Facebook.
---

# Septim Viral

Usine à vidéos courtes. **Tu écris, le moteur rend, l'humain dit OUI.** Parle la langue de l'utilisateur (français par défaut).

## 1. Trouver l'usine

- Le dossier courant contient `src/viral-engine` : c'est l'usine.
- Sinon `$SEPTIM_FACTORY` pointe vers elle : travaille depuis ce dossier.
- Sinon : dis en une ligne qu'il faut l'installer une fois (`git clone https://github.com/SeptimeDSR/design ~/septim && cd ~/septim && npm install`, puis `export SEPTIM_FACTORY=~/septim`) et arrête-toi.

Lance `npm run viral:doctor` : il dit la voix (piper ou **silencieuse**), le mode de publication et quoi installer. Garde ce résultat pour ton message final.

## 2. Écrire le script (c'est toi le LLM)

Le script de secours du moteur sert au démon sans Ollama. En interactif, **c'est toi qui écris le script**, dans `.septim-viral/scripts/<sujet>.json`, au format de `references/heat.md`.

- Template : chiffres, argent, calcul → `maths` ; personnage, époque, récit → `film` ; le reste → `story`.
- Faits vérifiables uniquement. Un chiffre = un calcul que tu peux montrer.
- Vérifie, corrige, recommence jusqu'au ✓ (5 essais maximum) :
  `npm run viral -- "<sujet>" --template <t> --script <fichier> --lint-only`

## 3. Rendre la version FREE (toujours)

`npm run viral -- "<sujet>" --template <t> --script <fichier>`

Le moteur rend le MP4 9:16 (Remotion, 0 crédit), écrit le job dans `.septim-viral/jobs/<id>/` et envoie le message « Vidéo prête boss » (WhatsApp si lié, sinon console). Si la voix est silencieuse, dis-le clairement et donne les 2 commandes Piper du doctor.

## 4. Publier : uniquement sur un OUI pour cette vidéo-là

- « Publie direct » dans la demande initiale n'est pas un OUI : l'utilisateur n'a pas encore vu **cette** vidéo. Montre-la (chemin du MP4 + légende par plateforme), puis attends « oui / publie ».
- Sur OUI : le démon publie via Postiz ; en conversation, utilise le skill `postiz` (upload puis `posts:create`) avec les réglages de `publish-plan.ts`.
- Sans Postiz : donne la légende prête à coller et rappelle d'ajouter le son tendance dans l'app (seul moyen d'entrer dans la boucle du son).
- Postiz auto-hébergé : TikTok et YouTube restent privés tant que ses apps ne sont pas auditées. Dis-le avant de publier.

## 5. PRO (Higgsfield, Runway, Pika) : coût affiché, OUI chiffré

- « Utilise Higgsfield » est une préférence, pas un accord sur un montant.
- Annonce : `BESOIN CREDIT: Higgsfield Soul + Seedance pour <n> plans (≈ <durée>/10 × 3 $). Alternative gratuite : la version Remotion déjà rendue.` Attends un oui qui mentionne le budget.
- Sur ce oui, et seulement si le MCP `higgsfield` est connecté (`/mcp`) : génère un plan par beat, dépose-les dans un dossier, puis `npm run viral -- "<sujet>" --template <t> --script <fichier> --broll <dossier>`.

## 6. Autonomie (démon)

`pm2 start ecosystem.config.cjs` : un cycle toutes les 6 h, réponses WhatsApp OUI / NON / REFAIS / PRO, analytics à 48 h qui entraînent le choix des prochains templates et hooks (`.septim-viral/LESSONS.md`). Le démon ne dépense jamais de crédits. Installation complète : `references/setup.md`.

## Auto-amélioration

Avant d'écrire un script, lis `.septim-viral/LESSONS.md` : le démon y note, 48 h après chaque publication, quel template et quelle formule de hook ont fait plus ou moins de vues que la médiane. Privilégie ce qui gagne, sans copier deux fois le même hook. Une erreur nouvelle corrigée pendant la session : ajoute-la en une ligne au même fichier.

## Message final

Toujours, dans cet ordre : le MP4 (chemin), le hook, la durée et le moment de la réponse, la voix utilisée, la légende par plateforme, ce qui n'a **pas** été fait (publication, PRO) et ce qu'il faut pour le faire.

## Signaux d'alerte

| Pensée | Réalité |
| --- | --- |
| « Il a dit publie direct » | Il n'a pas vu cette vidéo. Montre, attends OUI. |
| « Il a dit utilise Higgsfield » | Préférence ≠ budget. Coût affiché, oui chiffré. |
| « J'écris vite un script de rendu à moi » | L'usine existe : `--script`, `--lint-only`, `--broll`. Pas de code de rendu ad hoc. |
| « Le script de secours suffira » | Il est générique. Écris le script toi-même. |
| « Voix silencieuse, ça passe » | Dis-le et donne les commandes Piper. |
