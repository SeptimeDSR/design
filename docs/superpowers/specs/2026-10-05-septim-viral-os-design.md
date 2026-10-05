# SEPTIM-VIRAL-OS + site « personne ne veut partir » — spec

Date : 2026-10-05 · Statut : approuvé par délégation (« décide tout pour moi, prends les meilleures décisions »).

## 1. Intention

| Ce que l'utilisateur a demandé | Ce que ça veut dire concrètement |
| --- | --- |
| Une usine à vidéos virales qui tourne chez lui (WSL, Yaoundé) | Un démon local qui, toutes les 6 h, trouve un sujet tendance, écrit un hook H.E.A.T, génère la voix, rend un MP4 9:16 et le lui envoie sur WhatsApp |
| « Je dis OUI et ça part partout » | Publication TikTok, YouTube, Facebook, Instagram après une réponse WhatsApp, jamais avant |
| « Je ne veux pas coder, assemble des outils existants » | Chaque brique est un outil existant (Remotion, Piper, Kokoro, Ollama, whatsapp-web.js, Postiz). Le code ne fait que les relier |
| Deux versions comme d'hab | FREE par défaut (0 $), PRO (Higgsfield) seulement sur confirmation |
| `/septim-viral:viral "je veux une histoire sur…"` | Plugin `septim-viral`, skill `viral`, dans le marketplace `septim` |
| 3 templates Remotion (storytelling, maths, film) | Compositions 1080×1920 prêtes à rendre en gratuit |
| Un site qui donne envie, que personne ne veut quitter | Refonte de la démo selon la science de la rétention, en dogfoodant `septim-design` |
| Tester les skills avec des sous-agents | Scénarios RED/GREEN sur `septim-design` et `septim-viral` |
| Plus jamais « commande introuvable » | Les plugins doivent se charger dans toute session sur ce repo, et le livrable ne doit pas dépendre d'un push GitHub qui échoue |
| Auto-amélioration | Le système apprend de ses propres résultats (analytics → choix des prochains hooks/templates) |

Critères de succès : un MP4 9:16 sort de bout en bout sans aucune clé ni crédit ; aucune publication sans « OUI » ; tests automatisés verts ; site vérifié dans un navigateur (desktop + mobile) ; plugins validés en `--strict` et chargés.

## 2. Ce qui n'existe pas dans le prompt reçu, et le remplacement retenu

| Demandé | Vérifié (npm, GitHub, doc) | Décision |
| --- | --- | --- |
| `@modelcontextprotocol/server-facebook` | 404 npm | Postiz (publie FB + IG) |
| `@modelcontextprotocol/server-youtube` | 404 npm | Postiz (publie YouTube) |
| « TikTok MCP le plus étoilé » | Seym0n/tiktok-mcp (159 ⭐) lit seulement, ne publie pas | Postiz pour publier, Apify pour les tendances |
| « MCP WhatsApp officiel » | Il n'existe pas de MCP WhatsApp officiel. lharries/whatsapp-mcp = non officiel (Go + Python) | whatsapp-web.js dans le démon (non officiel, usage perso : on s'écrit à soi-même) |
| Kokoro pour tout | kokoro-js = voix anglaises seulement ; le français Kokoro (ff_siwis) n'existe qu'en Python | Piper (voix FR, locale, gratuite) pour le français, Kokoro pour l'anglais |
| « Son trending scrappé et utilisé » | Aucune API ne permet d'attacher un son de la bibliothèque TikTok à un upload | Le démon remonte le son tendance dans le message WhatsApp ; on l'ajoute dans l'app au moment de poster |
| « Publie automatiquement partout » | TikTok : app non auditée = vidéos privées. YouTube : projet API non audité = vidéos privées forcées | Voir §4.6 : 3 modes de publication honnêtes |
| X trending sounds | X n'a pas de « sons » et son API est payante | Retiré. Sources : YouTube Trending, Google Trends, TikTok Creative Center (Apify) |
| Cron système | WSL ne lance pas cron sans systemd | `node-cron` dans un démon géré par pm2 |

## 3. Approches envisagées

