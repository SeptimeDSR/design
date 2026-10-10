import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createFactory, type FactoryDeps } from "../factory";
import { createStore, type Job } from "../store";
import { fallbackScript } from "../heat";
import { buildTimeline } from "../story";
import type { PublishResult } from "../publish";
import type { JobRequest } from "../pipeline";
import { fakeFactory as sharedFakeFactory, seedJob as sharedSeedJob } from "./fixtures/fake-factory";

const TONTINE = JSON.parse(readFileSync(join(__dirname, "fixtures", "tontine.json"), "utf8"));

function setup(over: Partial<FactoryDeps> = {}, ids = ["5f8a4d25", "1234abcd", "9999aaaa"]) {
  const home = mkdtempSync(join(tmpdir(), "septim-factory-"));
  const env = { VIRAL_HOME: home, VIRAL_PUBLISH_MODE: "manual" };
  const store = createStore(home);
  const order: string[] = [];
  const published: string[] = [];
  let n = 0;
  const runJob = async (req: JobRequest): Promise<Job> => {
    const id = ids[n++];
    order.push(`start:${req.topic}`);
    await new Promise((r) => setTimeout(r, 20));
    const script = fallbackScript({ topic: req.topic ?? "tendance", lang: "fr", formula: "secret", template: req.template ?? "maths" });
    const jobDir = join(home, "jobs", id);
    mkdirSync(jobDir, { recursive: true });
    writeFileSync(join(jobDir, "video.mp4"), "fake");
    const job: Job = { id, createdAt: new Date(Date.now() + n).toISOString(), status: "notified", request: req, script, timeline: buildTimeline(script), arm: "maths:secret", source: "fallback", ttsEngine: "silent", jobDir, videoPath: join(jobDir, "video.mp4") };
    store.saveJob(job);
    order.push(`end:${req.topic}`);
    return job;
  };
  const publish = async (job: Job): Promise<PublishResult> => {
    published.push(job.id);
    return { posted: {}, missing: [], failed: [], manualText: "légende" };
  };
  const factory = createFactory({ env, runJob, publish, notify: async () => undefined, ...over });
  return { factory, store, home, order, published };
}

const events = (f: ReturnType<typeof setup>["factory"]) => {
  const seen: string[] = [];
  for (const e of ["video.ready", "video.failed", "video.published", "video.rejected"] as const) f.on(e, () => void seen.push(e));
  return seen;
};

describe("factory : fabriquer", () => {
  it("createVideo rend la main tout de suite (queued) et la tâche finit done avec jobId et ref, même si personne n'interroge", async () => {
    const s = setup();
    const seen = events(s.factory);
    const task = s.factory.createVideo({ topic: "La tontine à Douala 🇨🇲" });
    expect(task.status).toBe("queued");
    await s.factory.idle();
    const onDisk = JSON.parse(readFileSync(join(s.home, "tasks", `${task.id}.json`), "utf8"));
    expect(onDisk).toMatchObject({ status: "done", jobId: "5f8a4d25", ref: "5f8a" });
    expect(s.factory.getVideo("5f8a").topic).toBe("La tontine à Douala 🇨🇲");
    expect(seen).toEqual(["video.ready"]);
  });

  it("createVideo : template inconnu, langue autre que fr/en, sujet de plus de 500 caractères → bad_request", () => {
    const s = setup();
    expect(() => s.factory.createVideo({ topic: "x", template: "clip" as never })).toThrow(expect.objectContaining({ code: "bad_request" }));
    expect(() => s.factory.createVideo({ topic: "x", lang: "de" as never })).toThrow(expect.objectContaining({ code: "bad_request" }));
    expect(() => s.factory.createVideo({ topic: "a".repeat(501) })).toThrow(expect.objectContaining({ code: "bad_request" }));
    expect(s.factory.listTasks()).toHaveLength(0);
  });

  it("createVideo avec un script refusé par le linter → bad_request avec details.issues, aucune tâche créée", () => {
    const s = setup();
    try {
      s.factory.createVideo({ topic: "la tontine", template: "maths", script: { hook: "Un hook bien trop long pour tenir dans les trois premières secondes de la vidéo, vraiment beaucoup trop long", beats: [{ text: "un" }], payoff: "deux" } });
      expect.unreachable();
    } catch (e) {
      expect((e as { code: string }).code).toBe("bad_request");
      expect(((e as { details: { issues: unknown[] } }).details.issues).length).toBeGreaterThan(0);
    }
    expect(s.factory.listTasks()).toHaveLength(0);
  });

  it("un script conforme est accepté", async () => {
    const s = setup();
    const task = s.factory.createVideo({ topic: "la tontine", template: "maths", script: TONTINE });
    await s.factory.idle();
    expect(s.factory.getTask(task.id).status).toBe("done");
  });

  it("les tâches passent une par une (file)", async () => {
    const s = setup();
    s.factory.createVideo({ topic: "a" });
    s.factory.createVideo({ topic: "b" });
    await s.factory.idle();
    expect(s.order).toEqual(["start:a", "end:a", "start:b", "end:b"]);
  });

  it("runJob qui lève → tâche failed avec le message, événement video.failed", async () => {
    const s = setup({
      runJob: async () => {
        throw new Error("Chrome introuvable");
      },
    });
    const seen = events(s.factory);
    const task = s.factory.createVideo({ topic: "a" });
    await s.factory.idle();
    expect(s.factory.getTask(task.id)).toMatchObject({ status: "failed", error: "Chrome introuvable" });
    expect(seen).toEqual(["video.failed"]);
  });
});

