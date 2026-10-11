import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeAmbient } from "../ambient";
import type { Env } from "../config";
import { MOOD_MUSIC } from "./genres";
import { MOODS, type FilmScript, type Mood } from "./types";

// La musique d'un film, gratuite d'abord : tes pistes (VIRAL_MUSIC_DIR), puis ACE-Step dans ComfyUI si tu l'as,
// puis un lit d'ambiance généré par l'usine. Elle reste sous la voix.
// BESOIN CREDIT: Suno ou Udio pour des morceaux chantés. Alternative gratuite: ACE-Step 1.5 (ComfyUI) ou ta bibliothèque libre de droits.

export type MusicGenerator = { ready(): Promise<boolean>; generate(prompt: string, seconds: number, seed: number): Promise<{ bytes: Uint8Array; ext: string }> };
export type MusicSession = { loops: Map<string, Promise<string | undefined>>; ambient?: Promise<string>; generatorOk?: boolean };
export const createMusicSession = (): MusicSession => ({ loops: new Map() });

export type SceneMusic = { path: string; volume: number; source: "dossier" | "comfyui" | "procedural" };

const AUDIO = /\.(mp3|wav|ogg|m4a|aac|flac)$/i;
const VOLUME = { dossier: 0.14, comfyui: 0.15, procedural: 0.1 };
export const LOOP_SECONDS = 90;

export async function sceneMusic(o: {
  film: FilmScript;
  sceneIndex: number;
  dir: string;
  env: Env;
  session: MusicSession;
  generator?: MusicGenerator;
  ambientSeconds?: number;
  log?: (t: string) => void;
}): Promise<SceneMusic | undefined> {
  if ((o.env.VIRAL_FILM_MUSIC ?? "").toLowerCase() === "off") return undefined;
  const mood: Mood = o.film.scenes[o.sceneIndex].mood;
  const folder = o.env.VIRAL_MUSIC_DIR;
  if (folder && existsSync(folder)) {
    const tracks = readdirSync(folder).filter((f) => AUDIO.test(f)).sort();
    if (tracks.length) return { path: join(folder, tracks[MOODS.indexOf(mood) % tracks.length]), volume: VOLUME.dossier, source: "dossier" };
  }

  const musicDir = join(o.dir, "music");
  const gen = o.generator;
  if (gen && o.session.generatorOk !== false) {
    if (o.session.generatorOk === undefined) o.session.generatorOk = await gen.ready().catch(() => false);
    if (o.session.generatorOk) {
      let loop = o.session.loops.get(mood);
      if (!loop) {
        loop = (async () => {
          mkdirSync(musicDir, { recursive: true });
          for (const ext of ["mp3", "flac", "wav", "opus", "ogg"]) {
            const cached = join(musicDir, `${mood}.${ext}`);
            if (existsSync(cached)) return cached;
          }
          try {
            const r = await gen.generate(MOOD_MUSIC[mood], LOOP_SECONDS, MOODS.indexOf(mood) + 1);
            const path = join(musicDir, `${mood}.${r.ext}`);
            writeFileSync(path, r.bytes);
            return path;
          } catch (error) {
            o.log?.(`[film] musique ${mood} : ComfyUI a échoué (${(error as Error).message}), ambiance de l'usine.`);
            o.session.generatorOk = false;
            return undefined;
          }
        })();
        o.session.loops.set(mood, loop);
      }
      const path = await loop;
      if (path) return { path, volume: VOLUME.comfyui, source: "comfyui" };
    }
  }

  o.session.ambient ??= (async () => {
    mkdirSync(musicDir, { recursive: true });
    return writeAmbient(join(musicDir, "ambiance.wav"), o.ambientSeconds ?? LOOP_SECONDS, 7);
  })();
  return { path: await o.session.ambient, volume: VOLUME.procedural, source: "procedural" };
}
