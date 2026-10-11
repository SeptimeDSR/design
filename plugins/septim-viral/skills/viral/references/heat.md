# Format du script et règles H.E.A.T

```json
{
  "topic": "la tontine",
  "hook": "Et si ta tontine te faisait perdre de l'argent ?",
  "beats": [
    { "text": "Dix personnes, dix mille chacun, chaque mois.", "emphasis": "dix", "visual": "ten people sitting in a circle counting banknotes, warm light" },
    { "text": "Le premier reçoit tout, tout de suite.", "emphasis": "premier" }
  ],
  "payoff": "Le dernier perd environ cinq pour cent.",
  "caption": "Ta tontine, vraiment gagnante ?",
  "hashtags": ["#tontine", "#argent"]
}
```

Le CTA « Garde ça, tu vas en avoir besoin demain. » est ajouté par le moteur.

`visual` (optionnel, par beat) décrit le plan à montrer, en anglais et concrètement : il sert à chercher le B-roll gratuit (Pexels, Pixabay) ou à le générer en local (ComfyUI). Sans `visual`, la recherche se fait sur le sujet.

| Règle | Seuil (`viral-checklist.json`) |
| --- | --- |
| H — Hook | ≤ 3 s parlé (≈ 9 mots), tutoiement, finit par « ? » / « … » ou mot de curiosité |
| E — Curiosity gap | Le premier beat commence au milieu de l'histoire |
| A — Tension | Un beat montre ce que le viewer risque de perdre |
| T — Transition | Une idée par beat, chaque beat ≤ 3,5 s (≈ 8 mots) |
| Récompense variable | La réponse (payoff) commence à ≥ 80 % de la durée : il faut 8 à 12 beats |
| Durée | 20 à 60 s |
| `emphasis` | Le mot affiché en géant (story), empilé au tableau (maths) ; présent dans le texte du beat |

`--lint-only` donne la durée, le moment de la réponse et chaque règle violée.
