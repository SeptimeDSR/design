import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFactory, type FactoryDeps } from "../../factory";
import { fallbackScript } from "../../heat";
import type { JobRequest } from "../../pipeline";
import type { PublishResult } from "../../publish";
import { buildTimeline } from "../../story";
import { createStore, type Job, type Store } from "../../store";
import type { Probes } from "../../doctor";

export const VIDEO_BYTES = 1000;

export const FAKE_PROBES: Probes = {
  ollama: false,
  piperVoice: false,
  kokoro: false,
  chrome: false,
  postiz: false,
  whatsappSession: false,
  youtubeKey: false,
  apify: false,
  comfyui: false,
  pexels: false,
  pixabay: false,
  musicTracks: 0,
  chatterbox: false,
  ttsPref: "auto",
};

// Un job rendu « pour de faux » : vrai job.json, vrai fichier video.mp4 de 1000 octets.
export function seedJob(store: Store, id: string, req: JobRequest = {}, createdAt = new Date().toISOString()): Job {
  const script = fallbackScript({ topic: req.topic ?? "tendance", lang: "fr", formula: "secret", template: req.template ?? "maths" });
  const jobDir = join(store.jobsDir, id);
  mkdirSync(jobDir, { recursive: true });
  writeFileSync(join(jobDir, "video.mp4"), Buffer.alloc(VIDEO_BYTES, 7));
  const job: Job = {
    id,
    createdAt,
    status: "notified",
    request: req,
    script,
    timeline: buildTimeline(script),
    arm: "maths:secret",
    source: "fallback",
    ttsEngine: "silent",
    jobDir,
    videoPath: join(jobDir, "video.mp4"),
  };
  store.saveJob(job);
  return job;
}

// Fabrique branchée sur un VIRAL_HOME temporaire, sans rendu ni publication réels.
export function fakeFactory(over: Partial<FactoryDeps> = {}, ids = ["5f8a4d25", "1234abcd", "9999aaaa"]) {
  const home = mkdtempSync(join(tmpdir(), "septim-fake-"));
  const env = { VIRAL_HOME: home, VIRAL_PUBLISH_MODE: "manual" };
  const store = createStore(home);
  const published: string[] = [];
  let n = 0;
  const runJob = async (req: JobRequest): Promise<Job> => {
    const id = ids[n++];
    await new Promise((r) => setTimeout(r, 10));
    return seedJob(store, id, req, new Date(Date.now() + n).toISOString());
  };
  const publish = async (job: Job): Promise<PublishResult> => {
    published.push(job.id);
    return { posted: {}, missing: [], failed: [], manualText: "légende prête" };
  };
  const factory = createFactory({ env, runJob, publish, notify: async () => undefined, probe: async () => FAKE_PROBES, ...over });
  return { factory, store, home, env, published };
}
