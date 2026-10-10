import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { loadConfig, type Env } from "./config";
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
export type VideoRequest = { topic?: string; template?: TemplateId; lang?: Lang; script?: Partial<ViralScript>; brollDir?: string };

export type Task = {
  id: string;
  kind: "create" | "redo";
  status: "queued" | "running" | "done" | "failed";
  request: VideoRequest;
  jobId?: string;
  ref?: string;
  error?: string;
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
  });

  const validate = (req: VideoRequest): VideoRequest => {
    if (req.template !== undefined && !TEMPLATES.includes(req.template)) throw bad(`template doit valoir ${TEMPLATES.join(", ")}.`);
    if (req.lang !== undefined && req.lang !== "fr" && req.lang !== "en") throw bad("lang doit valoir fr ou en.");
    if (req.topic !== undefined && typeof req.topic !== "string") throw bad("topic doit être un texte.");
    const topic = req.topic === undefined ? undefined : cleanTopic(req.topic);
    if (topic !== undefined && topic.length > MAX_TOPIC) throw bad(`Sujet trop long (${topic.length} caractères, ${MAX_TOPIC} maximum).`);
    if (req.script !== undefined) {
      const r = lintScript(req.script, { topic, template: req.template, lang: req.lang });
      if (!r.ok) throw bad("Script refusé par le linter viral.", { issues: r.issues });
    }
    return { ...req, topic: topic || undefined };
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

  const enqueue = (kind: Task["kind"], request: VideoRequest): Task => {
    const now = new Date().toISOString();
    let task = saveTask({ id: randomUUID().slice(0, 8), kind, status: "queued", request, pid: process.pid, host: hostname(), createdAt: now, updatedAt: now });
    const run = async () => {
      task = saveTask({ ...task, status: "running" });
      try {
        const job = await runJob(request, { env, notify });
        if (job.status === "failed") {
          task = saveTask({ ...task, status: "failed", jobId: job.id, ref: ref(job), error: job.error });
          emit("video.failed", { video: detail(job), task, error: job.error });
        } else {
          task = saveTask({ ...task, status: "done", jobId: job.id, ref: ref(job) });
          emit("video.ready", { video: detail(job), task });
        }
      } catch (error) {
        task = saveTask({ ...task, status: "failed", error: (error as Error).message });
        emit("video.failed", { task, error: task.error });
      }
    };
    // Un rendu à la fois : la machine reste utilisable, et rien n'est perdu si personne n'interroge.
    chain = chain.then(run, run);
    return task;
  };

  function lintScript(script: unknown, opts: { topic?: string; template?: TemplateId; lang?: Lang } = {}) {
    if (!script || typeof script !== "object" || Array.isArray(script)) throw bad("script doit être un objet JSON (hook, beats, payoff…).");
    const raw = script as Partial<ViralScript>;
    const r = checkScript(
      { topic: cleanTopic(opts.topic ?? raw.topic ?? ""), lang: opts.lang ?? cfg.lang, template: opts.template ?? "story", formula: "question" },
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
      const job = rejectUnderLock(resolve(input));
      return enqueue("redo", { topic: job.script.topic, template: job.script.template, lang: job.script.lang });
    },
    getTask(id: string): Task {
      const path = join(tasksDir, `${id.replace(/[^a-z0-9-]/gi, "")}.json`);
      if (!existsSync(path)) throw new FactoryError("not_found", `Aucune tâche ${id}.`);
      return settle(JSON.parse(readFileSync(path, "utf8")));
    },
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
