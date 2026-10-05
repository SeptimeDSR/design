import { splitWords, wordTimings } from "../../viral-engine/captions";
import type { SfxKind } from "../../viral-engine/sfx";
import type { CaptionWord, Lang, Timeline, ViralScript } from "../../viral-engine/types";
import { emphasisOf } from "./props";

// Mise en page mesurée (D28) : ce qui s'affiche tient dans la zone que TikTok, Reels et Shorts ne recouvrent pas.
export const VIEW = { width: 1080, height: 1920 } as const;
// Haut : onglets et recherche. Bas : pseudo, légende, musique (~ 450 px). Droite : j'aime, commentaires, partage (~ 150 px).
export const SAFE = { top: 220, bottom: 1460, left: 70, right: 930 } as const;

export type Box = { top: number; left: number; width: number; height: number };
export const LAYOUT = {
  hook: { top: 300, left: 90, width: 820, height: 660 },
  answerBox: { top: 240, left: 640, width: 270, height: 110 },
  chapter: { top: 280, left: 90, width: 820, height: 320 },
  bigWord: { top: 420, left: 90, width: 820, height: 430 },
  chips: { top: 870, left: 90, width: 820, height: 110 },
  captions: { top: 1010, left: 90, width: 820, height: 300 },
  badge: { top: 1330, left: 290, width: 440, height: 110 },
} satisfies Record<string, Box>;

// Largeur estimée d'un texte : nombre de caractères × taille × chasse moyenne de la police (em).
export const textWidth = (text: string, size: number, em: number) => text.length * size * em;

// La plus grande taille qui tient sur la largeur ; jamais de débordement, même sous minSize.
export function fitFontSize(text: string, o: { maxWidth: number; maxSize: number; minSize?: number; em: number }): number {
  const fit = Math.floor(o.maxWidth / Math.max(1, text.length * o.em));
  const size = Math.min(o.maxSize, Math.max(o.minSize ?? 0, fit));
  return textWidth(text, size, o.em) <= o.maxWidth ? size : Math.min(o.maxSize, fit);
}

// Le mot fort : la plus grande taille, sur une ligne ou coupé en deux à l'espace le plus central.
// fit < 1 réserve de la place autour du mot (cercle dessiné autour de la réponse).
export function bigWordSize(word: string, em: number, max = 240, fit = 1): { size: number; lines: string[] } {
  const box = { width: LAYOUT.bigWord.width * fit, height: LAYOUT.bigWord.height };
  const one = { size: fitFontSize(word, { maxWidth: box.width, maxSize: Math.min(max, box.height), em }), lines: [word] };
  // Un nombre ne se coupe jamais : « 50 / 000 F » se lirait 50.
  const spaces = /\d/.test(word) ? [] : [...word.matchAll(/ /g)].map((m) => m.index ?? 0);
  if (!spaces.length) return one;
  const cut = spaces.reduce((best, i) => (Math.abs(i - word.length / 2) < Math.abs(best - word.length / 2) ? i : best));
  const lines = [word.slice(0, cut), word.slice(cut + 1)];
  const longest = lines.reduce((a, b) => (b.length > a.length ? b : a));
  const two = { size: Math.min(fitFontSize(longest, { maxWidth: box.width, maxSize: max, em }), Math.floor(box.height / 2)), lines };
  return two.size > one.size * 1.15 ? two : one;
}

// Nombre de lignes d'un paragraphe coupé aux espaces à une largeur donnée.
export function lineCount(text: string, size: number, maxWidth: number, em: number): number {
  let lines = 1;
  let width = 0;
  for (const word of splitWords(text)) {
    const w = textWidth(word, size, em);
    const space = width ? size * em : 0;
    if (width && width + space + w > maxWidth) {
      lines++;
      width = w;
    } else width += space + w;
  }
  return lines;
}

// La phrase du hook, entière à l'écran dès la première image : c'est aussi la miniature.
export function hookState(timeline: Timeline, ms: number, em = 0.56, maxSize = 124): { visible: boolean; words: CaptionWord[]; fontSize: number } {
  const hook = timeline.segments.find((s) => s.kind === "hook") ?? timeline.segments[0];
  const words = wordTimings(hook.text, hook.startMs, hook.endMs);
  const box = LAYOUT.hook;
  let fontSize = maxSize;
  while (fontSize > 64 && lineCount(hook.text, fontSize, box.width, em) * fontSize * 1.08 > box.height) fontSize -= 4;
  return { visible: ms < hook.endMs, words, fontSize };
}