1. **Tout en MCP piloté par Claude en tâche planifiée** (`claude -p` toutes les 6 h). Rejeté : coûte des tokens à chaque cycle, dépend d'une session, fragile.
2. **Démon Node local déterministe + MCP/skill pour l'interactif** (retenu). Le démon fait le travail répétitif sans IA payante ; le skill `/septim-viral:viral` pilote le même moteur à la demande, avec Claude pour l'écriture.
3. **SaaS tout-en-un** (Blotato, Postiz cloud seul). Rejeté comme socle : payant et ne rend pas les vidéos Remotion. Postiz est gardé comme brique de publication.

## 4. Architecture

```
src/viral-engine/
  viral-checklist.json      règles virales (données, pas du code)
  config.ts                 config + env (langue, régions, plateformes, mode de publication)
  heat.ts                   prompt H.E.A.T, parsing, hooks de secours, linter de hook
  story.ts                  structure du script : hook → milieu de l'histoire → beats de 3 s → payoff ≥ 80 % → CTA « garde ça »
  captions.ts               timing mot à mot + pages de 1 à 3 mots
  bandit.ts                 Thompson sampling (template × formule de hook × voix)
  approval.ts               lecture des réponses WhatsApp (OUI / NON / REFAIS / PRO)
  llm.ts                    Ollama (qwen2.5) avec repli déterministe
  tts.ts                    Piper (FR) / Kokoro (EN) / silencieux (tests)
  ambient.ts                lit lo-fi généré par code (WAV), zéro droit d'auteur
  render.ts                 @remotion/bundler + @remotion/renderer → MP4 9:16
  trends.ts                 YouTube mostPopular, Google Trends RSS, Apify TikTok Creative Center
  notify.ts                 WhatsApp (whatsapp-web.js) ou console
  publish.ts                Postiz CLI ou mode manuel
  store.ts                  état local .septim-viral/ (jobs, bandit, leçons)
  pipeline.ts               un job de bout en bout
  daemon.ts                 cron 6 h + écoute WhatsApp + analytics quotidiennes
  cli.ts                    `npm run viral -- "je veux une histoire sur…"`
src/remotion/viral/         ViralStory, ViralMaths, ViralFilm + briques communes
```

### 4.1 Le cerveau viral (règles codées)
- **Hook ≤ 3 s** : durée parlée estimée ≤ 3 s à 1,1× (≈ 9 mots en français), tutoiement, question ou boucle ouverte, aucun mot de la réponse.
- **H.E.A.T** : Hit emotion, curiosity gap (on commence au milieu), tension/risque, transition rapide.
- **Pattern interrupt** : chaque beat ≤ 3,5 s ; le template change d'angle, d'échelle, de couleur ou de son à chaque beat.
- **Variable reward** : le payoff commence à ≥ 80 % de la durée ; une micro-récompense aléatoire au milieu.
- **CTA sauvegarde** à la fin : « Garde ça, tu vas en avoir besoin demain ».
- Le linter refuse un script qui viole ces règles ; le pipeline régénère (max 3 essais) puis prend le repli.

### 4.2 Voix (FREE)
Piper `fr_FR-tom-medium` (voix grave), vitesse 1,1× (`length_scale` 0,91). Kokoro `am_michael` pour l'anglais. Sans moteur installé : piste silencieuse + avertissement (le rendu ne casse jamais).

### 4.3 Son
Lit lo-fi généré par code (accords lents, filtre, bruit de vinyle), à −22 dB sous la voix. Le vrai son tendance est ajouté dans l'app TikTok/Reels (seul moyen d'entrer dans la boucle du son).

### 4.4 Templates Remotion 9:16
- **ViralStory** : texte cinétique plein écran, sous-titres mot à mot, zoom/rotation à chaque beat, barre de progression (effet Zeigarnik).
- **ViralMaths** : une équation ou un chiffre qui se construit, beats = étapes, révélation finale.
- **ViralFilm** : bandes cinémascope, grain, travelling par parallaxe, carton de chapitre à chaque beat.
- PRO : chaque template accepte des plans B-roll générés (Higgsfield Soul / Seedance) à la place des fonds procéduraux, avec `// BESOIN CREDIT`.

