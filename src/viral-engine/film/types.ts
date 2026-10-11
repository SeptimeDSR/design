import type { Genre } from "../duration";
import type { Lang, LintIssue } from "../types";
import { estimateFilmSeconds, MAX_SHOT_WORDS } from "./plan";

export type Gender = "f" | "h";
export const MOODS = ["calme", "tension", "tristesse", "joie", "mystere", "action"] as const;
export type Mood = (typeof MOODS)[number];

export type Character = { name: string; gender?: Gender; description?: string };
// narration : ce que la voix dit. speaker : le personnage qui parle (absent : le narrateur).
// visual : l'image à montrer, décrite concrètement en anglais (recherche de photo ou prompt d'image).
export type Shot = { narration: string; speaker?: string; visual?: string };
export type Scene = { title: string; summary?: string; location?: string; mood: Mood; shots: Shot[] };

export type FilmScript = {
  title: string;
  logline: string;
  lang: Lang;
  genre?: Genre;
  characters: Character[];
  scenes: Scene[];
  caption: string;
  hashtags: string[];
};

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const words = (t: string) => t.split(/\s+/).filter(Boolean);

// Coupe une narration trop longue aux phrases, puis aux virgules, puis au mot : une voix, une image, un plan.
export function splitNarration(narration: string, max = MAX_SHOT_WORDS): string[] {
  if (words(narration).length <= max) return [narration];
  const sentences = narration.match(/[^.!?…]+[.!?…]+["»”)]*\s*|[^.!?…]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [narration];
  const out: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length) out.push(current.join(" "));
    current = [];
  };
  for (const sentence of sentences) {
    const w = words(sentence);
    if (w.length > max) {
      flush();
      for (let i = 0; i < w.length; i += max) out.push(w.slice(i, i + max).join(" "));
      continue;
    }
    if (current.length + w.length > max) flush();
    current.push(...w);
  }
  flush();
  return out;
}

function shotOf(raw: unknown): Shot[] {
  const obj = typeof raw === "string" ? { narration: raw } : raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const narration = text(obj.narration ?? obj.text);
  if (!narration) return [];
  const speaker = text(obj.speaker) || undefined;
  const visual = text(obj.visual) || undefined;
  return splitNarration(narration).map((part) => ({ narration: part, ...(speaker ? { speaker } : {}), ...(visual ? { visual } : {}) }));
}

export function normalizeFilm(raw: unknown, ctx: { lang: Lang; genre?: Genre }): FilmScript | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const scenesRaw = Array.isArray(r.scenes) ? r.scenes : [];
  const scenes: Scene[] = scenesRaw
    .map((s, i): Scene | null => {
      if (!s || typeof s !== "object") return null;
      const o = s as Record<string, unknown>;
      const shots = (Array.isArray(o.shots) ? o.shots : []).flatMap(shotOf);
      if (!shots.length) return null;
      const mood = MOODS.find((m) => m === text(o.mood).toLowerCase()) ?? "calme";
      return { title: text(o.title) || `Scène ${i + 1}`, ...(text(o.summary) ? { summary: text(o.summary) } : {}), ...(text(o.location) ? { location: text(o.location) } : {}), mood, shots };
    })
    .filter((s): s is Scene => !!s);
  if (!scenes.length) return null;
  const characters: Character[] = (Array.isArray(r.characters) ? r.characters : [])
    .map((c): Character | null => {
      const o = c && typeof c === "object" ? (c as Record<string, unknown>) : {};
      const name = text(o.name);
      if (!name) return null;
      const g = text(o.gender).toLowerCase();
      const gender: Gender | undefined = /^(f|femme|female|fille)/.test(g) ? "f" : /^(h|m|homme|male|garcon|garçon)/.test(g) ? "h" : undefined;
      return { name, ...(gender ? { gender } : {}), ...(text(o.description) ? { description: text(o.description) } : {}) };
    })
    .filter((c): c is Character => !!c);
  const title = typeof r.title === "string" ? r.title.trim() : "";
  const genre = ctx.genre;
  return {
    title: title || (r.title === undefined ? "Sans titre" : ""),
    logline: text(r.logline),
    lang: ctx.lang,
    ...(genre ? { genre } : {}),
    characters,
    scenes,
    caption: text(r.caption) || text(r.logline) || title,
    hashtags: Array.isArray(r.hashtags) ? r.hashtags.filter((h): h is string => typeof h === "string") : [],
  };
}

export function lintFilm(film: FilmScript, opts: { targetSec?: number } = {}): LintIssue[] {
  const issues: LintIssue[] = [];
  if (!film.title.trim()) issues.push({ rule: "film.title", message: "Le film n'a pas de titre." });
  const known = new Set(film.characters.map((c) => c.name.toLowerCase()));
  if (known.size) {
    const unknown = new Set<string>();
    for (const sc of film.scenes) for (const sh of sc.shots) if (sh.speaker && !known.has(sh.speaker.toLowerCase())) unknown.add(sh.speaker);
    if (unknown.size) issues.push({ rule: "film.speaker_unknown", message: `Personnage(s) qui parle(nt) sans être dans characters : ${[...unknown].join(", ")}.` });
  }
  if (opts.targetSec) {
    const est = estimateFilmSeconds(film);
    if (est < opts.targetSec * 0.5 || est > opts.targetSec * 1.6) {
      issues.push({ rule: "film.duration", message: `Le texte dure environ ${Math.round(est)} s à voix haute, la durée demandée est ${opts.targetSec} s (entre ${Math.round(opts.targetSec * 0.5)} et ${Math.round(opts.targetSec * 1.6)} s attendues).` });
    }
  }
  return issues;
}
