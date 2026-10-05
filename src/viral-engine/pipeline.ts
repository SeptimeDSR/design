import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { allArms, armKey, chooseArm, parseArm } from "./bandit";
import { loadConfig, type Env, type ViralConfig } from "./config";
import { writeAmbient } from "./ambient";
import { generateScript, type LlmClient } from "./llm";
import { formatFailedMessage, formatReadyMessage } from "./message";
import { resolvePublishMode } from "./publish-plan";
import { segmentTexts, buildTimeline } from "./story";
import { createStore, type Job } from "./store";
import { fetchTrends, pickTrend } from "./trends";
import { synthesize, detectEngine } from "./tts";
import { FORMULAS, type Lang, type TemplateId } from "./types";
import type { ViralProps } from "../remotion/viral/props";

export type JobRequest = { topic?: string; template?: TemplateId; lang?: Lang };

export type PipelineDeps = {
  env: Env;
  fetchImpl: typeof fetch;
  llm: LlmClient["chat"];
  render: (job: Job, props: ViralProps, jobDir: string) => Promise<string>;
  notify: (text: string, mediaPath?: string) => Promise<void>;
  hasPostizCredentials: boolean;
};

const PREFIXES = /^(je veux|j'aimerais|fais(-moi)?|crée|cree|make|create)\s+(une?|la|le|a|an|the)?\s*(histoire|vidéo|video|story)\s+(sur|about|de|on)\s+/i;

export function cleanTopic(raw: string): string {
  return raw.trim().replace(/^[«"“'\s]+|[»"”'\s]+$/g, "").replace(PREFIXES, "").trim();
}

function chooseArmFor(state: ReturnType<ReturnType<typeof createStore>["loadState"]>, template?: TemplateId): string {
  const arms = template ? FORMULAS.map((f) => armKey(template, f)) : allArms();
  return chooseArm(state.bandit, arms);
}

export async function runJob(req: JobRequest, partial: Partial<PipelineDeps> = {}): Promise<Job> {
  const env = partial.env ?? process.env;
  const cfg: ViralConfig = loadConfig(env);
  const store = createStore(cfg.home);
  const state = store.loadState();
  const lang = req.lang ?? cfg.lang;

  const trend = req.topic ? undefined : pickTrend(await fetchTrends(cfg, partial.fetchImpl ?? fetch), state.recentTopics);
  const topic = req.topic ? cleanTopic(req.topic) : trend!.title;
  const arm = chooseArmFor(state, req.template);
  const { template, formula } = parseArm(arm);

  const llm = partial.llm ? { chat: partial.llm } : undefined;
  const { script, source } = await generateScript({ topic, lang, template, formula, trend: trend?.sound ?? trend?.title }, cfg, llm);

  const id = randomBytes(4).toString("hex");
  const jobDir = join(store.jobsDir, id);
  mkdirSync(join(jobDir, "voice"), { recursive: true });

  // Une piste par segment : la timeline suit les vraies durées de la voix.
  const engine = await detectEngine(lang, env.VIRAL_TTS ?? cfg.tts);
  const voices = [];
  for (const [i, seg] of segmentTexts(script).entries()) {
    voices.push(await synthesize(seg.text, { lang, engine, outPath: join(jobDir, "voice", `${String(i).padStart(2, "0")}.wav`) }));
  }
  const timeline = buildTimeline(script, voices.map((v) => v.durationMs));
  await writeAmbient(join(jobDir, "ambient.wav"), Math.ceil(timeline.durationMs / 1000) + 2);

  const job: Job = {
    id,
    createdAt: new Date().toISOString(),
    status: "rendered",
    request: req,
    script,
    timeline,
    arm,
    source,
    ttsEngine: voices[0]?.engine ?? engine,
    trend,
    jobDir,
  };

  const props: ViralProps = {
    script,
    timeline,
    audio: {
      segments: timeline.segments.map((s, i) => ({ src: `viral/${id}/voice/${String(i).padStart(2, "0")}.wav`, startMs: s.startMs })),
      ambient: `viral/${id}/ambient.wav`,
    },
  };

  const notify = partial.notify ?? (async (text: string) => console.log(text));
  const mode = resolvePublishMode(env, partial.hasPostizCredentials ?? false);
  try {
    const render = partial.render ?? (await import("./render")).renderWithRemotion;
    job.videoPath = await render(job, props, jobDir);
    store.saveJob(job);
    await notify(formatReadyMessage(job, mode), job.videoPath);
    job.status = "notified";
  } catch (error) {
    job.status = "failed";
    job.error = (error as Error).message;
    await notify(formatFailedMessage(job)).catch(() => undefined);
  }
  store.saveJob(job);
  store.saveState({ ...state, recentTopics: [topic, ...state.recentTopics].slice(0, 30) });
  return job;
}
