# Écrire un film pour l'usine SEPTIM

Un film dure de 1 minute à 4 heures. L'usine le tourne (voix, images qui bougent, musique, sous-titres, chapitres) ; **toi, tu écris l'histoire** quand tu veux mieux que le petit modèle local. Sans script, l'usine l'écrit toute seule avec Ollama.

## Le format (JSON)

```json
{
  "title": "La dette de Mireille",
  "logline": "Une mère de Douala reçoit une dette qu'elle n'a jamais contractée.",
  "genre": "drame",
  "characters": [
    { "name": "Mireille", "gender": "femme", "description": "42 ans, couturière, têtue" },
    { "name": "Paul", "gender": "homme", "description": "son frère, trop gentil" }
  ],
  "scenes": [
    {
      "title": "Le courrier",
      "location": "small tailor workshop at night",
      "mood": "tension",
      "shots": [
        { "narration": "Il pleuvait sur Douala depuis trois jours.", "visual": "rain on a city street at night" },
        { "narration": "Je n'ai jamais signé ce papier.", "speaker": "Mireille", "visual": "woman holding a letter, worried" }
      ]
    }
  ],
  "caption": "Une dette venue de nulle part.",
  "hashtags": ["#drame", "#douala"]
}
```

- `scenes[].shots[]` : un plan = une phrase ou deux (45 mots au plus), une voix, une image. `speaker` absent = le narrateur ; sinon le prénom exact d'un personnage de `characters` (sa voix change selon `gender` : femme ou homme).
- `visual` : ce qu'on VOIT, **en anglais**, 4 à 9 mots, concret et photographiable (un lieu, une personne, une action). Jamais de nom propre ni de texte à l'écran.
- `mood` : `calme`, `tension`, `tristesse`, `joie`, `mystere` ou `action` : choisit la musique et la lumière des images.
- `genre` : `drame`, `thriller`, `mystere`, `horreur`, `romance`, `comedie`, `aventure`, `conte`, `histoire-vraie`, `documentaire`.

## Combien écrire

La voix dit environ **2,6 mots par seconde** : 1 minute ≈ 160 mots, 10 minutes ≈ 1 600 mots, 1 heure ≈ 9 400 mots. Compte 10 à 14 plans par scène de 2 minutes. `septim lint film.json` (ou `septim_lint_script`) dit si le texte tient la durée visée.

## Ce qui retient

- La première scène commence au cœur de l'action, jamais par une présentation.
- Chaque scène se termine sur une tension, une question ou une révélation (sauf la dernière, qui résout et touche).
- Alterne narration et dialogues : un dialogue = des répliques courtes, au discours direct, dans `narration` avec `speaker`.
- Montre au lieu d'expliquer : un geste, un objet, un bruit.
- Un fil rouge (un objet, une phrase) qui revient trois fois.
