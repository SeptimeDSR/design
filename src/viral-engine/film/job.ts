import { createHash, randomBytes } from "node:crypto";
import { loadConfig } from "../config";
import { frameSize, QUALITY } from "../duration";
import { formatFailedMessage } from "../message";
import type { JobRequest, PipelineDeps } from "../pipeline";
import { resolvePublishMode } from "../publish-plan";
import { hasPostizCredentials } from "../publish";
import { createStore, type Job } from "../store";
import type { ViralScript } from "../types";
import { formatFilmReadyMessage } from "./message";
import { estimateFilmSeconds } from "./plan";
import { normalizeFilm } from "./types";
import { runFilm, type FilmRunOptions } from "./run";
import { FilmError } from "./writer";
import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";

export type LongJobDeps = NonNullable<FilmRunOptions["deps"]> & { frame?: FilmRunOptions["frame"] };

const UNSTARTED = new Set(["no_space", "no_voice", "no_ffmpeg", "no_writer"]);

// Même demande = même identifiant : relancer la commande d'un film interrompu le reprend où il s'était arrêté.
export function longJobId(req: JobRequest): string {
  const key = JSON.stringify([req.topic ?? "", req.lang ?? "", req.durationSec, req.genre ?? "", req.orientation ?? "", req.quality ?? "", req.film === undefined ? "" : createHash("sha1").update(JSON.stringify(req.film)).digest("hex")]);
  return createHash("sha1").update(key).digest("hex").slice(0, 8);
}

export async function runLongJob(req: JobRequest, partial: Partial<PipelineDeps>): Promise<Job> {
  const env = partial.env ?? process.env;
  const cfg = loadConfig(env);
  const store = createStore(cfg.home);
  const lang = req.lang ?? cfg.lang;
  const orientation = req.orientation ?? "paysage";
  const quality = req.quality ?? (env.VIRAL_QUALITY === "eco" || env.VIRAL_QUALITY === "hd" ? env.VIRAL_QUALITY : "standard");
  const topic = req.topic?.trim() ?? "";
  // Un film donné sans durée : la durée du texte à voix haute.
  const given = req.film === undefined ? undefined : normalizeFilm(req.film, { lang, genre: req.genre });
  const durationSec = req.durationSec ?? Math.max(15, Math.round(given ? estimateFilmSeconds(given) : 0));

  // Un job « ratée » du même nom est repris ; un film terminé n'est jamais écrasé (nouvel identifiant).
  let id = longJobId({ ...req, lang, orientation, quality });
  const existing = store.getJob(id);
  if (existing && existing.status !== "failed") id = randomBytes(4).toString("hex");
  const dir = join(store.jobsDir, id);
  const resumed = !!existing && existing.status === "failed";
  // Un film donné par l'humain se retrouve dans le dossier du job à la reprise.
  let film = req.film;
  if (film === undefined && resumed && existing?.request.filmProvided && existsSync(join(dir, "film.json"))) film = JSON.parse(readFileSync(join(dir, "film.json"), "utf8"));

  const deps = partial.film ?? {};
  const baseJob = {
    id,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    request: { topic, lang, durationSec, genre: req.genre, orientation, quality, ...(req.film !== undefined || existing?.request.filmProvided ? { filmProvided: true } : {}) },
    arm: "film",
    jobDir: dir,
    kind: "long" as const,
  };
  const notify = partial.notify ?? (async (text: string) => console.log(text));

  try {
    const result = await runFilm({
      req: { topic, lang, genre: req.genre, durationSec, orientation, quality, film },
      dir,
      env,
      cfg,
      frame: deps.frame ?? { ...frameSize(quality, orientation), fps: QUALITY[quality].fps, crf: QUALITY[quality].crf },
      onProgress: partial.progress,
      signal: partial.signal,
      deps,
    });
    const script: ViralScript = {
      topic: topic || result.film.title,
      lang,
      template: "film",
      formula: "question",
      hook: result.film.title,
      beats: [],
      payoff: result.film.logline,
      cta: "",
      caption: result.description,
      hashtags: result.film.hashtags,
    };
    const job: Job = {
      ...baseJob,
      status: "rendered",
      script,
      timeline: { segments: [], durationMs: result.durationMs },
      source: req.film !== undefined || (resumed && baseJob.request.filmProvided) ? "claude" : "ollama",
      ttsEngine: result.ttsEngine,
      videoPath: result.videoPath,
      broll: { source: result.imageSource, credits: result.credits },
      film: {
        genre: req.genre,
        orientation,
        quality,
        requestedSec: durationSec,
        scenes: result.film.scenes.length,
        chapters: result.chapters,
        imageSource: result.imageSource,
        musicSource: result.musicSource,
      },
    };
    store.saveJob(job);
    const mode = resolvePublishMode(env, partial.hasPostizCredentials ?? hasPostizCredentials());
    // Un film pèse des centaines de Mo : on n'envoie que le message, avec l'endroit où le voir.
    await notify(formatFilmReadyMessage(job, mode, cfg.platforms, store.ref(job.id)));
    job.status = "notified";
    store.saveJob(job);
    return job;
  } catch (error) {
    // Ce qui empêche de commencer (place, voix, ffmpeg, écrivain) est une erreur de la demande, pas un film raté.
    if (error instanceof FilmError && UNSTARTED.has(error.code)) throw error;
    const failed: Job = {
      ...baseJob,
      status: "failed",
      script: { topic: topic || "film", lang, template: "film", formula: "question", hook: topic || "Film", beats: [], payoff: "", cta: "", caption: "", hashtags: [] },
      timeline: { segments: [], durationMs: 0 },
      source: "ollama",
      ttsEngine: "",
      error: (error as Error).message,
    };
    store.saveJob(failed);
    await notify(formatFailedMessage(failed, store.ref(failed.id))).catch(() => undefined);
    return failed;
  }
}
