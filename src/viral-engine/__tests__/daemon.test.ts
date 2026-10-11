import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { collectRewards, createCycleRunner, handleReply, publishWithLedger, type DaemonDeps, type PublishResult } from "../daemon";
import { createStore, type Job } from "../store";
import { fallbackScript } from "../heat";
import { buildTimeline } from "../story";

function makeJob(id: string, status: Job["status"] = "notified", createdAt = new Date().toISOString()): Job {
  const script = fallbackScript({ topic: "la tontine", lang: "fr", formula: "secret", template: "maths" });
  return { id, createdAt, status, request: {}, script, timeline: buildTimeline(script), arm: "maths:secret", source: "ollama", ttsEngine: "piper", jobDir: "/tmp", videoPath: "/tmp/v.mp4" };
}

function setup(jobs: Job[] = [makeJob("beef1234")], publishImpl?: (job: Job) => Promise<PublishResult>) {
  const home = mkdtempSync(join(tmpdir(), "septim-daemon-"));
  const store = createStore(home);
  jobs.forEach((j) => store.saveJob(j));
  const sent: string[] = [];
  const published: string[] = [];
  const redone: string[] = [];
  const deps: DaemonDeps = {
    store,
    mode: "postiz-cloud",
    platforms: ["tiktok", "youtube"],
    notify: async (t) => void sent.push(t),
    publish:
      publishImpl ??
      (async (j) => {
        published.push(j.id);
        await new Promise((r) => setTimeout(r, 30));
        return { posted: { tiktok: ["p1"], youtube: ["p2"] }, missing: [], failed: [] };
      }),
    runJob: async (req) => (redone.push(req.topic ?? ""), jobs[0]),
    views: async () => 500,
  };
  return { store, deps, sent, published, redone, home };
}

