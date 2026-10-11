import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { loadConfig, type Env } from "./config";
import { checkDisk, estimateDisk, estimateRenderMinutes, isLongForm, ORIENTATIONS, parseDuration, parseGenre, QUALITIES, type Genre, type Orientation, type Quality } from "./duration";
import { estimateFilmSeconds } from "./film/plan";
import { lintFilm, normalizeFilm } from "./film/types";
import { publishWithLedger } from "./daemon";
import { createFeatures, type FeatureView } from "./features";
import { createInstalls, type StepRunner } from "./installs";
import type { NotifierHub } from "./notifier-hub";
import { diagnose, probe as realProbe, type Probes } from "./doctor";
import { FactoryError } from "./errors";
import { tryLock, writeJsonAtomic } from "./lock";
import { hostname } from "node:os";
import { checkScript, cleanTopic, runJob as realRunJob, type JobRequest, type PipelineDeps } from "./pipeline";
import { publishJob, type PublishResult } from "./publish";
import { resolveModeFromEnv } from "./publish-mode";
import { createStore, RefError, type Job, type JobStatus } from "./store";
import { TEMPLATES, type Lang, type TemplateId, type ViralScript } from "./types";

// brollDir : seulement le terminal (dossier local de l'humain) ; l'API et le MCP ne le transmettent jamais.
// Plus d'une minute (durationSec) : un film. film : un film déjà écrit (Claude Code, toi), l'usine ne fait que le tourner.
export type VideoRequest = {
  topic?: string;
  template?: TemplateId;
  lang?: Lang;
  script?: Partial<ViralScript>;
  brollDir?: string;
  durationSec?: number;
  genre?: Genre;
  orientation?: Orientation;
  quality?: Quality;
  film?: unknown;
  // Posé par l'usine dans la tâche enregistrée : le texte du film n'y est pas recopié.
  filmProvided?: boolean;
};

export type TaskProgress = { phase: string; percent: number; message: string };

export type Task = {
  id: string;
  kind: "create" | "redo";
  status: "queued" | "running" | "done" | "failed";
  request: VideoRequest;
  jobId?: string;
  ref?: string;
  error?: string;
  // Où en est un film (écriture, voix, images, rendu) : pourcentage et message lisible.
  progress?: TaskProgress;
  // Processus qui rend la tâche : une tâche dont le processus est mort est « interrompue », pas « en cours » pour toujours.
  pid?: number;
  host?: string;
  createdAt: string;
  updatedAt: string;
};

export type VideoSummary = {
  id: string;
  ref: string;
  status: JobStatus;
  hook: string;
  topic: string;
  template: TemplateId;
  lang: Lang;
  // « long » : un film (plusieurs minutes) ; absent : un format court.
  kind?: "long";
  durationMs: number;
  voice: string;
  source: Job["source"];
  createdAt: string;
  publishedAt?: string;
  hasVideo: boolean;
};

export type VideoDetail = VideoSummary & {
  caption: string;
  hashtags: string[];
  script: ViralScript;
  videoPath?: string;
  posted?: Job["posted"];
  error?: string;
  publishMode: string;
  // D'où viennent les plans de fond (ComfyUI, Pexels, Pixabay, tes clips, procédural) et à qui les créditer.
  broll?: Job["broll"];
  // Film : chapitres, genre, format, qualité.
  film?: Job["film"];
};

export type FactoryEvent = "video.ready" | "video.failed" | "video.published" | "video.rejected";
// Un échec avant tout rendu n'a pas encore de vidéo : la tâche porte alors l'information.
export type EventPayload = { video?: VideoDetail; task?: Task; error?: string };

export type FactoryDeps = {
  env: Env;
  runJob: (req: JobRequest, partial: Partial<PipelineDeps>) => Promise<Job>;
  publish: (job: Job) => Promise<PublishResult>;
  notify: (text: string, media?: string) => Promise<void>;
  probe: () => Promise<Probes>;
  // Réglages du Studio : installations (pip) et sondes réseau, remplaçables dans les tests.
  installRun?: StepRunner;
  fetchImpl?: typeof fetch;
};