const UNIT = /^(F|FCFA|CFA|€|\$|%|km|kg|ans?|mois|h|min|x)$/i;

// Le mot fort d'un segment : l'emphase du beat ; pour un nombre, son unité suit (« 9 400 F »).
function strongWord(text: string, emphasis?: string): string {
  const word = emphasisOf(text, emphasis);
  if (!/\d/.test(word)) return word;
  const after = text.slice(text.indexOf(word) + word.length).trim().split(/\s+/)[0]?.replace(/[.,;:!?…]+$/, "");
  return after && UNIT.test(after) ? `${word} ${after}` : word;
}

export type Scene = { kind: Timeline["segments"][number]["kind"]; word: string; hue: number; variant: 0 | 1 | 2 };

// Un changement visuel par segment : couleur, disposition et mot fort changent à chaque coupe.
export function sceneFor(script: ViralScript, timeline: Timeline, index: number): Scene {
  const seg = timeline.segments[index];
  const beat = seg.kind === "beat" ? script.beats.find((b) => b.text.includes(seg.text) || seg.text.includes(b.text)) : undefined;
  const word = seg.kind === "beat" ? strongWord(seg.text, beat?.emphasis) : seg.kind === "payoff" ? strongWord(seg.text) : "";
  return { kind: seg.kind, word, hue: index % 5, variant: (index % 3) as 0 | 1 | 2 };
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];

export function chapterLabel(timeline: Timeline, index: number, lang: Lang): string {
  const seg = timeline.segments[index];
  if (seg.kind === "hook") return "PROLOGUE";
  if (seg.kind === "payoff") return lang === "fr" ? "LA RÉPONSE" : "THE ANSWER";
  if (seg.kind === "cta") return lang === "fr" ? "ÉPILOGUE" : "EPILOGUE";
  const n = timeline.segments.slice(0, index + 1).filter((s) => s.kind === "beat").length;
  return ROMAN[(n - 1) % ROMAN.length];
}

// « 9 400 F » qui monte depuis 0 : même écriture (groupes de 3 chiffres, unité), seule la valeur change.
export function countUpText(text: string, progress: number): string {
  const m = text.match(/\d{1,3}(?:[   ]\d{3})+|\d+(?:[.,]\d+)?/);
  if (!m) return text;
  const raw = m[0];
  const sep = raw.match(/[   ]/)?.[0];
  const decimal = raw.match(/[.,](\d+)$/);
  const value = Number(raw.replace(/[   ]/g, "").replace(",", "."));
  const p = Math.min(1, Math.max(0, progress));
  let out: string;
  if (decimal) out = (value * p).toFixed(decimal[1].length).replace(".", raw.includes(",") ? "," : ".");
  else {
    const n = String(Math.round(value * p));
    out = sep || value >= 10_000 ? n.replace(/\B(?=(\d{3})+(?!\d))/g, sep ?? " ") : n;
  }
  return text.slice(0, m.index) + out + text.slice((m.index ?? 0) + raw.length);
}

export type SfxCue = { kind: SfxKind; atMs: number };
export const SFX_VOLUME: Record<SfxKind, number> = { hit: 0.45, whoosh: 0.28, riser: 0.22, ding: 0.42 };
const RISER_MS = 1200;

// Bruitages générés, gratuits : un impact à l'ouverture, un whoosh à chaque coupe, une montée puis un « ding » sur la réponse.
export function sfxCues(timeline: Timeline): SfxCue[] {
  const cues: SfxCue[] = [{ kind: "hit", atMs: 0 }];
  const payoff = timeline.segments.find((s) => s.kind === "payoff");
  for (const s of timeline.segments.slice(1)) if (s !== payoff) cues.push({ kind: "whoosh", atMs: s.startMs });
  if (payoff) {
    cues.push({ kind: "riser", atMs: Math.max(0, payoff.startMs - RISER_MS) });
    cues.push({ kind: "ding", atMs: payoff.startMs });
  }
  return cues.filter((c) => c.atMs < timeline.durationMs).sort((a, b) => a.atMs - b.atMs);
}
