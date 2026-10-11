import { statfsSync } from "node:fs";

// La durée, le genre, le format et la qualité d'une vidéo : un seul endroit pour toutes les portes
// (terminal, Studio, API, MCP). Tout ce qui dépasse une minute passe par le moteur long métrage.

export const MIN_S = 15;
export const MAX_S = 4 * 3600;
// Jusqu'à 60 s : le format court (Remotion, hook H.E.A.T). Au-delà : le long métrage (ffmpeg, scènes, voix, images).
export const SHORT_MAX_S = 60;

export const isLongForm = (seconds: number): boolean => seconds > SHORT_MAX_S;

const EXAMPLE = "Écris par exemple 45s, 3min, 1h30 ou 90 (un nombre seul veut dire des minutes).";

export function parseDuration(input: string | number): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new Error(`Durée illisible. ${EXAMPLE}`);
    return bounded(Math.round(input));
  }
  const raw = input.trim().toLowerCase();
  const text = raw
    .replace(/\s+/g, "")
    .replace(/heures?/g, "h")
    .replace(/minutes?|mins?/g, "min")
    .replace(/secondes?|secs?/g, "s");
  const num = (v: string | undefined) => (v === undefined ? 0 : Number(v.replace(",", ".")));
  let seconds: number | undefined;
  if (/^\d+([.,]\d+)?$/.test(text)) seconds = num(text) * 60;
  else {
    // 1h30 · 1h30min · 2h15m · 90min · 3min30s · 45s : après « h », les chiffres seuls sont des minutes.
    const withHours = text.match(/^(\d+(?:[.,]\d+)?)h(?:(\d+(?:[.,]\d+)?)(?:min|m|$))?(?:(\d+)s)?$/);
    const noHours = text.match(/^(?:(\d+(?:[.,]\d+)?)(?:min|m))?(?:(\d+)s)?$/);
    if (withHours) seconds = num(withHours[1]) * 3600 + num(withHours[2]) * 60 + num(withHours[3]);
    else if (noHours && (noHours[1] || noHours[2])) seconds = num(noHours[1]) * 60 + num(noHours[2]);
  }
  if (seconds === undefined || !Number.isFinite(seconds)) throw new Error(`Durée illisible « ${input} ». ${EXAMPLE}`);
  return bounded(Math.round(seconds));
}

function bounded(seconds: number): number {
  if (seconds < MIN_S) throw new Error(`Durée trop courte : ${MIN_S} s au minimum.`);
  if (seconds > MAX_S) throw new Error(`Durée trop longue : ${MAX_S / 3600} h au maximum.`);
  return seconds;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h) return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
  if (m) return s ? `${m} min ${s} s` : `${m} min`;
  return `${s} s`;
}

export const GENRES = ["drame", "thriller", "mystere", "horreur", "romance", "comedie", "aventure", "conte", "histoire-vraie", "documentaire"] as const;
export type Genre = (typeof GENRES)[number];

export const GENRE_LABEL: Record<Genre, string> = {
  drame: "Drame",
  thriller: "Thriller",
  mystere: "Mystère",
  horreur: "Horreur",
  romance: "Romance",
  comedie: "Comédie",
  aventure: "Aventure",
  conte: "Conte",
  "histoire-vraie": "Histoire vraie",
  documentaire: "Documentaire",
};

const fold = (t: string) =>
  t
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-");

export function parseGenre(input: string | undefined): Genre | undefined {
  if (input === undefined || input === "") return undefined;
  const key = fold(input);
  const hit = GENRES.find((g) => g === key);
  if (!hit) throw new Error(`Genre inconnu « ${input} » : ${GENRES.join(", ")}.`);
  return hit;
}

export type Quality = "eco" | "standard" | "hd";
export type Orientation = "paysage" | "vertical";
export const QUALITIES: Quality[] = ["eco", "standard", "hd"];
export const ORIENTATIONS: Orientation[] = ["paysage", "vertical"];

// crf : plus grand = plus léger. fps 24 : le mouvement lent des images n'a pas besoin de plus.
export const QUALITY: Record<Quality, { long: number; short: number; crf: number; fps: number; mbPerMin: number; label: string }> = {
  eco: { long: 854, short: 480, crf: 30, fps: 24, mbPerMin: 0.9, label: "480p, très léger" },
  standard: { long: 1280, short: 720, crf: 27, fps: 24, mbPerMin: 1.8, label: "720p" },
  hd: { long: 1920, short: 1080, crf: 24, fps: 24, mbPerMin: 4, label: "1080p" },
};

export function frameSize(quality: Quality, orientation: Orientation): { width: number; height: number } {
  const q = QUALITY[quality];
  return orientation === "paysage" ? { width: q.long, height: q.short } : { width: q.short, height: q.long };
}

// Place à prévoir : le fichier final + le dossier de travail (images, voix, morceaux de rendu), effacé ensuite.
export function estimateDisk(seconds: number, quality: Quality): { finalMb: number; workMb: number; totalMb: number } {
  const minutes = seconds / 60;
  const finalMb = Math.ceil(minutes * QUALITY[quality].mbPerMin);
  // images (~ 0,4 Mo pour 10 s), voix (~ 2,6 Mo/min en WAV), morceaux de scène (= le fichier final) : on garde de la marge.
  const workMb = Math.ceil(minutes * 3 + finalMb + 150);
  return { finalMb, workMb, totalMb: finalMb + workMb };
}

// Ordre de grandeur sur un PC sans GPU pour le rendu : l'écriture du texte et les images dominent, pas ffmpeg.
export function estimateRenderMinutes(seconds: number, quality: Quality): number {
  const factor = { eco: 0.5, standard: 0.8, hd: 1.4 }[quality]; // mesuré : 11 min de film en 720p = 5,6 min de ffmpeg sur 4 cœurs, plus l écriture et la voix
  return Math.max(1, Math.ceil((seconds / 60) * factor + 2));
}

export function checkDisk(dir: string, seconds: number, quality: Quality, inject: { freeMb?: number } = {}): { ok: boolean; freeMb: number; needMb: number; message: string } {
  const needMb = Math.ceil(estimateDisk(seconds, quality).totalMb * 1.25);
  let freeMb = inject.freeMb;
  if (freeMb === undefined) {
    try {
      const s = statfsSync(dir);
      freeMb = Math.floor((s.bavail * s.bsize) / 1024 ** 2);
    } catch {
      freeMb = Number.MAX_SAFE_INTEGER; // disque illisible : on ne bloque pas sur une mesure impossible
    }
  }
  const ok = freeMb >= needMb;
  const message = ok
    ? `Place disque : ${freeMb} Mo libres, ${needMb} Mo prévus.`
    : `Pas assez de place : il faut environ ${needMb} Mo et il en reste ${freeMb} Mo. Choisis la qualité eco, une durée plus courte, ou libère de la place (docker system prune, vider la corbeille).`;
  return { ok, freeMb, needMb, message };
}