describe("factory : publier seulement sur OUI #ref", () => {
  async function ready() {
    const s = setup();
    s.factory.createVideo({ topic: "a" });
    s.factory.createVideo({ topic: "b" });
    await s.factory.idle();
    return s;
  }

  it("sans confirmation ou avec « oui » → confirmation_required", async () => {
    const s = await ready();
    await expect(s.factory.publish("5f8a", "")).rejects.toMatchObject({ code: "confirmation_required" });
    await expect(s.factory.publish("5f8a", "oui")).rejects.toMatchObject({ code: "confirmation_required" });
    expect(s.published).toEqual([]);
  });

  it("« OUI #<ref> » d'une AUTRE vidéo → confirmation_required", async () => {
    const s = await ready();
    await expect(s.factory.publish("5f8a", "OUI #1234")).rejects.toMatchObject({ code: "confirmation_required" });
    expect(s.published).toEqual([]);
  });

  it("« oui #5F8A » (casse et # libres) → publie une fois, événement video.published ; une deuxième fois → conflict", async () => {
    const s = await ready();
    const seen = events(s.factory);
    const r = await s.factory.publish("#5F8A", "oui #5F8A");
    expect(r.status).toBe("published");
    expect(r.manualText).toBe("légende");
    expect(s.published).toEqual(["5f8a4d25"]);
    expect(seen).toEqual(["video.published"]);
    await expect(s.factory.publish("5f8a", "OUI #5f8a")).rejects.toMatchObject({ code: "conflict" });
    expect(s.published).toHaveLength(1);
  });
});

