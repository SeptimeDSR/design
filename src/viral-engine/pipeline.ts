import { randomBytes } from "node:crypto";
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { extname } from "node:path";
import { join } from "node:path";
import { allArms, armKey, chooseArm, parseArm } from "./bandit";
import { loadConfig, type Env, type ViralConfig } from "./config";
import { writeAmbient } from "./ambient";
import { gatherBroll, type BrollResult } from "./broll";
import { pickTrack } from "./music";
import { SFX_FILES, writeSfx } from "./sfx";
import { SFX_VOLUME, sfxCues } from "../remotion/viral/layout";
import { assembleScript, generateScript, type LlmClient, type ScriptInput } from "./llm";
import { formatFailedMessage, formatReadyMessage } from "./message";
import { resolvePublishMode } from "./publish-plan";
import { hasPostizCredentials } from "./publish";
import { segmentTexts, buildTimeline, lintScript } from "./story";
import { createStore, type Job } from "./store";
import { fetchTrends, pickTrend } from "./trends";
import { synthesize, detectEngine } from "./tts";
import { FORMULAS, type Lang, type TemplateId, type Timeline, type ViralScript } from "./types";
import type { ViralProps } from "../remotion/viral/props";

// script : écrit par Claude en mode interactif (/septim-viral:viral). Il doit passer le linter, sinon erreur explicite.
// brollDir : PRO, clips générés (Higgsfield Soul / Seedance) utilisés en fond à la place des décors procéduraux.
export type JobRequest = { topic?: string; template?: TemplateId; lang?: Lang; script?: Partial<ViralScript>; brollDir?: string };

export type PipelineDeps = {
  env: Env;
  fetchImpl: typeof fetch;
  llm: LlmClient["chat"];
  render: (job: Job, props: ViralProps, jobDir: string) => Promise<string>;
  notify: (text: string, mediaPath?: string) => Promise<void>;
  hasPostizCredentials: boolean;
  // B-roll gratuit (IA locale ComfyUI, Pexels, Pixabay) quand aucun dossier --broll n'est donné.
  broll: (script: ViralScript, timeline: Timeline, dir: string) => Promise<BrollResult>;
};

const PREFIXES = /^(je veux|j'aimerais|fais(-moi)?|crée|cree|make|create)\s+(une?|la|le|a|an|the)?\s*(histoire|vidéo|video|story)\s+(sur|about|de|on)\s+/i;

// Vérification rapide sans rendu : Claude corrige son script jusqu'à zéro problème.
export function checkScript(input: ScriptInput, raw: Partial<ViralScript>) {
  const script = assembleScript(input, raw);
  if (!script) {
    return { script: null, issues: [{ rule: "script.invalid", message: "hook, beats et payoff sont obligatoires." }], durationMs: 0, payoffRatio: 0 };
  }
  const timeline = buildTimeline(script);
  const payoff = timeline.segments.find((s) => s.kind === "payoff")!;
  return { script, issues: lintScript(script, timeline), durationMs: timeline.durationMs, payoffRatio: payoff.startMs / timeline.durationMs };
}

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

  let script: ViralScript;
  let source: Job["source"];
  if (req.script) {
    const checked = checkScript({ topic, lang, template, formula }, req.script);
    if (!checked.script || checked.issues.length) {
      throw new Error(`Script refusé par le linter viral :\n${checked.issues.map((i) => `- ${i.rule} : ${i.message}`).join("\n")}`);
    }
    script = checked.script;
    source = "claude";
  } else {
    const llm = partial.llm ? { chat: partial.llm } : undefined;
    ({ script, source } = await generateScript({ topic, lang, template, formula, trend: trend?.sound ?? trend?.title }, cfg, llm));
  }

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
  await writeSfx(join(jobDir, "sfx"));

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

  // Tes clips (ou les plans PRO) passent toujours avant ; sinon le B-roll gratuit, sinon les fonds procéduraux.
  let broll = req.brollDir
    ? readdirSync(req.brollDir)
        .filter((f) => /\.(mp4|mov|webm)$/i.test(f))
        .sort()
    : [];
  if (broll.length) {
    mkdirSync(join(jobDir, "broll"), { recursive: true });
    broll.forEach((f) => copyFileSync(join(req.brollDir!, f), join(jobDir, "broll", f)));
    job.broll = { source: "dossier", credits: [] };
  } else {
    const gather = partial.broll ?? ((s: ViralScript, t: Timeline, d: string) => gatherBroll(s, t, d, { env, fetchImpl: partial.fetchImpl }));
    const got = await gather(script, timeline, join(jobDir, "broll")).catch((error: Error) => {
      console.error(`[b-roll] ${error.message} : fonds procéduraux.`);
      return { source: "procedural", files: [], credits: [] } as BrollResult;
    });
    broll = got.files;
    job.broll = { source: got.source, credits: got.credits };
  }

  // Ta musique (VIRAL_MUSIC_DIR) remplace le lit procédural ; elle reste sous la voix.
  const track = pickTrack(env.VIRAL_MUSIC_DIR, id);
  const music = track ? `music${extname(track).toLowerCase()}` : undefined;
  if (track && music) copyFileSync(track, join(jobDir, music));

  const props: ViralProps = {
    script,
    timeline,
    audio: {
      segments: timeline.segments.map((s, i) => ({ src: `viral/${id}/voice/${String(i).padStart(2, "0")}.wav`, startMs: s.startMs })),
      ambient: music ? `viral/${id}/${music}` : `viral/${id}/ambient.wav`,
      ambientVolume: music ? 0.16 : 0.08,
      sfx: sfxCues(timeline).map((c) => ({ src: `viral/${id}/sfx/${SFX_FILES[c.kind]}`, startMs: c.atMs, volume: SFX_VOLUME[c.kind] })),
    },
    broll: broll.length ? broll.map((f) => `viral/${id}/broll/${f}`) : undefined,
  };

  const notify = partial.notify ?? (async (text: string) => console.log(text));
  const mode = resolvePublishMode(env, partial.hasPostizCredentials ?? hasPostizCredentials());
  try {
    const render = partial.render ?? (await import("./render")).renderWithRemotion;
    job.videoPath = await render(job, props, jobDir);
    store.saveJob(job);
    await notify(formatReadyMessage(job, mode, cfg.platforms), job.videoPath);
    job.status = "notified";
  } catch (error) {
    job.status = "failed";
    job.error = (error as Error).message;
    await notify(formatFailedMessage(job)).catch(() => undefined);
  }
  store.saveJob(job);
  await store.updateState((s) => ({ ...s, recentTopics: [topic, ...s.recentTopics].slice(0, 30) }));
  return job;
}