const MAX_TOPIC = 500;
const CONFIRM = /^\s*oui\s*#?\s*([0-9a-f]{4,})\s*$/i;

const bad = (message: string, details?: unknown) => new FactoryError("bad_request", message, details);

// Le cœur unique : Studio, API, MCP, terminal et WhatsApp passent tous par ici.
export function createFactory(partial: Partial<FactoryDeps> = {}) {
  const env = partial.env ?? process.env;
  const cfg = loadConfig(env);
  const store = createStore(cfg.home);
  const tasksDir = join(cfg.home, "tasks");
  mkdirSync(tasksDir, { recursive: true });
  const notify = partial.notify ?? (async (text: string) => void process.stderr.write(`${text}\n`));
  const runJob = partial.runJob ?? realRunJob;
  // Mode et plateformes relus à chaque publication : un interrupteur du Studio compte tout de suite.
  const publishImpl =
    partial.publish ??
    ((job: Job) => {
      const live = loadConfig(env);
      return publishJob(job, resolveModeFromEnv(env), live.platforms, live.tiktokMethod);
    });
  const installs = createInstalls({ home: cfg.home, env, run: partial.installRun, fetchImpl: partial.fetchImpl });
  let hub: NotifierHub | undefined;
  const features = createFeatures({ home: cfg.home, env, installs, fetchImpl: partial.fetchImpl, hub: () => hub?.state() });
  const handlers = new Map<FactoryEvent, Set<(p: EventPayload) => void>>();
  let chain: Promise<unknown> = Promise.resolve();

  const ref = (job: Pick<Job, "id">) => store.ref(job.id);
  const alive = (pid: number) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "EPERM";
    }
  };
  // Ctrl+C, fin de session MCP, redémarrage pm2 : la tâche du processus mort passe à « failed », on peut la relancer.
  const settle = (task: Task): Task => {
    const active = task.status === "queued" || task.status === "running";
    if (!active || !task.pid || task.pid === process.pid || task.host !== hostname() || alive(task.pid)) return task;
    return saveTask({ ...task, status: "failed", error: "Rendu interrompu (l'usine s'est arrêtée pendant le rendu) : relance-le." });
  };

  const emit = (event: FactoryEvent, payload: EventPayload) => {
    for (const h of handlers.get(event) ?? []) {
      try {
        h(payload);
      } catch (error) {
        console.error(`[événement ${event}]`, error);
      }
    }
  };

  const saveTask = (task: Task): Task => {
    const next = { ...task, updatedAt: new Date().toISOString() };
    writeJsonAtomic(join(tasksDir, `${task.id}.json`), next);
    return next;
  };

  const resolve = (input: string): Job => {
    try {
      return store.resolveRef(input);
    } catch (error) {
      if (error instanceof RefError) {
        throw new FactoryError(error.code, error.message, error.code === "ambiguous_ref" ? { matches: error.matches.map(summary) } : undefined);
      }
      throw error;
    }
  };

  const summary = (job: Job): VideoSummary => ({
    id: job.id,
    ref: ref(job),
    status: job.status,
    hook: job.script.hook,
    topic: job.script.topic,
    template: job.script.template,
    lang: job.script.lang,
    ...(job.kind ? { kind: job.kind } : {}),
    durationMs: job.timeline.durationMs,
    voice: job.ttsEngine,
    source: job.source,
    createdAt: job.createdAt,
    publishedAt: job.publishedAt,
    hasVideo: !!job.videoPath && existsSync(job.videoPath),
  });

  const detail = (job: Job): VideoDetail => ({
    ...summary(job),
    caption: job.script.caption,
    hashtags: job.script.hashtags,
    script: job.script,
    videoPath: job.videoPath,
    posted: job.posted,
    error: job.error,
    publishMode: resolveModeFromEnv(env),
    broll: job.broll,
    film: job.film,
  });

  const validate = (req: VideoRequest): VideoRequest => {
    if (req.template !== undefined && !TEMPLATES.includes(req.template)) throw bad(`template doit valoir ${TEMPLATES.join(", ")}.`);
    if (req.lang !== undefined && req.lang !== "fr" && req.lang !== "en") throw bad("lang doit valoir fr ou en.");
    if (req.topic !== undefined && typeof req.topic !== "string") throw bad("topic doit être un texte.");
    const topic = req.topic === undefined ? undefined : cleanTopic(req.topic);
    if (topic !== undefined && topic.length > MAX_TOPIC) throw bad(`Sujet trop long (${topic.length} caractères, ${MAX_TOPIC} maximum).`);

    let durationSec: number | undefined;
    let genre: Genre | undefined;
    try {
      durationSec = req.durationSec === undefined ? undefined : parseDuration(req.durationSec as number | string);
      genre = parseGenre(req.genre as string | undefined);
    } catch (error) {
      throw bad((error as Error).message);
    }
    if (req.orientation !== undefined && !ORIENTATIONS.includes(req.orientation)) throw bad(`orientation doit valoir ${ORIENTATIONS.join(" ou ")}.`);
    if (req.quality !== undefined && !QUALITIES.includes(req.quality)) throw bad(`quality doit valoir ${QUALITIES.join(", ")}.`);

    // Un script qui contient des scènes est un film.
    let script = req.script;
    let film = req.film;
    if (script && typeof script === "object" && Array.isArray((script as { scenes?: unknown }).scenes)) {
      film = script;
      script = undefined;
    }
    if (film !== undefined) {
      if (!film || typeof film !== "object" || Array.isArray(film)) throw bad("film doit être un objet JSON (title, characters, scenes…).");
      const f = normalizeFilm(film, { lang: req.lang ?? cfg.lang, genre });
      if (!f) throw bad("Le film est vide : il faut un title et au moins une scène avec des plans (shots → narration).");
      const issues = lintFilm(f, { targetSec: durationSec });
      if (issues.length) throw bad("Film refusé par le contrôle.", { issues });
    }
    const long = film !== undefined || (durationSec !== undefined && isLongForm(durationSec));
    if (script !== undefined) {
      if (long) throw bad(`Un script H.E.A.T est un format court (60 s au plus). Pour un film, donne un film : {"title", "characters", "scenes": [{"title", "mood", "shots": [{"narration", "speaker", "visual"}]}]}, ou laisse l'usine l'écrire (sans script).`);
      const r = lintScript(script, { topic, template: req.template, lang: req.lang, targetSec: durationSec });
      if (!r.ok) throw bad("Script refusé par le linter viral.", { issues: r.issues });
    }
    return {
      ...req,
      topic: topic || undefined,
      script,
      film,
      durationSec,
      ...(long ? { genre, orientation: req.orientation, quality: req.quality } : { genre: undefined, orientation: undefined, quality: undefined }),
    };
  };

  // Jeter (ou refaire) sous le verrou de publication, job relu : jamais « jetée » pendant qu'elle part, jamais d'écrasement du registre.
  const rejectUnderLock = (job: Job): Job => {
    if (job.status === "publishing") throw new FactoryError("conflict", `Publication de #${ref(job)} en cours : attends la fin.`);
    const release = tryLock(join(store.jobsDir, job.id, "publish.lock"), 15 * 60_000);
    if (!release) throw new FactoryError("conflict", `Publication de #${ref(job)} en cours : attends la fin.`);
    try {
      const fresh = store.getJob(job.id) ?? job;
      if (fresh.status === "published") throw new FactoryError("conflict", `#${ref(fresh)} est déjà publiée.`);
      if (fresh.status === "publishing") throw new FactoryError("conflict", `Publication de #${ref(fresh)} en cours : attends la fin.`);
      const next = { ...fresh, status: "rejected" as const };
      store.saveJob(next);
      return next;
    } finally {
      release();
    }
  };

  function readTask(id: string): Task {
    const path = join(tasksDir, `${id.replace(/[^a-z0-9-]/gi, "")}.json`);
    if (!existsSync(path)) throw new FactoryError("not_found", `Aucune tâche ${id}.`);
    return settle(JSON.parse(readFileSync(path, "utf8")));
  }

  // Les tâches qui tournent dans CE processus peuvent être annulées (annuler une tâche d'un autre processus est impossible d'ici).
  const running = new Map<string, AbortController>();
  const cancelled = new Set<string>();

  const enqueue = (kind: Task["kind"], request: VideoRequest): Task => {
    const now = new Date().toISOString();
    // Le texte d'un film n'est pas recopié dans la tâche : seulement qu'il a été donné.
    const { film: givenFilm, ...light } = request;
    const stored: VideoRequest = givenFilm === undefined ? light : { ...light, filmProvided: true };
    let task = saveTask({ id: randomUUID().slice(0, 8), kind, status: "queued", request: stored, pid: process.pid, host: hostname(), createdAt: now, updatedAt: now });
    const control = new AbortController();
    running.set(task.id, control);
    let lastWrite = 0;
    const progress = (p: TaskProgress & { done?: number; total?: number }) => {
      const next: TaskProgress = { phase: p.phase, percent: p.percent, message: p.message };
      const changed = task.progress?.phase !== next.phase || task.progress?.percent !== next.percent || task.progress?.message !== next.message;
      task = { ...task, progress: next };
      // Au plus une écriture par seconde, sauf changement d'étape ou fin.
      if (changed && (Date.now() - lastWrite > 1000 || next.percent >= 100 || task.progress?.phase !== next.phase)) {
        lastWrite = Date.now();
        task = saveTask(task);
      }
    };
    const run = async () => {
      if (cancelled.delete(task.id)) {
        task = saveTask({ ...task, status: "failed", error: "Fabrication annulée avant de commencer." });
        running.delete(task.id);
        emit("video.failed", { task, error: task.error });
        return;
      }
      task = saveTask({ ...task, status: "running" });
      try {
        const job = await runJob(request, { env, notify, progress, signal: control.signal });
        if (job.status === "failed") {
          task = saveTask({ ...task, status: "failed", jobId: job.id, ref: ref(job), error: job.error });
          emit("video.failed", { video: detail(job), task, error: job.error });
        } else {
          task = saveTask({ ...task, status: "done", jobId: job.id, ref: ref(job) });
          emit("video.ready", { video: detail(job), task });
        }
      } catch (error) {
        const message = control.signal.aborted && !/annul/i.test((error as Error).message) ? "Fabrication annulée." : (error as Error).message;
        task = saveTask({ ...task, status: "failed", error: message });
        emit("video.failed", { task, error: task.error });
      } finally {
        running.delete(task.id);
        cancelled.delete(task.id);
      }
    };
    // Un rendu à la fois : la machine reste utilisable, et rien n'est perdu si personne n'interroge.
    chain = chain.then(run, run);
    return task;
  };

  function lintScript(script: unknown, opts: { topic?: string; template?: TemplateId; lang?: Lang; targetSec?: number } = {}) {
    if (!script || typeof script !== "object" || Array.isArray(script)) throw bad("script doit être un objet JSON (hook, beats, payoff…).");
    // Un film (scènes) se vérifie lui aussi : titre, personnages, durée du texte à voix haute.
    if (Array.isArray((script as { scenes?: unknown }).scenes)) {
      const f = normalizeFilm(script, { lang: opts.lang ?? cfg.lang });
      if (!f) return { ok: false, issues: [{ rule: "film.empty", message: "Le film est vide : il faut un title et au moins une scène avec des plans (shots → narration)." }], durationMs: 0, payoffRatio: 0 };
      const issues = lintFilm(f, { targetSec: opts.targetSec });
      return { ok: issues.length === 0, issues, durationMs: Math.round(estimateFilmSeconds(f) * 1000), payoffRatio: 1 };
    }
    const raw = script as Partial<ViralScript>;
    const r = checkScript(
      { topic: cleanTopic(opts.topic ?? raw.topic ?? ""), lang: opts.lang ?? cfg.lang, template: opts.template ?? "story", formula: "question", targetSec: opts.targetSec },
      raw,
    );
    return { ok: r.issues.length === 0, issues: r.issues, durationMs: r.durationMs, payoffRatio: r.payoffRatio };
  }

  return {
    home: cfg.home,
    store,
    // Les fonctions que l'humain règle d'un clic (voix, WhatsApp, clés, ComfyUI…) : les mêmes pour toutes les portes.
    settings: {
      list: () => features.list(),
      update: (id: string, patch: { enabled?: boolean; values?: Record<string, unknown> }) => features.update(id, patch),
      test: (id: string) => features.test(id),
      async install(id: string): Promise<FeatureView> {
        features.install(id);
        return (await features.list()).find((f) => f.id === id)!;
      },
      autoInstall: (ids: string[]) => features.autoInstall(ids),
    },
    attachHub(h: NotifierHub) {
      hub = h;
    },
    onSettingsChange: (handler: () => void) => features.onChange(handler),
    createVideo: (req: VideoRequest): Task => enqueue("create", validate(req)),
    redo(input: string): Task {
      const found = resolve(input);
      if (found.kind === "long") {
        const r = found.request;
        const req: VideoRequest = { topic: r.topic, lang: r.lang, durationSec: r.durationSec, genre: r.genre as Genre | undefined, orientation: r.orientation as Orientation | undefined, quality: r.quality as Quality | undefined };
        const filmFile = join(found.jobDir, "film.json");
        if (r.filmProvided && existsSync(filmFile)) req.film = JSON.parse(readFileSync(filmFile, "utf8"));
        // Un film « ratée » est REPRIS là où il s'est arrêté (même demande = même dossier) ; un film terminé est jeté puis refait.
        if (found.status !== "failed") rejectUnderLock(found);
        return enqueue("redo", req);
      }
      const job = rejectUnderLock(found);
      return enqueue("redo", { topic: job.script.topic, template: job.script.template, lang: job.script.lang });
    },
    // Annule une tâche de cette usine : en attente, elle ne démarre pas ; en cours, ffmpeg et l'écriture s'arrêtent.
    cancel(id: string): Task {
      const task = readTask(id);
      if (task.status === "done" || task.status === "failed") throw new FactoryError("conflict", `La tâche ${task.id} est déjà terminée (${task.status === "done" ? "réussie" : "ratée"}).`);
      const control = running.get(task.id);
      if (!control) throw new FactoryError("conflict", `La tâche ${task.id} tourne dans un autre processus : annule-la depuis celui-là (ou arrête-le).`);
      if (task.status === "queued") cancelled.add(task.id);
      control.abort();
      return task;
    },
    // Ce que coûterait un film : temps, place disque, et s'il y a la place.
    estimate(q: { durationSec: number | string; quality?: Quality }) {
      let durationSec: number;
      try {
        durationSec = parseDuration(q.durationSec);
      } catch (error) {
        throw bad((error as Error).message);
      }
      const quality = q.quality ?? "standard";
      if (!QUALITIES.includes(quality)) throw bad(`quality doit valoir ${QUALITIES.join(", ")}.`);
      const need = checkDisk(cfg.home, durationSec, quality);
      return { durationSec, quality, long: isLongForm(durationSec), estMinutes: estimateRenderMinutes(durationSec, quality), diskMb: need.needMb, finalMb: estimateDisk(durationSec, quality).finalMb, freeMb: need.freeMb, ok: need.ok, message: need.message };
    },
    getTask: readTask,
    listTasks(): Task[] {
      return readdirSync(tasksDir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => settle(JSON.parse(readFileSync(join(tasksDir, f), "utf8")) as Task))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    idle: async (): Promise<void> => {
      let current: Promise<unknown>;
      do {
        current = chain;
        await current;
      } while (current !== chain);
    },
    listVideos(q: { status?: JobStatus; limit?: number } = {}): VideoSummary[] {
      const limit = q.limit ?? 20;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw bad("limit doit être un entier entre 1 et 100.");
      return store
        .listJobs()
        .filter((j) => !q.status || j.status === q.status)
        .slice(0, limit)
        .map(summary);
    },
    getVideo: (input: string): VideoDetail => detail(resolve(input)),
    videoFile(input: string): string {
      const job = resolve(input);
      if (!job.videoPath || !existsSync(job.videoPath)) throw new FactoryError("not_found", `Le fichier vidéo de #${ref(job)} n'existe pas (ou plus).`);
      return job.videoPath;
    },
    lintScript,
    // La même règle partout : la phrase « OUI #ref » de CETTE vidéo, tapée par un humain.
    async publish(input: string, confirm: string) {
      const job = resolve(input);
      const said = CONFIRM.exec(confirm ?? "")?.[1];
      let confirmed: Job | undefined;
      try {
        confirmed = said ? store.resolveRef(said) : undefined;
      } catch {
        confirmed = undefined;
      }
      if (confirmed?.id !== job.id) {
        throw new FactoryError("confirmation_required", `Pour publier, il faut la confirmation exacte « OUI #${ref(job)} ».`, { expected: `OUI #${ref(job)}` });
      }
      if (job.status === "published") throw new FactoryError("conflict", `#${ref(job)} est déjà publiée.`);
      if (job.status === "rejected") throw new FactoryError("conflict", `#${ref(job)} a été jetée.`);
      if (job.status === "failed" || !job.videoPath) throw new FactoryError("conflict", `#${ref(job)} n'a pas de vidéo à publier.`);
      if (!existsSync(job.videoPath)) throw new FactoryError("conflict", `Le fichier vidéo de #${ref(job)} n'existe plus (${job.videoPath}) : refais-la (Refaire) avant de publier.`);

      const messages: string[] = [];
      let manualText: string | undefined;
      await publishWithLedger(job, {
        store,
        notify: async (text) => void messages.push(text),
        publish: async (j) => {
          const r = await publishImpl(j);
          manualText = r.manualText;
          return r;
        },
      });
      const after = store.getJob(job.id) ?? job;
      const message = messages.at(-1) ?? "";
      if (after.status !== "published" && /déjà en cours/.test(message)) throw new FactoryError("conflict", message);
      if (after.status === "published") {
        await notify(message).catch(() => undefined);
        emit("video.published", { video: detail(after) });
      }
      return { ref: ref(after), status: after.status, posted: after.posted, manualText, message };
    },
    reject(input: string): VideoSummary {
      const next = rejectUnderLock(resolve(input));
      emit("video.rejected", { video: detail(next) });
      return summary(next);
    },
    // Une porte qui agit hors de la fabrique (WhatsApp) prévient quand même les autres logiciels.
    announce(event: FactoryEvent, input: string): void {
      emit(event, { video: detail(resolve(input)) });
    },
    doctor: async () => diagnose(await (partial.probe ?? (() => realProbe(cfg, env)))(), { docker: !!env.SEPTIM_IN_DOCKER, envFile: resolvePath(env.SEPTIM_ROOT ?? process.cwd(), ".env") }),
    lessons() {
      const path = join(cfg.home, "LESSONS.md");
      const arms = Object.entries(store.loadState().bandit ?? {})
        .map(([arm, { alpha, beta }]) => ({ arm, alpha, beta, mean: alpha / (alpha + beta) }))
        .sort((a, b) => b.mean - a.mean);
      return { text: existsSync(path) ? readFileSync(path, "utf8") : "", arms };
    },
    on(event: FactoryEvent, handler: (p: EventPayload) => void): () => void {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
      return () => void handlers.get(event)!.delete(handler);
    },
  };
}

export type Factory = ReturnType<typeof createFactory>;
