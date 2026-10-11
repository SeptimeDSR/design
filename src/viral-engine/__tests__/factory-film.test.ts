import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createFactory } from "../factory";
import { fallbackScript } from "../heat";
import type { JobRequest, PipelineDeps } from "../pipeline";
import { createStore, type Job } from "../store";
import { buildTimeline } from "../story";

const film = {
  title: "La dette",
  logline: "Une mère doit rembourser.",
  characters: [{ name: "Mireille", gender: "f" }],
  scenes: [{ title: "Le courrier", mood: "calme", shots: [{ narration: "Il pleuvait ce soir là sur la ville depuis très longtemps maintenant.", visual: "rain" }, { narration: "Je ne signerai pas ce papier, dit-elle.", speaker: "Mireille" }] }],
  caption: "c",
  hashtags: [],
};

function setup(run?: (req: JobRequest, partial: Partial<PipelineDeps>, store: ReturnType<typeof createStore>, home: string) => Promise<Job>) {
  const home = mkdtempSync(join(tmpdir(), "factory-film-"));
  const store = createStore(home);
  const seen: { req: JobRequest; partial: Partial<PipelineDeps> }[] = [];
  let n = 0;
  const runJob = async (req: JobRequest, partial: Partial<PipelineDeps>): Promise<Job> => {
    seen.push({ req, partial });
    if (run) return run(req, partial, store, home);
    const id = ["aaaa1111", "bbbb2222", "cccc3333"][n++];
    const script = fallbackScript({ topic: req.topic ?? "t", lang: "fr", formula: "secret", template: "maths" });
    const dir = join(home, "jobs", id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "video.mp4"), "x");
    const job: Job = { id, createdAt: new Date().toISOString(), status: "notified", kind: req.durationSec && req.durationSec > 60 ? "long" : undefined, request: req as Job["request"], script, timeline: buildTimeline(script), arm: "a", source: "fallback", ttsEngine: "piper", jobDir: dir, videoPath: join(dir, "video.mp4") };
    store.saveJob(job);
    return job;
  };
  const factory = createFactory({ env: { VIRAL_HOME: home, VIRAL_PUBLISH_MODE: "manual" }, runJob, notify: async () => undefined });
  return { factory, store, home, seen };
}

describe("factory : durée, genre, format, qualité", () => {
  it("transmet la demande normalisée (genre sans accent, durée en secondes)", async () => {
    const s = setup();
    s.factory.createVideo({ topic: "la dette", durationSec: 3600, genre: "Mystère" as never, orientation: "paysage", quality: "eco" });
    await s.factory.idle();
    expect(s.seen[0].req).toMatchObject({ topic: "la dette", durationSec: 3600, genre: "mystere", orientation: "paysage", quality: "eco" });
  });

  it("accepte la durée écrite comme on la dit (« 1h30 ») et la ramène en secondes", async () => {
    const s = setup();
    s.factory.createVideo({ topic: "x", durationSec: "1h30" as never });
    await s.factory.idle();
    expect(s.seen[0].req.durationSec).toBe(5400);
  });

  it.each([
    [{ durationSec: 5 }, /courte|15/],
    [{ durationSec: 999999 }, /longue|4 h/],
    [{ durationSec: 3600, genre: "western" }, /Genre inconnu/],
    [{ durationSec: 3600, orientation: "carré" }, /paysage|vertical/],
    [{ durationSec: 3600, quality: "ultra" }, /eco|standard|hd/],
  ])("demande refusée %j → bad_request clair, aucune tâche", (extra, message) => {
    const s = setup();
    expect(() => s.factory.createVideo({ topic: "x", ...extra } as never)).toThrow(expect.objectContaining({ code: "bad_request", message: expect.stringMatching(message) }));
    expect(s.factory.listTasks()).toHaveLength(0);
  });

  it("un film donné : vérifié tout de suite (lint), un script d'un autre genre refusé avec le bon conseil", () => {
    const s = setup();
    expect(() => s.factory.createVideo({ film: { title: " ", scenes: [{ title: "S", shots: ["Un."] }] }, durationSec: 20 } as never)).toThrow(expect.objectContaining({ code: "bad_request" }));
    expect(() => s.factory.createVideo({ topic: "x", durationSec: 3600, script: { hook: "Salut ?", beats: [{ text: "un" }], payoff: "deux" } })).toThrow(/film/i);
    expect(() => s.factory.createVideo({ film: "pas un objet" as never })).toThrow(expect.objectContaining({ code: "bad_request" }));
  });

  it("un script qui contient des scènes est pris pour un film ; la tâche n'enregistre pas le texte du film (seulement qu'il est donné)", async () => {
    const s = setup();
    const task = s.factory.createVideo({ script: film as never, durationSec: 15 });
    await s.factory.idle();
    expect(s.seen[0].req.film).toBeDefined();
    expect(s.seen[0].req.script).toBeUndefined();
    const stored = s.factory.getTask(task.id);
    expect(JSON.stringify(stored.request)).not.toContain("Il pleuvait");
    expect(stored.request).toMatchObject({ filmProvided: true });
  });

  it("une durée de 60 s ou moins reste un format court (pas de genre ni de film transmis)", async () => {
    const s = setup();
    s.factory.createVideo({ topic: "x", durationSec: 45, genre: "drame" });
    await s.factory.idle();
    expect(s.seen[0].req.durationSec).toBe(45);
  });
});