describe("handleReply : jamais sans accord net, jamais deux fois", () => {
  it("OUI publie la seule vidéo en attente et confirme", async () => {
    const s = setup();
    await handleReply("OUI", s.deps);
    expect(s.published).toEqual(["beef1234"]);
    expect(s.store.getJob("beef1234")?.status).toBe("published");
    expect(s.store.getJob("beef1234")?.posted).toEqual({ tiktok: ["p1"], youtube: ["p2"] });
    expect(s.sent.at(-1)).toContain("Publié");
  });

  it("deux OUI simultanés ne publient qu'une fois", async () => {
    const s = setup();
    await Promise.all([handleReply("oui", s.deps), handleReply("OUI", s.deps)]);
    expect(s.published).toHaveLength(1);
  });

  it("un deuxième OUI plus tard ne republie pas", async () => {
    const s = setup();
    await handleReply("oui", s.deps);
    await handleReply("oui #beef", s.deps);
    expect(s.published).toHaveLength(1);
    expect(s.sent.at(-1)).toContain("déjà publiée");
  });

  it("plusieurs vidéos en attente : un OUI nu ne publie rien et demande laquelle", async () => {
    const s = setup([makeJob("aaaa1111", "notified", "2026-10-05T06:00:00Z"), makeJob("bbbb2222", "notified", "2026-10-05T12:00:00Z")]);
    await handleReply("oui", s.deps);
    expect(s.published).toEqual([]);
    expect(s.sent.at(-1)).toContain("#aaaa");
    expect(s.sent.at(-1)).toContain("#bbbb");
  });

  it("une réponse citant le message d'une vidéo publie cette vidéo-là", async () => {
    const s = setup([makeJob("aaaa1111", "notified", "2026-10-05T06:00:00Z"), makeJob("bbbb2222", "notified", "2026-10-05T12:00:00Z")]);
    await handleReply("oui", s.deps, { quoted: "🎬 Septim · Vidéo prête boss #aaaa\n« … »" });
    expect(s.published).toEqual(["aaaa1111"]);
  });

  it("OUI #ref ambigu (deux vidéos qui commencent pareil) : rien n'est publié, l'usine demande quelques caractères de plus", async () => {
    const s = setup([makeJob("5f8a1111", "notified", "2026-10-05T10:00:00Z"), makeJob("5f8a2222", "notified", "2026-10-05T11:00:00Z")]);
    await handleReply("OUI #5f8a", s.deps);
    expect(s.published).toEqual([]);
    expect(s.sent.at(-1)).toMatch(/plusieurs vidéos/);
    expect(s.sent.at(-1)).toContain("#5f8a11");
    await handleReply("OUI #5f8a22", s.deps);
    expect(s.published).toEqual(["5f8a2222"]);
  });

  it("un accord ambigu ne publie pas et demande un OUI net", async () => {
    const s = setup();
    await handleReply("ok je regarde ce soir", s.deps);
    expect(s.published).toEqual([]);
    expect(s.sent.at(-1)).toContain("OUI #beef");
  });

  it("échec partiel : garde le registre, reste en attente, nomme ce qui est passé", async () => {
    let call = 0;
    const s = setup([makeJob("beef1234")], async (j) => {
      call++;
      return call === 1
        ? { posted: { tiktok: ["p1"] }, missing: [], failed: [{ platform: "youtube", error: "quota" }] }
        : { posted: { ...j.posted, youtube: ["p2"] }, missing: [], failed: [] };
    });
    await handleReply("oui", s.deps);
    expect(s.store.getJob("beef1234")?.status).toBe("notified");
    expect(s.store.getJob("beef1234")?.posted).toEqual({ tiktok: ["p1"] });
    expect(s.sent.at(-1)).toMatch(/tiktok/i);
    expect(s.sent.at(-1)).toMatch(/youtube/i);
    await handleReply("oui", s.deps);
    expect(s.store.getJob("beef1234")?.status).toBe("published");
  });

  it("NON jette la vidéo", async () => {
    const s = setup();
    await handleReply("non", s.deps);
    expect(s.store.getJob("beef1234")?.status).toBe("rejected");
  });

  it("REFAIS relance une version sur le même sujet", async () => {
    const s = setup();
    await handleReply("refais", s.deps);
    expect(s.redone).toEqual(["la tontine"]);
  });

  it("PRO annonce le besoin de crédit sans rien dépenser", async () => {
    const s = setup();
    await handleReply("pro", s.deps);
    expect(s.sent.at(-1)).toContain("BESOIN CREDIT");
    expect(s.published).toEqual([]);
  });

  it("un message sans rapport ou du bot ne déclenche rien", async () => {
    const s = setup();
    await handleReply("🎬 Septim · Vidéo prête", s.deps);
    await handleReply("salut", s.deps);
    expect(s.published).toEqual([]);
    expect(s.sent).toEqual([]);
  });
});

describe("createCycleRunner : rien n'est perdu pendant un cycle", () => {
  it("une demande pendant un cycle est mise en file, annoncée, puis exécutée", async () => {
    const runs: string[] = [];
    const told: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const runner = createCycleRunner(
      async (req) => {
        runs.push(req.topic ?? "cycle");
        if (runs.length === 1) await gate;
        return makeJob("x");
      },
      async (t) => void told.push(t),
    );
    const first = runner({});
    const second = runner({ topic: "la tontine" });
    await new Promise((r) => setTimeout(r, 10));
    expect(told.at(-1)).toContain("juste après");
    release();
    await Promise.all([first, second]);
    expect(runs).toEqual(["cycle", "la tontine"]);
  });
});

