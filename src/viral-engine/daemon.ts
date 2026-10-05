import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { parseReply } from "./approval";
import { rewardFromViews, updateArm } from "./bandit";
import { loadConfig, loadDotEnv } from "./config";
import { tryLock } from "./lock";
import { BOT_PREFIX, jobRef } from "./message";
import type { Platform, PublishMode } from "./publish-plan";
import type { JobRequest } from "./pipeline";
import { RefError, type Job, type Store } from "./store";
import type { PublishResult } from "./publish";

export type { PublishResult };

export type DaemonDeps = {
  store: Store;
  mode: PublishMode;
  platforms: Platform[];
  notify: (text: string, mediaPath?: string) => Promise<void>;
  publish: (job: Job) => Promise<PublishResult>;
  runJob: (req: JobRequest) => Promise<Job>;
  views: (job: Job) => Promise<number | null>;
};

const REWARD_DELAY_MS = 48 * 3600_000;
const STALE_PUBLISHING_MS = 15 * 60_000;
const inFlight = new Set<string>();

const isStalePublishing = (job: Job, now = Date.now()) =>
  job.status === "publishing" && !inFlight.has(job.id) && now - Date.parse(job.publishingSince ?? job.createdAt) > STALE_PUBLISHING_MS;

const pendingJobs = (store: Store) => store.listJobs().filter((j) => j.status === "notified" || isStalePublishing(j));

const describe = (jobs: Job[]) => jobs.map((j) => `#${jobRef(j)} « ${j.script.hook} »`).join("\n");

export type ReplyContext = { quoted?: string };