describe("factory : progression et annulation d'un film", () => {
  it("la progression est écrite dans la tâche, relue par getTask et listTasks", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const s = setup(async (req, partial, store, home) => {
      partial.progress?.({ phase: "voix", percent: 42, message: "Scène 3/8 : voix" });
      await gate;
      const id = "dddd4444";
      const dir = join(home, "jobs", id);
      mkdirSync(dir, { recursive: true });
      const script = fallbackScript({ topic: "t", lang: "fr", formula: "secret", template: "film" });
      const job: Job = { id, createdAt: new Date().toISOString(), status: "notified", kind: "long", request: req as Job["request"], script, timeline: buildTimeline(script), arm: "film", source: "ollama", ttsEngine: "piper", jobDir: dir };
      store.saveJob(job);
      return job;
    });
    const task = s.factory.createVideo({ topic: "x", durationSec: 3600 });
    await new Promise((r) => setTimeout(r, 30));
    expect(s.factory.getTask(task.id).progress).toEqual({ phase: "voix", percent: 42, message: "Scène 3/8 : voix" });
    expect(s.factory.listTasks()[0].progress?.percent).toBe(42);
    release();
    await s.factory.idle();
    expect(s.factory.getTask(task.id).status).toBe("done");
  });

  it("cancel : le signal d'arrêt part, la tâche finit « annulée » ; une tâche en attente est annulée sans démarrer ; une tâche finie → conflict", async () => {
    let signal: AbortSignal | undefined;
    let started = 0;
    const s = setup(async (_req, partial) => {
      started++;
      signal = partial.signal;
      await new Promise<void>((resolve) => partial.signal?.addEventListener("abort", () => resolve(), { once: true }));
      throw new Error("Fabrication annulée.");
    });
    const first = s.factory.createVideo({ topic: "un", durationSec: 3600 });
    const second = s.factory.createVideo({ topic: "deux", durationSec: 3600 });
    await new Promise((r) => setTimeout(r, 30));
    s.factory.cancel(second.id);
    s.factory.cancel(first.id);
    expect(signal?.aborted).toBe(true);
    await s.factory.idle();
    expect(s.factory.getTask(first.id)).toMatchObject({ status: "failed", error: expect.stringMatching(/annul/i) });
    expect(s.factory.getTask(second.id)).toMatchObject({ status: "failed", error: expect.stringMatching(/annul/i) });
    expect(started).toBe(1);
    expect(() => s.factory.cancel(first.id)).toThrow(expect.objectContaining({ code: "conflict" }));
    expect(() => s.factory.cancel("introuvable")).toThrow(expect.objectContaining({ code: "not_found" }));
  });
});

describe("factory : refaire un film", () => {
  const seed = (s: ReturnType<typeof setup>, status: Job["status"], extra: Partial<Job> = {}) => {
    const dir = join(s.home, "jobs", "eeee5555");
    mkdirSync(dir, { recursive: true });
    const script = fallbackScript({ topic: "la dette", lang: "fr", formula: "secret", template: "film" });
    const job: Job = { id: "eeee5555", createdAt: new Date().toISOString(), status, kind: "long", request: { topic: "la dette", lang: "fr", durationSec: 3600, genre: "drame", orientation: "paysage", quality: "eco" }, script, timeline: buildTimeline(script), arm: "film", source: "ollama", ttsEngine: "piper", jobDir: dir, ...extra };
    s.store.saveJob(job);
    return job;
  };

  it("un film « ratée » est REPRIS (même demande, l'ancien job n'est pas jeté) ; un film terminé est jeté puis refait", async () => {
    const s = setup();
    seed(s, "failed", { error: "coupure" });
    s.factory.redo("eeee");
    await s.factory.idle();
    expect(s.seen[0].req).toMatchObject({ topic: "la dette", durationSec: 3600, genre: "drame", orientation: "paysage", quality: "eco" });
    expect(s.store.getJob("eeee5555")?.status).toBe("failed");

    const s2 = setup();
    seed(s2, "notified");
    s2.factory.redo("eeee");
    await s2.factory.idle();
    expect(s2.store.getJob("eeee5555")?.status).toBe("rejected");
    expect(s2.seen[0].req.durationSec).toBe(3600);
  });

  it("un film donné par l'humain se retrouve dans le dossier du job pour la reprise", async () => {
    const s = setup();
    const job = seed(s, "failed", {});
    job.request = { ...job.request, filmProvided: true };
    s.store.saveJob(job);
    writeFileSync(join(job.jobDir, "film.json"), JSON.stringify(film));
    s.factory.redo("eeee");
    await s.factory.idle();
    expect((s.seen[0].req.film as { title: string }).title).toBe("La dette");
    expect(existsSync(join(job.jobDir, "film.json"))).toBe(true);
  });
});

describe("factory : estimation avant de lancer", () => {
  it("durée, qualité → temps, place disque et verdict", () => {
    const s = setup();
    const e = s.factory.estimate({ durationSec: 3600, quality: "standard" });
    expect(e).toMatchObject({ durationSec: 3600, quality: "standard" });
    expect(e.estMinutes).toBeGreaterThan(5);
    expect(e.diskMb).toBeGreaterThan(100);
    expect(typeof e.freeMb).toBe("number");
    expect(typeof e.ok).toBe("boolean");
    expect(() => s.factory.estimate({ durationSec: 3, quality: "standard" })).toThrow(expect.objectContaining({ code: "bad_request" }));
  });
});
