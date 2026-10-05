# Septim — site vitrine + usine SEPTIM-VIRAL-OS

## Identité
- Sujet / secteur : studio à Yaoundé qui fabrique des sites et des vidéos qui retiennent l'attention
- Public : marques, entrepreneurs et créateurs (Cameroun, Afrique francophone, international)
- Mission principale du site : faire ressentir la science de l'attention en la pratiquant, puis amener à écrire sur WhatsApp
- Ton : tutoiement, phrases courtes, concret, jamais vendeur

## Stack
- Framework / routeur : Next.js 16 (App Router), React 19
- Gestionnaire de paquets : npm
- Styles : Tailwind 4 (tokens dans `src/app/globals.css`)
- Stack Septim installée : oui (Lenis, GSAP, Motion, three/R3F, Remotion, viral-engine)

## Direction artistique
- Polices : Anybody Variable (titres, axe de largeur animé par la vitesse de scroll), Instrument Sans Variable (texte)
- Couleurs : nuit indigo #121640, indigo ndop #24307a, craie #e9ecf2, camwood #b4432b (actions, AA 4,7:1 avec la craie), raphia #e8c15a (récompenses seulement), brume #8f97c8 (texte secondaire)
- Mouvement : un seul geste fort (titres qui s'étirent avec le scroll), le reste discret ; reduced-motion respecté
- Références visuelles : tissu Ndop des Grassfields (indigo / blanc), téléphones 9:16

## Pages et sections
- / : hero (clarté + téléphone qui joue une vraie vidéo de l'usine) → 7 chapitres (3 secondes, le mot qui manque, le son, les interruptions, la récompense, l'usine, la réponse) → fil infini de secrets (pas de footer)

## FREE / PRO
| Effet | FREE en place | PRO prévu | Crédits estimés | Statut |
| --- | --- | --- | --- | --- |
| Vidéos des téléphones | Remotion Player (ViralStory/Maths/Film) | Plans Higgsfield dans `broll` | ≈ 3 $ / 10 s 720p | FREE en ligne |
| Son | Nappe Web Audio générée, opt-in | — | — | FREE en ligne |

## Décisions
- 2026-10-05 : abandon du noir + accent vermillon (tic de page générée) pour l'indigo Ndop ; plus de labels monospace ni de points médians.
