import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { parseReply } from "./approval";
import { rewardFromViews, updateArm } from "./bandit";
import { loadConfig } from "./config";
import { BOT_PREFIX, jobRef } from "./message";
import type { PublishMode, Platform } from "./publish-plan";
import type { JobRequest } from "./pipeline";
import type { Job, Store } from "./store";

export type DaemonDeps = {
  store: Store;
  mode: PublishMode;
  notify: (text: string, mediaPath?: string) => Promise<void>;
  publish: (job: Job) => Promise<{ postIds: string[]; missing: Platform[]; manualText?: string }>;
  runJob: (req: JobRequest) => Promise<Job>;
  views: (job: Job) => Promise<number | null>;
};

const REWARD_DELAY_MS = 48 * 3600_000;

export async function handleReply(text: string, deps: DaemonDeps): Promise<void> {
  const { intent, jobRef: ref } = parseReply(text);
  if (intent === "unknown") return;

  const job = ref ? deps.store.findJob(ref) : deps.store.latestJob("notified");
  if (!job) {
    await deps.notify(`${BOT_PREFIX} · Aucune vidéo en attente${ref ? ` pour #${ref}` : ""}.`);
    return;
  }
  if (job.status !== "notified") {
    await deps.notify(`${BOT_PREFIX} · #${jobRef(job)} est déjà ${job.status === "published" ? "publiée" : "traitée"}.`);
    return;
  }

  if (intent === "publish") {
    try {
      const r = await deps.publish(job);
      deps.store.saveJob({ ...job, status: "published", publishMode: deps.mode, postIds: r.postIds });
      if (r.manualText) {
        await deps.notify(`${BOT_PREFIX} · Légende prête #${jobRef(job)}, colle-la et ajoute le son tendance :\n\n${r.manualText}`);
      } else {
        const missing = r.missing.length ? `\nPas connecté dans Postiz : ${r.missing.join(", ")}.` : "";
        await deps.notify(`${BOT_PREFIX} · Publié ✅ #${jobRef(job)} (${r.postIds.length} plateforme${r.postIds.length > 1 ? "s" : ""}).${missing}`);
      }
    } catch (error) {
      await deps.notify(`${BOT_PREFIX} · Publication ratée #${jobRef(job)} : ${(error as Error).message}. Réponds OUI pour réessayer.`);
    }
    return;
  }

  if (intent === "reject") {
    deps.store.saveJob({ ...job, status: "rejected" });
    await deps.notify(`${BOT_PREFIX} · Jetée 🗑️ #${jobRef(job)}.`);
    return;
  }

  if (intent === "redo") {
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
      `Alternative gratuite : la version Remotion est déjà prête, réponds OUI pour la publier.`,
  );
}

// Auto-amélioration : 48 h après publication, les vues récompensent (ou pas) le couple template × formule.
export async function collectRewards(deps: DaemonDeps, now = Date.now()): Promise<void> {
  const state = deps.store.loadState();
  for (const job of deps.store.listJobs()) {
    if (job.status !== "published" || job.rewarded || now - Date.parse(job.createdAt) < REWARD_DELAY_MS) continue;
    const views = await deps.views(job);
    if (views === null) continue;
    const reward = rewardFromViews(views, state.viewsHistory);
    state.bandit = updateArm(state.bandit, job.arm, reward);
    state.viewsHistory = [...state.viewsHistory, views].slice(-100);
    deps.store.saveJob({ ...job, views, rewarded: true });
    appendFileSync(
      join(deps.store.home, "LESSONS.md"),
      `- ${new Date(now).toISOString().slice(0, 10)} · ${job.arm} · « ${job.script.hook} » → ${views} vues (${reward ? "au-dessus" : "en dessous"} de la médiane)\n`,
    );
  }
  deps.store.saveState(state);
}

async function main() {
  const cron = (await import("node-cron")).default;
  const { createStore } = await import("./store");
  const { createNotifier } = await import("./notify");
  const { runJob } = await import("./pipeline");
  const { publishJob, fetchJobViews, hasPostizCredentials } = await import("./publish");
  const { resolvePublishMode } = await import("./publish-plan");

  const cfg = loadConfig();
  const store = createStore(cfg.home);
  const notifier = createNotifier(cfg.notifier, cfg);
  const mode = resolvePublishMode(process.env, hasPostizCredentials());
  const notify = (t: string, m?: string) => notifier.send(t, m);
  let busy = false;
  const cycle = async (req: JobRequest = {}) => {
    if (busy) return store.latestJob()!;
    busy = true;
    try {
      return await runJob(req, { notify, hasPostizCredentials: mode !== "manual" });
    } finally {
      busy = false;
    }
  };
  const deps: DaemonDeps = {
    store,
    mode,
    notify,
    publish: (job) => publishJob(job, mode, cfg.platforms, cfg.tiktokMethod),
    runJob: cycle,
    views: (job) => fetchJobViews(job),
  };

  await notifier.start();
  notifier.onMessage((text) => void handleReply(text, deps).catch((e) => console.error("[réponse]", e)));
  cron.schedule(cfg.cron, () => void cycle().catch((e) => console.error("[cycle]", e)));
  cron.schedule("0 9 * * *", () => void collectRewards(deps).catch((e) => console.error("[analytics]", e)));
  console.log(`SEPTIM-VIRAL-OS en marche · cycle « ${cfg.cron} » · publication ${mode} · notifications ${cfg.notifier}`);
  if (process.argv.includes("--now")) await cycle();
}

if (process.argv[1]?.endsWith("daemon.ts")) main();