describe("factory : retrouver une vidéo", () => {
  it("getVideo(\"#5F8A\") et getVideo(\"5f8a\") → même vidéo ; référence ambiguë → ambiguous_ref (409) avec details.matches", async () => {
    const s = setup({}, ["ab12cdef", "ab34cdef"]);
    s.factory.createVideo({ topic: "a" });
    s.factory.createVideo({ topic: "b" });
    await s.factory.idle();
    expect(s.factory.getVideo("#AB12").id).toBe(s.factory.getVideo("ab12").id);
    try {
      s.factory.getVideo("ab");
      expect.unreachable();
    } catch (e) {
      expect(e).toMatchObject({ code: "ambiguous_ref", status: 409 });
      expect((e as { details: { matches: unknown[] } }).details.matches).toHaveLength(2);
    }
  });

  it("videoFile : mp4 supprimé → not_found", async () => {
    const s = setup();
    s.factory.createVideo({ topic: "a" });
    await s.factory.idle();
    expect(existsSync(s.factory.videoFile("5f8a"))).toBe(true);
    rmSync(join(s.home, "jobs", "5f8a4d25", "video.mp4"));
    expect(() => s.factory.videoFile("5f8a")).toThrow(expect.objectContaining({ code: "not_found", status: 404 }));
  });

  it("reject → statut rejected, événement video.rejected ; publish après reject → conflict", async () => {
    const s = setup();
    s.factory.createVideo({ topic: "a" });
    await s.factory.idle();
    const seen = events(s.factory);
    expect(s.factory.reject("5f8a").status).toBe("rejected");
    expect(seen).toEqual(["video.rejected"]);
    await expect(s.factory.publish("5f8a", "OUI #5f8a")).rejects.toMatchObject({ code: "conflict" });
  });

  it("listVideos : filtre par statut, limite par défaut 20, maximum 100", async () => {
    const s = setup();
    s.factory.createVideo({ topic: "a" });
    s.factory.createVideo({ topic: "b" });
    await s.factory.idle();
    s.factory.reject("1234");
    expect(s.factory.listVideos().map((v) => v.ref)).toEqual(["1234", "5f8a"]);
    expect(s.factory.listVideos({ status: "rejected" }).map((v) => v.ref)).toEqual(["1234"]);
    expect(s.factory.listVideos({ limit: 1 })).toHaveLength(1);
    expect(() => s.factory.listVideos({ limit: 101 })).toThrow(expect.objectContaining({ code: "bad_request" }));
  });

  it("lessons : classe les bras par moyenne alpha/(alpha+beta) décroissante et renvoie LESSONS.md (chaîne vide si absent)", async () => {
    const s = setup();
    expect(s.factory.lessons().text).toBe("");
    await s.store.updateState((st) => ({ ...st, bandit: { "story:choc": { alpha: 2, beta: 5 }, "maths:secret": { alpha: 6, beta: 2 } } }));
    writeFileSync(join(s.home, "LESSONS.md"), "- leçon\n");
    const l = s.factory.lessons();
    expect(l.text).toBe("- leçon\n");
    expect(l.arms.map((a) => a.arm)).toEqual(["maths:secret", "story:choc"]);
    expect(l.arms[0].mean).toBeCloseTo(0.75);
  });

  it("redo : jette l'ancienne et refait le même sujet dans une nouvelle tâche", async () => {
    const s = setup();
    s.factory.createVideo({ topic: "la tontine" });
    await s.factory.idle();
    const task = s.factory.redo("5f8a");
    expect(task.kind).toBe("redo");
    await s.factory.idle();
    expect(s.store.getJob("5f8a4d25")?.status).toBe("rejected");
    expect(s.factory.getTask(task.id)).toMatchObject({ status: "done", jobId: "1234abcd" });
  });
});