describe("collectRewards", () => {
  it("48 h après la publication, récompense le bras et écrit une leçon", async () => {
    const job = { ...makeJob("beef1234", "published"), publishedAt: new Date(Date.now() - 49 * 3600_000).toISOString() };
    const s = setup([job]);
    await collectRewards(s.deps);
    const state = s.store.loadState();
    expect(state.bandit["maths:secret"]).toEqual({ alpha: 2, beta: 1 });
    expect(state.viewsHistory).toEqual([500]);
    expect(s.store.getJob("beef1234")?.rewarded).toBe(true);
    expect(readFileSync(join(s.home, "LESSONS.md"), "utf8")).toContain("maths:secret");
  });

  it("compte depuis la publication, pas depuis la création", async () => {
    const job = { ...makeJob("beef1234", "published", new Date(Date.now() - 72 * 3600_000).toISOString()), publishedAt: new Date().toISOString() };
    const s = setup([job]);
    await collectRewards(s.deps);
    expect(s.store.loadState().bandit).toEqual({});
  });
});

describe("publishWithLedger : jamais deux fois, même entre processus", () => {
  it("relit le job sous verrou : déjà publié par un autre processus → aucun appel à publish", async () => {
    const s = setup([makeJob("beef1234", "published")]);
    const stale = makeJob("beef1234", "notified");
    await publishWithLedger(stale, s.deps);
    expect(s.published).toHaveLength(0);
    expect(s.sent.at(-1)).toContain("déjà publiée");
  });

  it("deux processus qui publient en même temps : une seule publication", async () => {
    const s = setup();
    const child = () =>
      new Promise<number>((resolve) => {
        const p = spawn(process.execPath, ["--import", "tsx", join(__dirname, "fixtures", "publish-child.ts"), s.home, "beef1234"], { stdio: "inherit" });
        p.on("exit", (code) => resolve(code ?? 1));
      });
    const codes = await Promise.all([child(), child()]);
    expect(codes).toEqual([0, 0]);
    const log = join(s.home, "calls.log");
    expect(existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : []).toHaveLength(1);
    expect(s.store.getJob("beef1234")?.status).toBe("published");
  }, 20_000);
});

describe("revue finale : WhatsApp prévient les autres logiciels et n'écrase rien", () => {
  it("OUI publie puis appelle onPublished ; NON jette puis appelle onRejected", async () => {
    const s = setup([makeJob("beef1234"), makeJob("cafe5678")]);
    const events: string[] = [];
    const deps = { ...s.deps, onPublished: (j: Job) => void events.push(`pub:${j.id}`), onRejected: (j: Job) => void events.push(`rej:${j.id}`) };
    await handleReply("OUI #beef", deps);
    await handleReply("NON #cafe", deps);
    expect(events).toEqual(["pub:beef1234", "rej:cafe5678"]);
  });

  it("NON pendant une publication (verrou pris) : rien n'est écrasé, l'usine dit que c'est en cours", async () => {
    const s = setup([makeJob("beef1234")]);
    const { tryLock } = await import("../lock");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(s.store.jobsDir, "beef1234"), { recursive: true });
    const release = tryLock(join(s.store.jobsDir, "beef1234", "publish.lock"))!;
    try {
      await handleReply("NON #beef", s.deps);
    } finally {
      release();
    }
    expect(s.store.getJob("beef1234")?.status).toBe("notified");
    expect(s.sent.at(-1)).toMatch(/en cours/);
  });
});

describe("installation automatique au démarrage", () => {
  it("autoInstallIds : SEPTIM_AUTO_INSTALL, sinon voix et modèle dans Docker, sinon rien ; ids inconnus ignorés", async () => {
    const { autoInstallIds } = await import("../daemon");
    expect(autoInstallIds({})).toEqual([]);
    expect(autoInstallIds({ SEPTIM_IN_DOCKER: "1" })).toEqual(["voix", "ollama"]);
    expect(autoInstallIds({ SEPTIM_IN_DOCKER: "1", SEPTIM_AUTO_INSTALL: "" })).toEqual([]);
    expect(autoInstallIds({ SEPTIM_AUTO_INSTALL: "voix, voix-hd ,nimporte" })).toEqual(["voix", "voix-hd"]);
  });
});

