import type { Lang } from "../types";
import type { FilmScript } from "./types";

// Mots dits par seconde par un narrateur de film (plus lent qu'un short : on laisse respirer).
const WORDS_PER_SECOND: Record<Lang, number> = { fr: 2.6, en: 2.8 };
export const SHOT_PAD_S = 0.35;
export const SCENE_PAD_S = 0.6;
export const MAX_SHOT_WORDS = 45;

export const wordsFor = (seconds: number, lang: Lang): number => Math.round(seconds * WORDS_PER_SECOND[lang]);
export const speechSeconds = (words: number, lang: Lang): number => words / WORDS_PER_SECOND[lang];

export type FilmPlan = { scenes: number; sceneSec: number; acts: number; wordsPerScene: number; shotsPerScene: number };

// Des scènes de 1 à 3 minutes : assez longues pour qu'une action se joue, assez courtes pour que l'écriture
// (un appel au modèle par scène) tienne dans le contexte d'un petit modèle local.
export function planFilm(durationSec: number, lang: Lang = "fr"): FilmPlan {
  const sceneSec = durationSec <= 900 ? 60 : durationSec <= 1800 ? 100 : durationSec <= 3600 ? 150 : 180;
  const scenes = Math.max(1, Math.round(durationSec / sceneSec));
  const acts = scenes >= 20 ? 5 : scenes >= 3 ? 3 : scenes;
  return { scenes, sceneSec, acts, wordsPerScene: wordsFor(sceneSec, lang), shotsPerScene: Math.max(4, Math.round(sceneSec / 11)) };
}

// Découpe des actes : le reste va aux derniers actes pour que le total retombe juste.
export function sceneCountsPerAct(scenes: number, acts: number): number[] {
  const base = Math.floor(scenes / acts);
  const extra = scenes - base * acts;
  return Array.from({ length: acts }, (_, i) => base + (i >= acts - extra ? 1 : 0));
}

const countWords = (t: string) => t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

// Durée à voix haute d'une phrase, pauses de ponctuation comprises (avant la vraie voix).
export function estimateSpeech(text: string, lang: Lang): number {
  const pauses = (text.match(/[.?!…]+/g) ?? []).length * 0.25;
  return speechSeconds(countWords(text), lang) + pauses;
}

export function estimateFilmSeconds(film: FilmScript): number {
  return film.scenes.reduce((sum, s) => sum + SCENE_PAD_S + s.shots.reduce((t, sh) => t + estimateSpeech(sh.narration, film.lang) + SHOT_PAD_S, 0), 0);
}
