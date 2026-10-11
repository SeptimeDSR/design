import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../cli";
import type { JobRequest } from "../pipeline";
import { createStore } from "../store";
import { seedJob } from "./fixtures/fake-factory";

const cap = () => {
  let text = "";
  return { stream: new Writable({ write(c, _e, d) { text += c; d(); } }), get text() { return text; } };
};
const saved = { ...process.env };
afterEach(() => { for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved); });
function home() {
  const h = mkdtempSync(join(tmpdir(), "cli-film-"));
  process.env.VIRAL_HOME = h;
  process.env.VIRAL_PUBLISH_MODE = "manual";
  process.env.VIRAL_WEBHOOK_URL = "";
  return { h, store: createStore(h) };
}
const absent = async () => ({ ok: false as const, reason: "absent" as const, message: "non" });
const FILM = { title: "La dette", scenes: [{ title: "S", shots: [{ narration: "Il pleuvait ce soir là sur la ville depuis très longtemps maintenant." }, { narration: "Je ne signerai pas ce papier, dit-elle." }] }] };

describe("septim video : durée, genre, format, qualité", () => {
  it("un film sans usine en arrière-plan : estimation affichée, demande transmise, résumé final", async () => {
    const { store } = home();
    const seen: JobRequest[] = [];
    const runJob = async (req: JobRequest) => { seen.push(req); const j = seedJob(store, "5f8a2222", req as never); j.kind = "long"; j.timeline.durationMs = 3_600_000; store.saveJob(j); return j; };
    const out = cap();
    const code = await runCli(["la", "dette", "--duree", "1h", "--genre", "Drame", "--qualite", "eco", "--format", "vertical", "--no-notify"], { out: out.stream, err: cap().stream }, { runJob, remote: absent });
    expect(code).toBe(0);
    expect(seen[0]).toMatchObject({ topic: "la dette", durationSec: 3600, genre: "drame", quality: "eco", orientation: "vertical" });
    expect(out.text).toMatch(/Film de 1 h/);
    expect(out.text).toMatch(/place disque/);
    expect(out.text).toMatch(/Durée : 1 h/);
  });

  it("usine en arrière-plan : le film lui est confié, le terminal peut se fermer", async () => {
    home();
    let body: Record<string, unknown> = {};
    const runJob = async () => { throw new Error("ne doit pas tourner ici"); };
    const out = cap();
    const code = await runCli(["la", "dette", "--duree", "90min", "--no-notify"], { out: out.stream, err: cap().stream }, { runJob: runJob as never, remote: async (_e, _m, _p, b) => ((body = b as never), { ok: true as const, json: { id: "ab12" } }) });
    expect(code).toBe(0);
    expect(body).toMatchObject({ topic: "la dette", durationSec: 5400 });
    expect(out.text).toMatch(/arrière-plan \(tâche ab12\)/);
    expect(out.text).toContain("septim annuler ab12");
  });

  it("refus de l'usine : son message est affiché, code 1", async () => {
    home();
    const err = cap();
    const code = await runCli(["x", "--duree", "1h", "--no-notify"], { out: cap().stream, err: err.stream }, { remote: async () => ({ ok: false as const, reason: "error" as const, message: "Genre inconnu" }) });
    expect(code).toBe(1);
    expect(err.text).toContain("Genre inconnu");
  });

  it("durée trop courte, genre ou format faux : erreur claire", async () => {
    home();
    const io = { out: cap().stream, err: cap().stream };
    await expect(runCli(["x", "--duree", "5s"], io)).rejects.toThrow(/courte/);
    await expect(runCli(["x", "--duree", "1h", "--genre", "western"], io)).rejects.toThrow(/Genre inconnu/);
    await expect(runCli(["x", "--format", "carré"], io)).rejects.toThrow(/paysage/);
    await expect(runCli(["x", "--qualite", "ultra"], io)).rejects.toThrow(/eco/);
  });

  it("45 s : format court, la durée est transmise, aucune usine sollicitée", async () => {
    const { store } = home();
    const seen: JobRequest[] = [];
    const runJob = async (req: JobRequest) => (seen.push(req), seedJob(store, "5f8a3333", req as never));
    const code = await runCli(["la", "tontine", "--duree", "45s", "--no-notify"], { out: cap().stream, err: cap().stream }, { runJob, remote: async () => { throw new Error("pas pour un court"); } });
    expect(code).toBe(0);
    expect(seen[0].durationSec).toBe(45);
  });

  it("--script avec des scènes est un film ; --lint-only le contrôle", async () => {
    home();
    const f = join(mkdtempSync(join(tmpdir(), "film-")), "film.json");
    writeFileSync(f, JSON.stringify(FILM));
    process.env.SEPTIM_CWD = "/";
    const out = cap();
    const code = await runCli(["--lint-only", "--script", f, "--duree", "1h"], { out: out.stream, err: cap().stream });
    expect(code).toBe(1);
    expect(out.text).toMatch(/film\.duration/);
    const out2 = cap();
    expect(await runCli(["--lint-only", "--script", f], { out: out2.stream, err: cap().stream })).toBe(0);
    expect(out2.text).toContain("✓ Film conforme");
    let body: Record<string, unknown> = {};
    await runCli(["--script", f, "--duree", "15s", "--no-notify"], { out: cap().stream, err: cap().stream }, { remote: async (_e, _m, _p, b) => ((body = b as never), { ok: true as const, json: { id: "z" } }) });
    expect((body.film as { title: string }).title).toBe("La dette");
  });
});
