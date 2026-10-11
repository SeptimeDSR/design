import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BrollCredit } from "../broll";
import { loadConfig, type Env, type ViralConfig } from "../config";
import { checkDisk, GENRE_LABEL, QUALITY, frameSize, type Genre, type Orientation, type Quality } from "../duration";
import { writeJsonAtomic } from "../lock";
import { detectEngine, type TtsEngine } from "../tts";
import type { Lang } from "../types";
import { buildAss, creditsAss, titleAss } from "./ass";
import { filmGenerators as comfyFilmGenerators } from "./comfy-film";
import { cardImageArgs, cardSegmentArgs, chapterLines, chapterMetadata, concatArgs, concatListText, hasFfmpeg, motionFor, probeSeconds, runFfmpeg, sceneRenderArgs, type Chapter, type Frame } from "./ffmpeg";
import { createMusicSession, sceneMusic, type MusicGenerator } from "./music";
import { estimateFilmSeconds } from "./plan";
import { lintFilm, normalizeFilm, type FilmScript } from "./types";
import { createVisualSession, sceneImages, type ImageGenerator } from "./visuals";
import { requireVoice, sceneVoice, type Synth } from "./voice";
import { FilmError, filmOllama, writeFilm, type FilmLlm, type Progress } from "./writer";

export type FilmRequest = {
  topic?: string;
  lang: Lang;
  genre?: Genre;
  durationSec: number;
  orientation: Orientation;
  quality: Quality;
  // Un film déjà écrit (par Claude Code, par toi) : l'usine ne l'écrit pas, elle le tourne.
  film?: unknown;
  captions?: boolean;
};

export type RunProgress = Progress & { percent: number };

export type FilmRunOptions = {
  req: FilmRequest;
  dir: string;
  env: Env;
  cfg?: ViralConfig;
  frame?: Frame;
  onProgress?: (p: RunProgress) => void;
  signal?: AbortSignal;
  log?: (text: string) => void;
  // Remplacements pour les tests.
  deps?: {
    synth?: Synth;
    hasVoice?: (voice: string) => boolean;
    engine?: TtsEngine;
    llm?: FilmLlm;
    fetchImpl?: typeof fetch;
    prepare?: (src: string, dst: string) => Promise<void>;
    card?: (dst: string, seed: number) => Promise<void>;
    imageGenerator?: ImageGenerator;
    musicGenerator?: MusicGenerator;
    freeMb?: number;
    beforeRender?: (sceneIndex: number) => void;
  };
};

export type FilmResult = {
  videoPath: string;
  durationMs: number;
  film: FilmScript;
  chapters: Chapter[];
  credits: BrollCredit[];
  imageSource: string;
  musicSource: string;
  ttsEngine: string;
  description: string;
};

type SceneState = { durationMs: number; credits: BrollCredit[]; imageSources: string[]; musicSource: string; engine: string };
type State = { version: 1; scenes: Record<string, SceneState> };