describe("revue finale : robustesse du cœur", () => {
  it("une tâche dont le processus est mort passe à failed (« interrompue ») au lieu de rester running pour toujours", async () => {
    const { spawnSync } = await import("node:child_process");
    const s = setup();
    const dead = spawnSync(process.execPath, ["-e", "process.exit(0)"]).pid!;
    const now = new Date().toISOString();
    writeFileSync(join(s.home, "tasks", "orphan01.json"), JSON.stringify({ id: "orphan01", kind: "create", status: "running", request: { topic: "x" }, pid: dead, host: (await import("node:os")).hostname(), createdAt: now, updatedAt: now }));
    expect(s.factory.getTask("orphan01")).toMatchObject({ status: "failed", error: expect.stringMatching(/interrompu/i) });
    expect(s.factory.listTasks().find((t) => t.id === "orphan01")?.status).toBe("failed");
    const live = s.factory.createVideo({ topic: "vivante" });
    expect(s.factory.getTask(live.id).status).not.toBe("failed");
    await s.factory.idle();
  });

  it("jeter ou refaire pendant une publication → conflict, et jamais d'écrasement sous le verrou de publication", async () => {
    const s = setup();
    s.factory.createVideo({ topic: "a" });
    await s.factory.idle();
    const job = s.store.getJob("5f8a4d25")!;
    s.store.saveJob({ ...job, status: "publishing", publishingSince: new Date().toISOString() });
    expect(() => s.factory.reject("5f8a")).toThrow(expect.objectContaining({ code: "conflict" }));
    expect(() => s.factory.redo("5f8a")).toThrow(expect.objectContaining({ code: "conflict" }));
    s.store.saveJob({ ...job, status: "notified" });
    const { tryLock } = await import("../lock");
    const release = tryLock(join(s.store.jobsDir, job.id, "publish.lock"))!;
    try {
      expect(() => s.factory.reject("5f8a")).toThrow(expect.objectContaining({ code: "conflict" }));
    } finally {
      release();
    }
    expect(s.factory.reject("5f8a").status).toBe("rejected");
  });

  it("la référence affichée est le plus court préfixe UNIQUE (≥ 4) : la phrase demandée est toujours acceptée", async () => {
    const s = setup({}, ["5f8a1111", "5f8a2222"]);
    s.factory.createVideo({ topic: "a" });
    s.factory.createVideo({ topic: "b" });
    await s.factory.idle();
    const a = s.factory.getVideo("5f8a1");
    expect(a.ref).toBe("5f8a1");
    expect(s.factory.listVideos().map((v) => v.ref).sort()).toEqual(["5f8a1", "5f8a2"]);
    const r = await s.factory.publish(a.ref, `OUI #${a.ref}`);
    expect(r.status).toBe("published");
    expect(s.published).toEqual(["5f8a1111"]);
  });

  it("announce : une porte qui publie ou jette hors de la fabrique (WhatsApp) émet quand même l'événement", async () => {
    const s = setup();
    const seen = events(s.factory);
    s.factory.createVideo({ topic: "a" });
    await s.factory.idle();
    s.factory.announce("video.published", "5f8a4d25");
    expect(seen).toEqual(["video.ready", "video.published"]);
  });
});

describe("revue finale : mineurs corrigés", () => {
  it("publier une vidéo dont le MP4 a disparu → conflict, rien n'est envoyé", async () => {
    const f = sharedFakeFactory();
    const job = sharedSeedJob(f.store, "5f8a4d25");
    rmSync(job.videoPath!);
    await expect(f.factory.publish("5f8a", "OUI #5f8a")).rejects.toMatchObject({ code: "conflict" });
    expect(f.published).toEqual([]);
  });
});

describe("réglages dans le cœur", () => {
  it("settings.list / update / test / install passent par les mêmes fonctions que le Studio, l'API et le terminal", async () => {
    const f = sharedFakeFactory();
    expect((await f.factory.settings.list()).map((x) => x.id)).toContain("voix");
    const v = await f.factory.settings.update("pexels", { values: { PEXELS_API_KEY: "k" } });
    expect(v.status).toBe("actif");
    expect(f.env.PEXELS_API_KEY).toBe("k");
    expect((await f.factory.settings.test("pexels")).ok).toBe(false);
    expect((await f.factory.settings.install("voix")).install?.status).toMatch(/running|done/);
  });

  it("attachHub : l'état de WhatsApp et son QR apparaissent dans la fonction WhatsApp", async () => {
    const f = sharedFakeFactory({}, undefined);
    f.factory.attachHub({ state: () => ({ state: "qr", qr: "data:image/svg+xml;base64,QQ" }) } as never);
    const w = (await f.factory.settings.list()).find((x) => x.id === "whatsapp")!;
    expect(w.link).toEqual({ state: "qr", qr: "data:image/svg+xml;base64,QQ" });
  });

  it("onSettingsChange : prévient quand une fonction change (le démon bascule WhatsApp)", async () => {
    const f = sharedFakeFactory();
    let n = 0;
    f.factory.onSettingsChange(() => void n++);
    await f.factory.settings.update("pexels", { enabled: false });
    expect(n).toBeGreaterThan(0);
  });
});

