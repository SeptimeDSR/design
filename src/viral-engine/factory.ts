import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { loadConfig, type Env } from "./config";
import { publishWithLedger } from "./daemon";
import { diagnose, probe as realProbe, type Probes } from "./doctor";
import { FactoryError } from "./errors";
import { writeJsonAtomic } from "./lock";
import { jobRef } from "./message";
import { checkScript, cleanTopic, runJob as realRunJob, type JobRequest, type PipelineDeps } from "./pipeline";
import { publishJob, type PublishResult } from "./publish";
import { resolveModeFromEnv } from "./publish-mode";
import { createStore, RefError, type Job, type JobStatus } from "./store";
import { TEMPLATES, type Lang, type TemplateId, type ViralScript } from "./types";

export type VideoRequest = { topic?: string; template?: TemplateId; lang?: Lang; script?: Partial<ViralScript> };

export type Task = {
  id: string;
  kind: "create" | "redo";
  status: "queued" | "running" | "done" | "failed";
  request: VideoRequest;
  jobId?: string;
  ref?: string;
  error?: string;
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
  const publishImpl = partial.publish ?? ((job: Job) => publishJob(job, resolveModeFromEnv(env), cfg.platforms, cfg.tiktokMethod));
  const handlers = new Map<FactoryEvent, Set<(p: EventPayload) => void>>();
  let chain: Promise<unknown> = Promise.resolve();

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

  const resolve = (ref: string): Job => {
    try {
      return store.resolveRef(ref);
    } catch (error) {
      if (error instanceof RefError) {
        throw new FactoryError(error.code, error.message, error.code === "ambiguous_ref" ? { matches: error.matches.map(summary) } : undefined);
      }
      throw error;
    }
  };

  const summary = (job: Job): VideoSummary => ({
    id: job.id,
    ref: jobRef(job),
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

  const enqueue = (kind: Task["kind"], request: VideoRequest): Task => {
    const now = new Date().toISOString();
    let task = saveTask({ id: randomUUID().slice(0, 8), kind, status: "queued", request, createdAt: now, updatedAt: now });
    const run = async () => {
      task = saveTask({ ...task, status: "running" });
      try {
        const job = await runJob(request, { env, notify });
        if (job.status === "failed") {
          task = saveTask({ ...task, status: "failed", jobId: job.id, ref: jobRef(job), error: job.error });
          emit("video.failed", { video: detail(job), task, error: job.error });
        } else {
          task = saveTask({ ...task, status: "done", jobId: job.id, ref: jobRef(job) });
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
    createVideo: (req: VideoRequest): Task => enqueue("create", validate(req)),
    redo(ref: string): Task {
      const job = resolve(ref);
      if (job.status === "published") throw new FactoryError("conflict", `#${jobRef(job)} est déjà publiée.`);
      store.saveJob({ ...job, status: "rejected" });
      return enqueue("redo", { topic: job.script.topic, template: job.script.template, lang: job.script.lang });
    },
    getTask(id: string): Task {
      const path = join(tasksDir, `${id.replace(/[^a-z0-9-]/gi, "")}.json`);
      if (!existsSync(path)) throw new FactoryError("not_found", `Aucune tâche ${id}.`);
      return JSON.parse(readFileSync(path, "utf8"));
    },
    listTasks(): Task[] {
      return readdirSync(tasksDir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => JSON.parse(readFileSync(join(tasksDir, f), "utf8")) as Task)
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
    getVideo: (ref: string): VideoDetail => detail(resolve(ref)),
    videoFile(ref: string): string {
      const job = resolve(ref);
      if (!job.videoPath || !existsSync(job.videoPath)) throw new FactoryError("not_found", `Le fichier vidéo de #${jobRef(job)} n'existe pas (ou plus).`);
      return job.videoPath;
    },
    lintScript,
    // La même règle partout : la phrase « OUI #ref » de CETTE vidéo, tapée par un humain.
    async publish(ref: string, confirm: string) {
      const job = resolve(ref);
      const said = CONFIRM.exec(confirm ?? "")?.[1];
      let confirmed: Job | undefined;
      try {
        confirmed = said ? store.resolveRef(said) : undefined;
      } catch {
        confirmed = undefined;
      }
      if (confirmed?.id !== job.id) {
        throw new FactoryError("confirmation_required", `Pour publier, il faut la confirmation exacte « OUI #${jobRef(job)} ».`, { expected: `OUI #${jobRef(job)}` });
      }
      if (job.status === "published") throw new FactoryError("conflict", `#${jobRef(job)} est déjà publiée.`);
      if (job.status === "rejected") throw new FactoryError("conflict", `#${jobRef(job)} a été jetée.`);
      if (job.status === "failed" || !job.videoPath) throw new FactoryError("conflict", `#${jobRef(job)} n'a pas de vidéo à publier.`);

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
      return { ref: jobRef(after), status: after.status, posted: after.posted, manualText, message };
    },
    reject(ref: string): VideoSummary {
      const job = resolve(ref);
      if (job.status === "published") throw new FactoryError("conflict", `#${jobRef(job)} est déjà publiée.`);
      const next = { ...job, status: "rejected" as const };
      store.saveJob(next);
      emit("video.rejected", { video: detail(next) });
      return summary(next);
    },
    doctor: async () => diagnose(await (partial.probe ?? (() => realProbe(cfg, env)))(), { envFile: resolvePath(env.SEPTIM_ROOT ?? process.cwd(), ".env") }),
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