const pad = (n: number) => String(n).padStart(2, "0");
const INTRO_S = 4;
const CREDITS_S = 5;
const dominant = (items: string[]) => {
  const counts = new Map<string, number>();
  for (const i of items) counts.set(i, (counts.get(i) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "procedural";
};

export async function runFilm(o: FilmRunOptions): Promise<FilmResult> {
  const { req, dir, env } = o;
  const deps = o.deps ?? {};
  const cfg = o.cfg ?? loadConfig(env);
  const log = o.log ?? ((t: string) => console.error(t));
  const frame: Frame = o.frame ?? { ...frameSize(req.quality, req.orientation), fps: QUALITY[req.quality].fps, crf: QUALITY[req.quality].crf };
  const signal = o.signal;
  const abortIf = () => {
    if (signal?.aborted) throw new FilmError("Fabrication annulée.", "aborted");
  };

  // 1. Tout ce qui peut empêcher de finir est vérifié AVANT de commencer.
  if (!deps.prepare && !hasFfmpeg(env)) throw new FilmError("ffmpeg est introuvable : il fait partie de l'image Docker (docker compose up -d --build) ; hors Docker, installe-le (ffmpeg.org).", "no_ffmpeg");
  const disk = checkDisk(dir, req.durationSec, req.quality, deps.freeMb !== undefined ? { freeMb: deps.freeMb } : {});
  if (!disk.ok) throw new FilmError(disk.message, "no_space");
  const engine = deps.engine ?? (await detectEngine(req.lang, env.VIRAL_TTS ?? cfg.tts));
  requireVoice(engine, env);

  let last = -1;
  const report = (phase: string, percent: number, message: string, done = 0, total = 0) => {
    const p = Math.min(100, Math.max(0, Math.round(percent)));
    if (p === last && phase !== "fin") return;
    last = p;
    o.onProgress?.({ phase, percent: p, message, done, total });
  };

  mkdirSync(dir, { recursive: true });

  // 2. L'histoire : donnée par l'humain ou par Claude, sinon écrite scène par scène par Ollama.
  let film: FilmScript;
  if (req.film !== undefined) {
    const f = normalizeFilm(req.film, { lang: req.lang, genre: req.genre });
    if (!f) throw new FilmError("Le film donné est vide : il faut un titre et au moins une scène avec des plans (narration).", "unreadable");
    const issues = lintFilm(f, { targetSec: req.durationSec });
    if (issues.length) throw new FilmError(`Film refusé :\n${issues.map((i) => `- ${i.rule} : ${i.message}`).join("\n")}`, "unreadable");
    film = f;
  } else {
    film = await writeFilm({
      topic: req.topic ?? "",
      lang: req.lang,
      genre: req.genre,
      durationSec: req.durationSec,
      dir,
      llm: deps.llm ?? filmOllama(cfg, env),
      signal,
      log,
      onProgress: (p) => report("ecriture", (p.done / p.total) * 10, `Écriture : ${p.message}`, p.done, p.total),
    });
  }
  writeJsonAtomic(join(dir, "film.json"), film);
  const estimate = estimateFilmSeconds(film);
  log(`[film] « ${film.title} » : ${film.scenes.length} scène(s), environ ${Math.round(estimate / 60)} min.`);

  // 3. Les scènes, une par une : voix, images, musique, puis un morceau de MP4. Les fichiers de travail sont effacés au fur et à mesure.
  const segDir = join(dir, "segments");
  const workDir = join(dir, "work");
  mkdirSync(segDir, { recursive: true });
  mkdirSync(workDir, { recursive: true });
  const statePath = join(dir, "state.json");
  let state: State = { version: 1, scenes: {} };
  if (existsSync(statePath)) {
    try {
      state = JSON.parse(readFileSync(statePath, "utf8")) as State;
    } catch {
      // état abîmé : les morceaux déjà rendus seront relus par leur durée
    }
  }

  const visuals = createVisualSession();
  const musicSession = createMusicSession();
  const generators = comfyFilmGenerators({ ...env, VIRAL_FILM_ORIENTATION: req.orientation }, deps.fetchImpl ?? fetch);
  const imageGenerator = deps.imageGenerator ?? generators.image;
  const musicGenerator = deps.musicGenerator ?? generators.music;
  const captions = req.captions !== false && (env.VIRAL_FILM_CAPTIONS ?? "").toLowerCase() !== "off";
  const N = film.scenes.length;

  // Carte titre
  const introPath = join(segDir, "intro.mp4");
  if (!existsSync(introPath)) {
    const img = join(workDir, "intro.jpg");
    await runFfmpeg(cardImageArgs(img, frame, createHash("sha1").update(film.title).digest()[0]), { signal });
    writeFileSync(join(workDir, "intro.ass"), titleAss({ width: frame.width, height: frame.height, title: film.title, subtitle: film.genre ? GENRE_LABEL[film.genre] : undefined, seconds: INTRO_S }));
    await runFfmpeg(cardSegmentArgs({ frame, image: img, ass: "intro.ass", seconds: INTRO_S, out: introPath }), { signal, cwd: workDir });
  }

  const sceneFiles: string[] = [];
  for (let i = 0; i < N; i++) {
    abortIf();
    const seg = join(segDir, `scene-${pad(i)}.mp4`);
    const done = state.scenes[String(i)];
    const base = 10 + (82 * i) / N;
    const span = 82 / N;
    if (done && existsSync(seg) && Math.abs((probeSeconds(seg, env) ?? 0) * 1000 - done.durationMs) < 1500) {
      sceneFiles.push(seg);
      report("rendu", base + span, `Scène ${i + 1}/${N} (déjà rendue)`, i + 1, N);
      continue;
    }
    report("voix", base, `Scène ${i + 1}/${N} : voix`, i, N);
    const voice = await sceneVoice({ film, sceneIndex: i, dir, engine, synth: deps.synth, has: deps.hasVoice, log });
    abortIf();
    report("images", base + span * 0.2, `Scène ${i + 1}/${N} : images`, i, N);
    const images = await sceneImages({ film, sceneIndex: i, dir, frame, orientation: req.orientation, env, fetchImpl: deps.fetchImpl, session: visuals, generator: imageGenerator, prepare: deps.prepare, card: deps.card, signal, log });
    const music = await sceneMusic({ film, sceneIndex: i, dir, env, session: musicSession, generator: musicGenerator, log });
    abortIf();

    const scene = film.scenes[i];
    // Les plans partagent la durée de la scène : la voix + sa pause. Le dernier prend le reste, la scène dure exactement sa voix.
    let previous = 0;
    const specs = scene.shots.map((_, k) => {
      const endFrames = k === scene.shots.length - 1 ? Math.round((voice.durationMs / 1000) * frame.fps) : Math.round((voice.shots[k].endMs / 1000) * frame.fps);
      const frames = Math.max(1, endFrames - previous);
      previous += frames;
      return { image: images.images[k].path, motion: motionFor(i, k), frames };
    });
    const assName = `scene-${pad(i)}.ass`;
    if (captions) writeFileSync(join(workDir, assName), buildAss({ width: frame.width, height: frame.height, shots: scene.shots.map((s, k) => ({ text: s.narration, startMs: voice.shots[k].startMs, endMs: voice.shots[k].endMs, speaker: s.speaker })) }));
    deps.beforeRender?.(i);
    const tmpOut = join(segDir, `scene-${pad(i)}.partial.mp4`);
    await runFfmpeg(
      sceneRenderArgs({ frame, shots: specs, voice: voice.path, durationSec: voice.durationMs / 1000, music: music?.path, musicVolume: music?.volume ?? 0, ass: captions ? assName : undefined, out: tmpOut, fadeSec: 0.5 }),
      { signal, cwd: workDir, onProgress: (s) => report("rendu", base + span * (0.5 + 0.5 * Math.min(1, s / (voice.durationMs / 1000))), `Scène ${i + 1}/${N} : rendu`, i, N) },
    );
    renameSync(tmpOut, seg);
    state.scenes[String(i)] = { durationMs: voice.durationMs, credits: images.credits, imageSources: images.images.map((x) => x.source), musicSource: music?.source ?? "aucune", engine: voice.engine };
    writeJsonAtomic(statePath, state);
    // Le travail de la scène est fini : voix, images et sous-titres ne servent plus (place disque).
    for (const f of [`voice/scene-${pad(i)}.wav`, `voice/scene-${pad(i)}.json`]) rmSync(join(dir, f), { force: true });
    for (const img of new Set(images.images.map((x) => x.path))) rmSync(img, { force: true });
    rmSync(join(dir, "images", `scene-${pad(i)}.json`), { force: true });
    rmSync(join(workDir, assName), { force: true });
    sceneFiles.push(seg);
    report("rendu", base + span, `Scène ${i + 1}/${N} : terminée`, i + 1, N);
  }

  // 4. Assemblage : titre + scènes + générique, collés sans réencoder, avec les chapitres.
  abortIf();
  report("assemblage", 93, "Assemblage du film");
  const credits = [...new Map(Object.values(state.scenes).flatMap((s) => s.credits).map((c) => [c.url, c])).values()];
  const files = [introPath, ...sceneFiles];
  let creditsMs = 0;
  if (credits.length) {
    const creditsPath = join(segDir, "credits.mp4");
    if (!existsSync(creditsPath)) {
      const img = join(workDir, "credits.jpg");
      await runFfmpeg(cardImageArgs(img, frame, 3), { signal });
      const providers = [...new Set(credits.map((c) => (c.provider === "pexels" ? "Pexels" : "Pixabay")))].join(" et ");
      const names = [...new Set(credits.map((c) => c.author))].slice(0, 12).join(", ");
      writeFileSync(join(workDir, "credits.ass"), creditsAss({ width: frame.width, height: frame.height, lines: [`Images libres de droits : ${providers}`, names, "", `Voix : ${engine === "piper" ? "Piper" : engine} · Montage : SEPTIM`], seconds: CREDITS_S }));
      await runFfmpeg(cardSegmentArgs({ frame, image: img, ass: "credits.ass", seconds: CREDITS_S, out: creditsPath }), { signal, cwd: workDir });
    }
    files.push(creditsPath);
    creditsMs = CREDITS_S * 1000;
  }
  const chapters: Chapter[] = [];
  let cursor = 0;
  film.scenes.forEach((s, i) => {
    const length = state.scenes[String(i)].durationMs + (i === 0 ? INTRO_S * 1000 : 0);
    chapters.push({ title: s.title, startMs: cursor, endMs: cursor + length });
    cursor += length;
  });
  const totalMs = cursor + creditsMs;
  writeFileSync(join(workDir, "list.txt"), concatListText(files));
  writeFileSync(join(workDir, "meta.txt"), chapterMetadata(film.title, chapters));
  const videoPath = join(dir, "video.mp4");
  await runFfmpeg(concatArgs(join(workDir, "list.txt"), join(workDir, "meta.txt"), `${videoPath}.partial.mp4`), { signal });
  renameSync(`${videoPath}.partial.mp4`, videoPath);

  for (const gone of ["segments", "work", "voice", "images", "music"]) rmSync(join(dir, gone), { recursive: true, force: true });
  report("fin", 100, "Film terminé", N, N);

  const description = [film.caption, "", chapterLines(chapters), ...(credits.length ? ["", "Images : " + [...new Set(credits.map((c) => c.provider))].join(", ")] : [])].join("\n").trim();
  return {
    videoPath,
    durationMs: totalMs,
    film,
    chapters,
    credits,
    imageSource: dominant(Object.values(state.scenes).flatMap((s) => s.imageSources)),
    musicSource: dominant(Object.values(state.scenes).map((s) => s.musicSource)),
    ttsEngine: Object.values(state.scenes)[0]?.engine ?? engine,
    description,
  };
}