### 4.5 Boucle autonome
1. Cron 6 h → tendances (sources gratuites d'abord).
2. Le bandit choisit template + formule de hook + voix.
3. Ollama écrit le hook H.E.A.T + script (repli si Ollama absent).
4. Linter → TTS → captions → rendu MP4.
5. WhatsApp : la vidéo elle-même (aperçu sans lien public), légende, hashtags, son tendance conseillé, « Réponds OUI pour publier ».
6. OUI → publication ; NON → archivé ; REFAIS → nouveau job sur le même sujet.
7. +48 h : analytics Postiz → récompense du bandit → la boucle s'améliore toute seule.

### 4.6 Publication : trois modes honnêtes
| Mode | Coût | Ce qui se passe vraiment |
| --- | --- | --- |
| `manual` (défaut FREE) | 0 $ | La vidéo arrive sur WhatsApp, prête. On la poste depuis le téléphone en ajoutant le son tendance. Visible publiquement tout de suite |
| `postiz-cloud` (PRO) | 29 $/mois (Standard) | Les apps de Postiz sont approuvées : publication publique automatique sur TikTok, YouTube, FB, IG + analytics pour l'auto-amélioration |
| `postiz-self` (FREE technique) | 0 $ + serveur | Postiz auto-hébergé avec ses propres apps développeur : TikTok/YouTube en privé tant que les audits ne sont pas passés |

### 4.7 Garde-fous
- Jamais de publication ni de dépense de crédits sans réponse explicite.
- Le démon ne fait que du FREE ; le PRO passe par le skill interactif avec estimation affichée.
- WhatsApp non officiel : un seul destinataire (soi-même), faible volume, pour limiter le risque de bannissement.
- Rien de secret dans le repo : `.env` ignoré, `.septim-viral/` ignoré.

## 5. Site : « personne ne veut partir »

Principes appliqués, chacun avec sa version FREE :
| Principe | Implémentation |
| --- | --- |
| Clarté en 0,5 s | Le hero dit quoi, pour qui, et l'action, sans scroller |
| Boucle ouverte (Zeigarnik) | Promesse en haut (« à la fin, tu sauras pourquoi 71 % partent en 3 s ») payée à ≥ 80 % de la page ; HUD de chapitres « 3/7 » |
| Scrollytelling | Chapitres épinglés GSAP, chaque scroll révèle quelque chose |
| Pattern interrupt | Chaque chapitre change de rythme visuel (échelle, couleur, sens, mouvement) |
| Récompense variable | Des « secrets » apparaissent à des positions de scroll tirées au hasard |
| Son | Nappe ambiante générée par Web Audio, **opt-in** (les navigateurs bloquent l'autoplay), petit tic à chaque chapitre |
| Pas de stopping cue | Pas de footer de fin : un fil infini de secrets se recharge ; les mentions légales restent accessibles dans le menu |
| Démo vivante | Le lecteur Remotion montre un vrai template 9:16 de l'usine |
| Accessibilité | `prefers-reduced-motion` respecté, contraste AA, contenu lisible sans JS |

## 6. Robustesse (« plus jamais commande introuvable »)
- Cause réelle des erreurs vues : le repo GitHub est vide (pushs refusés, 403 côté app GitHub). Une autre session ne voit donc rien.
- Livrable indépendant de GitHub : `git bundle` + archive du plugin envoyés en fichiers.
- Hook `SessionStart` du projet : dans une session cloud (`CLAUDE_CODE_REMOTE=true`), installe les plugins `septim-design` et `septim-viral` depuis le repo cloné. Idempotent, silencieux.
- Projet : `extraKnownMarketplaces` + `enabledPlugins` pour les sessions locales.

## 7. Tests
- vitest pour toute la logique pure (checklist, linter de hook, structure de script, captions, bandit, réponses WhatsApp, choix de mode de publication).
- Rendu réel d'un MP4 par template dans le conteneur, avec voix silencieuse.
- Site : typecheck, lint, build, navigateur 1440 px et 390 px, 0 erreur console.
- Skills : scénarios sous-agents RED (sans skill) / GREEN (avec skill), corrections jusqu'à conformité.

## 8. Hors périmètre (YAGNI)
Pas d'app mobile, pas de dashboard web pour l'usine (WhatsApp est l'interface), pas de montage de vrais rushs vidéo, pas de multi-utilisateur.
