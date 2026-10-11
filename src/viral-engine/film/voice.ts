import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeJsonAtomic } from "../lock";
import { hasPiperVoice, narratorVoice, PIPER_VOICE_F, synthesize, type TtsEngine } from "../tts";
import type { Lang } from "../types";
import { decodeWav, encodeWav } from "../wav";
import { estimateSpeech, SCENE_PAD_S, SHOT_PAD_S } from "./plan";
import type { Character, FilmScript } from "./types";
import { FilmError } from "./writer";

// La voix des films, un peu moins pressée que celle des shorts (1.0 = la vitesse naturelle de Piper).
export const FILM_VOICE_SPEED = 1;

export type Synth = (text: string, o: { lang: Lang; outPath: string; speed?: number; engine?: TtsEngine; voice?: string }) => Promise<{ path: string; durationMs: number; engine: TtsEngine }>;
export type ShotTiming = { startMs: number; endMs: number };
export type SceneVoice = { path: string; durationMs: number; shots: ShotTiming[]; engine: string };

export function voiceChoices(lang: Lang, characters: Character[], probe: { has: (voice: string) => boolean } = { has: hasPiperVoice }) {
  const narrator = narratorVoice(lang);
  const female = probe.has(PIPER_VOICE_F[lang]) ? PIPER_VOICE_F[lang] : narrator;
  const byName = new Map<string, string>();
  for (const c of characters) byName.set(c.name.toLowerCase(), c.gender === "f" ? female : narrator);
  return { narrator, female, byName };
}

// Pas de film muet par accident : sans voix installée, on dit comment l'installer plutôt que de rendre une heure de silence.
export function requireVoice(engine: TtsEngine, env: Record<string, string | undefined>): void {
  if (engine === "silent" && env.VIRAL_TTS !== "silent") {
    throw new FilmError(
      "Aucune voix n'est installée : un film sans voix serait muet. Installe la voix gratuite : Réglages > Voix française (Piper) > Installer, ou septim setup --voix. " +
        "Si le téléchargement est bloqué par ton réseau, télécharge les deux fichiers de la voix (.onnx et .onnx.json) dans le dossier voix/ : voir « septim reseau ».",
      "no_voice",
    );
  }
}

function resample(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return samples;
  const n = Math.round((samples.length * to) / from);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const pos = (i * from) / to;
    const a = Math.floor(pos);
    const b = Math.min(samples.length - 1, a + 1);
    out[i] = samples[a] + (samples[b] - samples[a]) * (pos - a);
  }
  return out;
}

const SAMPLE_RATE = 22050;
const pad = (n: number) => String(n).padStart(2, "0");

// Dit tous les plans d'une scène, les assemble avec leurs pauses et note où chaque plan commence.
export async function sceneVoice(o: {
  film: FilmScript;
  sceneIndex: number;
  dir: string;
  engine: TtsEngine;
  synth?: Synth;
  has?: (voice: string) => boolean;
  speed?: number;
  log?: (t: string) => void;
}): Promise<SceneVoice> {
  const voiceDir = join(o.dir, "voice");
  mkdirSync(voiceDir, { recursive: true });
  const base = join(voiceDir, `scene-${pad(o.sceneIndex)}`);
  if (existsSync(`${base}.wav`) && existsSync(`${base}.json`)) {
    try {
      return JSON.parse(readFileSync(`${base}.json`, "utf8")) as SceneVoice;
    } catch {
      // fichier de reprise abîmé : on refait la scène
    }
  }
  const scene = o.film.scenes[o.sceneIndex];
  const synth = o.synth ?? (synthesize as Synth);
  const voices = voiceChoices(o.film.lang, o.film.characters, { has: o.has ?? hasPiperVoice });
  const pieces: Float32Array[] = [new Float32Array(Math.round(SCENE_PAD_S * SAMPLE_RATE))];
  const shots: ShotTiming[] = [];
  let cursor = pieces[0].length;
  const padSamples = Math.round(SHOT_PAD_S * SAMPLE_RATE);
  let engineUsed: string = o.engine;
  for (const [k, shot] of scene.shots.entries()) {
    const outPath = join(voiceDir, `${pad(o.sceneIndex)}-${pad(k)}.wav`);
    const voice = shot.speaker ? (voices.byName.get(shot.speaker.toLowerCase()) ?? voices.narrator) : voices.narrator;
    let samples: Float32Array;
    try {
      const r = await synth(shot.narration, { lang: o.film.lang, outPath, engine: o.engine, speed: o.speed ?? FILM_VOICE_SPEED, ...(o.engine === "piper" ? { voice } : {}) });
      engineUsed = r.engine;
      const wav = decodeWav(readFileSync(outPath));
      samples = resample(wav.samples, wav.sampleRate, SAMPLE_RATE);
    } catch (error) {
      // Un plan raté ne coûte pas la scène : silence de la bonne durée, on le dit.
      o.log?.(`[film] voix du plan ${k + 1} de la scène ${o.sceneIndex + 1} : ${(error as Error).message}`);
      samples = new Float32Array(Math.round(estimateSpeech(shot.narration, o.film.lang) * SAMPLE_RATE));
    } finally {
      rmSync(outPath, { force: true });
    }
    const length = samples.length + padSamples;
    shots.push({ startMs: Math.round((cursor / SAMPLE_RATE) * 1000), endMs: Math.round(((cursor + length) / SAMPLE_RATE) * 1000) });
    pieces.push(samples, new Float32Array(padSamples));
    cursor += length;
  }
  const all = new Float32Array(cursor);
  let at = 0;
  for (const p of pieces) {
    all.set(p, at);
    at += p.length;
  }
  await writeFile(`${base}.wav`, encodeWav(all, SAMPLE_RATE));
  const result: SceneVoice = { path: `${base}.wav`, durationMs: Math.round((cursor / SAMPLE_RATE) * 1000), shots, engine: engineUsed };
  writeJsonAtomic(`${base}.json`, result);
  return result;
}
