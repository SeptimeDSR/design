import type { Genre } from "../duration";
import type { Mood } from "./types";

// Ce que chaque genre demande à l'écrivain : un ton, un moteur de tension, une façon de finir.
export const GENRE_BRIEF: Record<Genre, string> = {
  drame: "un drame humain, des choix qui coûtent cher, des silences qui disent plus que les mots, des personnages qui changent",
  thriller: "un thriller : un danger précis qui se rapproche, des fausses pistes, un retournement au milieu et un autre à la fin",
  mystere: "un mystère : une question posée dès la première scène, des indices glissés un à un, une vérité que le spectateur peut deviner juste avant qu'elle soit dite",
  horreur: "un récit d'horreur : l'angoisse monte lentement, on suggère plus qu'on ne montre, le calme est un piège",
  romance: "une histoire d'amour : deux personnes que tout sépare, des gestes plus que des déclarations, un obstacle vrai, une fin qui émeut",
  comedie: "une comédie : des situations qui s'emballent, des répliques drôles, du cœur sous les rires",
  aventure: "une aventure : un voyage, un but clair, des obstacles de plus en plus durs, de l'émerveillement",
  conte: "un conte : un monde où le merveilleux est normal, une morale qui se découvre sans être récitée, une langue simple et imagée",
  "histoire-vraie": "le récit d'une histoire vraie racontée comme un film : faits précis, tension réelle, jamais d'invention présentée comme un fait",
  documentaire: "un documentaire narré : un fil conducteur, des faits vérifiables, des anecdotes qui surprennent, un commentaire clair",
};

export const MOOD_MUSIC: Record<Mood, string> = {
  calme: "calm cinematic piano and soft strings, warm, intimate, slow tempo, instrumental",
  tension: "tense cinematic underscore, low drones, pulsing strings, suspense, instrumental",
  tristesse: "melancholic solo cello and piano, sad, emotional, slow, instrumental",
  joie: "warm uplifting acoustic guitar and light percussion, hopeful, instrumental",
  mystere: "mysterious ambient score, soft synth pads, distant bells, suspenseful, instrumental",
  action: "driving cinematic percussion and strings, urgent, fast tempo, instrumental",
};
