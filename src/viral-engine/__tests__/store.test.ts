import { existsSync, mkdirSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createStore, normalizeRef, type Job } from "../store";
import { tryLock } from "../lock";
import { fallbackScript } from "../heat";
import { buildTimeline } from "../story";

function makeJob(id: string): Job {
  const script = fallbackScript({ topic: "la tontine", lang: "fr", formula: "secret", template: "maths" });
  return { id, createdAt: new Date().toISOString(), status: "notified", request: {}, script, timeline: buildTimeline(script), arm: "maths:secret", source: "ollama", ttsEngine: "piper", jobDir: "/tmp" };
}

const home = () => mkdtempSync(join(tmpdir(), "septim-store-"));

describe("store : écritures sûres entre processus", () => {
  it("saveJob est atomique : aucun fichier .tmp ne reste et le JSON est complet", () => {
    const store = createStore(home());
    store.saveJob(makeJob("5f8a4d25"));
    const files = readdirSync(join(store.jobsDir, "5f8a4d25"));
    expect(files).toEqual(["job.json"]);
    expect(store.getJob("5f8a4d25")?.id).toBe("5f8a4d25");
  });

  it("listJobs ignore un job.json corrompu et le signale sur stderr", () => {
    const store = createStore(home());
    store.saveJob(makeJob("aaaa1111"));
    store.saveJob(makeJob("bbbb2222"));
    mkdirSync(join(store.jobsDir, "cccc3333"));
    writeFileSync(join(store.jobsDir, "cccc3333", "job.json"), '{"id":');
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(store.listJobs().map((j) => j.id).sort()).toEqual(["aaaa1111", "bbbb2222"]);
    expect(err).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });

  it("updateState ne perd aucune mise à jour", async () => {
    const store = createStore(home());
    await Promise.all(Array.from({ length: 20 }, (_, i) => store.updateState((s) => ({ ...s, viewsHistory: [...s.viewsHistory, i] }))));
    expect(store.loadState().viewsHistory).toHaveLength(20);
  });
});

describe("resolveRef : jamais la mauvaise vidéo", () => {
  it("préfixe unique, insensible à # et à la casse", () => {
    const store = createStore(home());
    store.saveJob(makeJob("5f8a4d25"));
    store.saveJob(makeJob("1234abcd"));
    expect(store.resolveRef("#5F8A").id).toBe("5f8a4d25");
    expect(normalizeRef("  #5F8A ")).toBe("5f8a");
  });

  it("préfixe ambigu → ambiguous_ref avec la liste", () => {
    const store = createStore(home());
    store.saveJob(makeJob("ab12cdef"));
    store.saveJob(makeJob("ab34cdef"));
    try {
      store.resolveRef("ab");
      expect.unreachable();
    } catch (e) {
      expect((e as { code: string }).code).toBe("ambiguous_ref");
      expect((e as { matches: Job[] }).matches).toHaveLength(2);
    }
  });

  it("inconnu → not_found", () => {
    const store = createStore(home());
    expect(() => store.resolveRef("ffff")).toThrow(expect.objectContaining({ code: "not_found" }));
  });
});

describe("tryLock", () => {
  it("un second verrou échoue tant que le premier n'est pas relâché ; un verrou plus vieux que staleMs est repris", () => {
    const path = join(home(), "x.lock");
    const release = tryLock(path);
    expect(release).toBeTypeOf("function");
    expect(tryLock(path)).toBeNull();
    release!();
    expect(existsSync(path)).toBe(false);
    const again = tryLock(path)!;
    const old = new Date(Date.now() - 60_000);
    utimesSync(path, old, old);
    const stolen = tryLock(path, 30_000);
    expect(stolen).toBeTypeOf("function");
    stolen!();
    again();
  });
});
