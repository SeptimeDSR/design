import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { hasFfmpeg, probeSeconds } from "../film/ffmpeg";
import { runFilm, type FilmRunOptions } from "../film/run";
import { FilmError } from "../film/writer";
import { encodeWav } from "../wav";

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "film-run-"));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

const scene = (title: string, mood: string) => ({
  title,
  location: "old kitchen",
  mood,
  shots: [
    { narration: "Il pleuvait ce soir là sur la ville.", visual: "rain city night" },
    { narration: "Je ne signerai pas ce papier.", speaker: "Mireille", visual: "woman holding paper" },
    { narration: "Paul se tut longtemps.", visual: "man silent kitchen" },
  ],
});
const script = {
  title: "La dette",
  logline: "Une mère doit rembourser.",
  characters: [{ name: "Mireille", gender: "f" }],
  scenes: [scene("Le courrier", "calme"), scene("La nuit", "tension"), scene("Le matin", "joie")],
  caption: "Une dette venue de nulle part.",
  hashtags: ["#drame"],
};

// Voix factice : 0,3 s par mot (les tests restent courts).
const synth: NonNullable<FilmRunOptions["deps"]>["synth"] = async (text, o) => {
  const seconds = text.split(/\s+/).length * 0.3;
  writeFileSync(o.outPath, encodeWav(new Float32Array(Math.round(22050 * seconds)).map((_, i) => 0.1 * Math.sin(i / 15)), 22050));
  return { path: o.outPath, durationMs: seconds * 1000, engine: "piper" };
};

const frame = { width: 320, height: 180, fps: 12, crf: 32 };
const base = (dir: string, over: Partial<FilmRunOptions> = {}): FilmRunOptions => ({
  req: { topic: "la dette", lang: "fr", genre: "drame", durationSec: 20, orientation: "paysage", quality: "eco", film: script },
  dir,
  env: { VIRAL_TTS: "piper", PEXELS_API_KEY: "", VIRAL_FILM_MUSIC: "auto" },
  frame,
  deps: { synth, hasVoice: () => true, freeMb: 100_000 },
  ...over,
});

describe.skipIf(!hasFfmpeg())("runFilm : de l'histoire au fichier MP4, scène par scène", () => {
  it("rend un film complet : titre, scènes, générique, chapitres ; nettoie le dossier de travail", async () => {
    const dir = tmp();
    const progress: string[] = [];
    const r = await runFilm(base(dir, { onProgress: (p) => progress.push(`${p.phase}:${p.percent}`) }));
    expect(existsSync(r.videoPath)).toBe(true);
    const secs = probeSeconds(r.videoPath)!;
    expect(Math.abs(secs * 1000 - r.durationMs)).toBeLessThan(1500);
    expect(r.durationMs).toBeGreaterThan(10_000);
    // 3 scènes → 3 chapitres, le premier à 0:00
    const info = JSON.parse(spawnSync("ffprobe", ["-v", "error", "-show_chapters", "-of", "json", r.videoPath], { encoding: "utf8" }).stdout);
    expect(info.chapters).toHaveLength(3);
    expect(info.chapters[0].start).toBe(0);
    expect(r.chapters.map((c) => c.title)).toEqual(["Le courrier", "La nuit", "Le matin"]);
    expect(r.description).toContain("00:00 Le courrier");
    expect(r.ttsEngine).toBe("piper");
    expect(r.imageSource).toBe("procedural");
    expect(r.musicSource).toBe("procedural");
    // la progression monte, finit à 100
    expect(progress.at(-1)).toMatch(/:100$/);
    const nums = progress.map((p) => Number(p.split(":")[1]));
    expect([...nums].sort((a, b) => a - b)).toEqual(nums);
    // dossier de travail nettoyé : ni voix, ni images, ni morceaux de rendu
    const left = readdirSync(dir);
    expect(left).toContain("video.mp4");
    for (const gone of ["segments", "voice", "images", "work"]) expect(left, gone).not.toContain(gone);
    expect(JSON.parse(readFileSync(join(dir, "film.json"), "utf8")).title).toBe("La dette");
  }, 120_000);

  it("reprise : après un plantage au rendu de la scène 2, la relance ne refait que ce qui manque", async () => {
    const dir = tmp();
    let voiced = 0;
    const counting: FilmRunOptions["deps"] = { synth: async (t, o) => (voiced++, synth!(t, o)), hasVoice: () => true, freeMb: 100_000 };
    let renders = 0;
    const flaky: FilmRunOptions["deps"] = {
      ...counting,
      beforeRender: (i: number) => {
        renders++;
        if (i === 1 && renders === 2) throw new FilmError("coupure de courant", "render");
      },
    };
    await expect(runFilm(base(dir, { deps: flaky }))).rejects.toThrow(/coupure/);
    expect(existsSync(join(dir, "segments", "scene-00.mp4"))).toBe(true);
    const firstRun = voiced;
    const r = await runFilm(base(dir, { deps: counting }));
    expect(existsSync(r.videoPath)).toBe(true);
    // 9 plans au total ; la scène 0 (3 plans) n'est pas redite
    expect(voiced - firstRun).toBeLessThanOrEqual(6);
    expect(r.chapters).toHaveLength(3);
  }, 120_000);

  it("pas assez de place : refuse avant de commencer, sans rien écrire", async () => {
    const dir = tmp();
    const err = await runFilm(base(dir, { req: { topic: "t", lang: "fr", durationSec: 3600, orientation: "paysage", quality: "standard", film: script }, deps: { synth, hasVoice: () => true, freeMb: 50 } })).catch((e) => e);
    expect(err).toBeInstanceOf(FilmError);
    expect(err.code).toBe("no_space");
    expect(readdirSync(dir)).toEqual([]);
  });

  it("pas de voix installée : arrêt clair avant tout travail", async () => {
    const err = await runFilm(base(tmp(), { env: { VIRAL_TTS: "auto" }, deps: { synth, hasVoice: () => false, engine: "silent", freeMb: 100_000 } })).catch((e) => e);
    expect(err).toBeInstanceOf(FilmError);
    expect(err.code).toBe("no_voice");
  });

  it("un script refusé par le contrôle (personnage inconnu) : message précis, rien n'est rendu", async () => {
    const bad = { ...script, scenes: [{ ...scene("X", "calme"), shots: [{ narration: "Salut.", speaker: "Fantôme" }] }] };
    const err = await runFilm(base(tmp(), { req: { topic: "t", lang: "fr", durationSec: 20, orientation: "paysage", quality: "eco", film: bad } })).catch((e) => e);
    expect(String(err.message)).toMatch(/Fantôme/);
  });

  it("annulation : le signal d'arrêt coupe le rendu proprement", async () => {
    const ctl = new AbortController();
    const err = await runFilm(base(tmp(), { signal: ctl.signal, deps: { synth: async (t, o) => (ctl.abort(), synth!(t, o)), hasVoice: () => true, freeMb: 100_000 } })).catch((e) => e);
    expect(err).toBeInstanceOf(FilmError);
    expect(err.code).toBe("aborted");
  }, 60_000);
});
