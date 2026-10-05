import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { collectRewards, handleReply, type DaemonDeps } from "../daemon";
import { createStore, type Job } from "../store";
import { fallbackScript } from "../heat";
import { buildTimeline } from "../story";

function setup(status: Job["status"] = "notified", createdAt = new Date().toISOString()) {
  const home = mkdtempSync(join(tmpdir(), "septim-daemon-"));
  const store = createStore(home);
  const script = fallbackScript({ topic: "la tontine", lang: "fr", formula: "secret", template: "maths" });
  const job: Job = { id: "beef1234", createdAt, status, request: {}, script, timeline: buildTimeline(script), arm: "maths:secret", source: "ollama", ttsEngine: "piper", jobDir: home, videoPath: join(home, "v.mp4") };
  store.saveJob(job);
  const sent: string[] = [];
  const published: string[] = [];
  const redone: string[] = [];
  const deps: DaemonDeps = {
    store,
    mode: "postiz-cloud",
    notify: async (t) => void sent.push(t),
    publish: async (j) => (published.push(j.id), { postIds: ["p1"], missing: [] }),
    runJob: async (req) => (redone.push(req.topic ?? ""), job),
    views: async () => 500,
  };
  return { store, job, deps, sent, published, redone, home };
}

describe("handleReply", () => {
  it("OUI publie le dernier job notifié et confirme", async () => {
    const s = setup();
    await handleReply("OUI", s.deps);
    expect(s.published).toEqual(["beef1234"]);
    expect(s.store.getJob("beef1234")?.status).toBe("published");
    expect(s.sent.at(-1)).toContain("Publié");
  });

  it("un deuxième OUI ne republie jamais", async () => {
    const s = setup();
    await handleReply("oui", s.deps);
    await handleReply("oui", s.deps);
    expect(s.published).toHaveLength(1);
  });

  it("NON jette la vidéo", async () => {
    const s = setup();
    await handleReply("non", s.deps);
    expect(s.store.getJob("beef1234")?.status).toBe("rejected");
    expect(s.published).toEqual([]);
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

  it("un message inconnu ou du bot ne déclenche rien", async () => {
    const s = setup();
    await handleReply("🎬 Septim · Vidéo prête", s.deps);
    await handleReply("salut", s.deps);
    expect(s.published).toEqual([]);
    expect(s.sent).toEqual([]);
  });

  it("vise le job référencé par #ref", async () => {
    const s = setup();
    await handleReply("oui #beef", s.deps);
    expect(s.published).toEqual(["beef1234"]);
  });
});

describe("collectRewards", () => {
  it("après 48 h, récompense le bras et écrit une leçon", async () => {
    const old = new Date(Date.now() - 49 * 3600_000).toISOString();
    const s = setup("published", old);
    await collectRewards(s.deps);
    const state = s.store.loadState();
    expect(state.bandit["maths:secret"]).toEqual({ alpha: 2, beta: 1 });
    expect(state.viewsHistory).toEqual([500]);
    expect(s.store.getJob("beef1234")?.rewarded).toBe(true);
    expect(readFileSync(join(s.home, "LESSONS.md"), "utf8")).toContain("maths:secret");
  });

  it("ne récompense pas deux fois ni trop tôt", async () => {
    const s = setup("published");
    await collectRewards(s.deps);
    expect(s.store.loadState().bandit).toEqual({});
  });
});