// Seule une réponse nette, rattachée à UNE vidéo, déclenche quelque chose.
export async function handleReply(text: string, deps: DaemonDeps, ctx: ReplyContext = {}): Promise<void> {
  const reply = parseReply(text);
  const pending = pendingJobs(deps.store);

  if (reply.intent === "unknown") {
    if (reply.looksLikeApproval && pending.length) {
      const hint = pending.length === 1 ? `OUI #${jobRef(pending[0])}` : `OUI #xxxx (${pending.map((j) => `#${jobRef(j)}`).join(", ")})`;
      await deps.notify(`${BOT_PREFIX} · Je n'ai rien publié. Pour publier, réponds exactement ${hint}.`);
    }
    return;
  }

  const ref = reply.jobRef ?? ctx.quoted?.match(/#([0-9a-f]{4,})/i)?.[1]?.toLowerCase();
  let job: Job | undefined;
  if (ref) {
    // Deux vidéos qui commencent par les mêmes caractères : on demande, on ne devine jamais.
    try {
      job = deps.store.resolveRef(ref);
    } catch (error) {
      if (error instanceof RefError && error.code === "ambiguous_ref") {
        await deps.notify(`${BOT_PREFIX} · Je n'ai rien publié. ${error.message}`);
        return;
      }
      job = undefined;
    }
  } else if (pending.length > 1) {
    await deps.notify(`${BOT_PREFIX} · Plusieurs vidéos attendent, dis-moi laquelle (réponds par exemple OUI #${jobRef(pending[0])}) :\n${describe(pending)}`);
    return;
  } else {
    job = pending[0];
  }

  if (!job) {
    await deps.notify(`${BOT_PREFIX} · Aucune vidéo en attente${ref ? ` pour #${ref}` : ""}.`);
    return;
  }
  if (job.status === "published") {
    await deps.notify(`${BOT_PREFIX} · #${jobRef(job)} est déjà publiée.`);
    return;
  }
  if (inFlight.has(job.id) || (job.status === "publishing" && !isStalePublishing(job))) {
    await deps.notify(`${BOT_PREFIX} · Publication de #${jobRef(job)} déjà en cours.`);
    return;
  }
  if (job.status !== "notified" && !isStalePublishing(job)) {
    await deps.notify(`${BOT_PREFIX} · #${jobRef(job)} est déjà traitée.`);
    return;
  }

  if (reply.intent === "publish") return publishWithLedger(job, deps);

  if (reply.intent === "reject") {
    deps.store.saveJob({ ...job, status: "rejected" });
    await deps.notify(`${BOT_PREFIX} · Jetée 🗑️ #${jobRef(job)}.`);
    return;
  }

  if (reply.intent === "redo") {
    deps.store.saveJob({ ...job, status: "rejected" });
    await deps.notify(`${BOT_PREFIX} · Je refais une version sur « ${job.script.topic} »…`);
    await deps.runJob({ topic: job.script.topic, template: job.script.template, lang: job.script.lang });
    return;
  }

  // PRO : le démon ne dépense jamais de crédits, il annonce le coût et renvoie vers Claude Code.
  const seconds = Math.round(job.timeline.durationMs / 1000);
  const dollars = ((seconds / 10) * 3).toFixed(0);
  await deps.notify(
    `${BOT_PREFIX} · BESOIN CREDIT : Higgsfield Soul + Seedance pour #${jobRef(job)} (${seconds} s ≈ ${dollars} $ de crédits). ` +
      `Je ne dépense rien tout seul : lance /septim-viral:viral "${job.script.topic}" en PRO dans Claude Code. ` +
      `Alternative gratuite : la version Remotion est déjà prête, réponds OUI #${jobRef(job)} pour la publier.`,
  );
}

// Même chemin pour toutes les portes (WhatsApp, CLI, Studio, API, MCP) : verrou de fichier entre processus,
// job relu sous verrou, statut persistant, registre par plateforme.
export async function publishWithLedger(stale: Job, deps: Pick<DaemonDeps, "store" | "notify" | "publish">): Promise<void> {
  if (inFlight.has(stale.id)) return;
  const release = tryLock(join(deps.store.jobsDir, stale.id, "publish.lock"), STALE_PUBLISHING_MS);
  if (!release) {
    await deps.notify(`${BOT_PREFIX} · Publication de #${jobRef(stale)} déjà en cours.`);
    return;
  }
  inFlight.add(stale.id);
  try {
    const job = deps.store.getJob(stale.id) ?? stale;
    if (job.status === "published") {
      await deps.notify(`${BOT_PREFIX} · #${jobRef(job)} est déjà publiée.`);
      return;
    }
    deps.store.saveJob({ ...job, status: "publishing", publishingSince: new Date().toISOString() });
    try {
      const r = await deps.publish(job);
      const posted = { ...job.posted, ...r.posted };
      const done = Object.keys(posted);
      if (r.manualText) {
        deps.store.saveJob({ ...job, status: "published", posted, publishedAt: new Date().toISOString() });
        await deps.notify(`${BOT_PREFIX} · Légende prête #${jobRef(job)}, colle-la et ajoute le son tendance :\n\n${r.manualText}`);
      } else if (r.failed.length) {
        deps.store.saveJob({ ...job, status: "notified", posted });
        const failed = r.failed.map((f) => `${f.platform} (${f.error})`).join(", ");
        await deps.notify(
          `${BOT_PREFIX} · Publication partielle #${jobRef(job)}. Déjà en ligne : ${done.join(", ") || "rien"}. Échec : ${failed}. ` +
            `Réponds OUI #${jobRef(job)} pour réessayer seulement ce qui a échoué.`,
        );
      } else {
        deps.store.saveJob({ ...job, status: "published", posted, publishedAt: new Date().toISOString() });
        const missing = r.missing.length ? `\nPas connecté dans Postiz : ${r.missing.join(", ")}.` : "";
        await deps.notify(`${BOT_PREFIX} · Publié ✅ #${jobRef(job)} sur ${done.join(", ")}.${missing}`);
      }
    } catch (error) {
      deps.store.saveJob({ ...job, status: "notified" });
      await deps.notify(`${BOT_PREFIX} · Publication ratée #${jobRef(job)} : ${(error as Error).message}. Réponds OUI #${jobRef(job)} pour réessayer.`);
    }
  } finally {
    inFlight.delete(stale.id);
    release();
  }
}

// File d'attente : un REFAIS ou un cycle qui tombe pendant un rendu passe juste après, jamais perdu.
export function createCycleRunner(run: (req: JobRequest) => Promise<Job>, notify: (text: string) => Promise<void>) {
  let chain: Promise<unknown> = Promise.resolve();
  let pending = 0;
  const runner = async (req: JobRequest): Promise<Job> => {
    if (pending > 0) await notify(`${BOT_PREFIX} · Une vidéo est en cours de fabrication, je fais la tienne juste après.`);
    pending++;
    const p = chain.then(() => run(req)).finally(() => pending--);
    chain = p.catch(() => undefined);
    return p;
  };
  return Object.assign(runner, { get pending() {
    return pending;
  } });
}

// Auto-amélioration : 48 h après la publication, les vues récompensent (ou pas) le couple template × formule.
export async function collectRewards(deps: DaemonDeps, now = Date.now()): Promise<void> {
  const rewards: { job: Job; views: number }[] = [];
  for (const job of deps.store.listJobs()) {
    const since = Date.parse(job.publishedAt ?? job.createdAt);
    if (job.status !== "published" || job.rewarded || now - since < REWARD_DELAY_MS) continue;
    const views = await deps.views(job);
    if (views !== null) rewards.push({ job, views });
  }
  if (!rewards.length) return;
  // Mise à jour sous verrou : un rendu qui se termine en même temps n'efface pas ces récompenses.
  await deps.store.updateState((state) => {
    for (const { job, views } of rewards) {
      const reward = rewardFromViews(views, state.viewsHistory);
      state = { ...state, bandit: updateArm(state.bandit, job.arm, reward), viewsHistory: [...state.viewsHistory, views].slice(-100) };
      deps.store.saveJob({ ...job, views, rewarded: true });
      appendFileSync(
        join(deps.store.home, "LESSONS.md"),
        `- ${new Date(now).toISOString().slice(0, 10)} · ${job.arm} · « ${job.script.hook} » → ${views} vues (${reward ? "au-dessus" : "en dessous"} de la médiane)\n`,
      );
    }
    return state;
  });
}

// septim start : un seul processus possède WhatsApp et la file de rendu ; le Studio, l'API et le MCP HTTP tournent avec lui.
export async function runDaemon(): Promise<void> {
  loadDotEnv();
  const cron = (await import("node-cron")).default;
  const { createStore } = await import("./store");
  const { createNotifier } = await import("./notify");
  const { publishJob, fetchJobViews } = await import("./publish");
  const { resolveModeFromEnv } = await import("./publish-mode");
  const { flushOutbox } = await import("./outbox");
  const { createFactory } = await import("./factory");
  const { attachWebhooks } = await import("./webhooks");

  const cfg = loadConfig();
  const store = createStore(cfg.home);
  const notifier = createNotifier(cfg.notifier, cfg);
  const mode = resolveModeFromEnv();
  const notify = (t: string, m?: string) => notifier.send(t, m);
  // Toutes les portes (cycle, REFAIS, Studio, API, MCP) passent par la même file de la fabrique : un rendu à la fois.
  const factory = createFactory({ notify });
  attachWebhooks(factory);
  const render = async (req: JobRequest): Promise<Job> => {
    const task = factory.createVideo({ topic: req.topic, template: req.template, lang: req.lang, script: req.script });
    await factory.idle();
    const done = factory.getTask(task.id);
    const job = done.jobId ? store.getJob(done.jobId) : undefined;
    if (!job) throw new Error(done.error ?? "rendu raté");
    return job;
  };
  const runner = createCycleRunner(render, notify);
  const deps: DaemonDeps = {
    store,
    mode,
    platforms: cfg.platforms,
    notify,
    publish: (job) => publishJob(job, mode, cfg.platforms, cfg.tiktokMethod),
    runJob: runner,
    views: (job) => fetchJobViews(job),
  };

  await notifier.start();
  notifier.onMessage((text, meta) => void handleReply(text, deps, { quoted: meta?.quoted }).catch((e) => console.error("[réponse]", e)));
  // Le CLI dépose ses messages dans la boîte d'envoi : le démon est le seul à parler à WhatsApp.
  const drain = () => void flushOutbox(store.home, notify).catch((e) => console.error("[boîte d'envoi]", e));
  drain();
  setInterval(drain, 15_000);
  cron.schedule(cfg.cron, () => {
    if (runner.pending === 0) void runner({}).catch((e) => console.error("[cycle]", e));
  });
  cron.schedule("0 9 * * *", () => void collectRewards(deps).catch((e) => console.error("[analytics]", e)));
  console.log(`SEPTIM-VIRAL-OS en marche · cycle « ${cfg.cron} » · publication ${mode} · notifications ${cfg.notifier}`);

  const port = Number(process.env.SEPTIM_PORT ?? 4321);
  if (port !== 0) {
    const { startServer } = await import("./server/http");
    const { mcpHttpHandler } = await import("./mcp");
    const corsOrigins = (process.env.SEPTIM_CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    try {
      const srv = await startServer({ factory, port, host: process.env.SEPTIM_HOST, token: process.env.SEPTIM_TOKEN, corsOrigins, mcp: mcpHttpHandler(factory) });
      console.log(`Studio, API et MCP HTTP : ${srv.url}${process.env.SEPTIM_TOKEN ? "/?token=…" : ""}`);
    } catch (error) {
      // WhatsApp et le cycle continuent : seul le serveur manque.
      console.error(`[serveur] ${(error as Error).message}`);
    }
  }
  if (process.argv.includes("--now")) await runner({});
}

if (process.argv[1]?.endsWith("daemon.ts")) void runDaemon();
