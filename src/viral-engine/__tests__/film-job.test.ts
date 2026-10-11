import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hasFfmpeg } from "../film/ffmpeg";
import { longJobId } from "../film/job";
import { FilmError } from "../film/writer";
import { runJob } from "../pipeline";
import { createStore } from "../store";
import { encodeWav } from "../wav";

const homes: string[] = [];
const home = () => {
  const d = mkdtempSync(join(tmpdir(), "film-job-"));
  homes.push(d);
  return d;
};
afterEach(() => homes.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

const shot = (n: string, extra: object = {}) => ({ narration: n, visual: "rain city night", ...extra });
const film = {
  title: "La dette",
  logline: "Une mère doit rembourser.",
  characters: [{ name: "Mireille", gender: "f" }],
  scenes: [
    { title: "Le courrier", mood: "calme", shots: [shot("Il pleuvait ce soir là sur la ville."), shot("Je ne signerai pas ce papier.", { speaker: "Mireille" })] },
    { title: "La nuit", mood: "tension", shots: [shot("Paul se tut longtemps."), shot("La pluie tombait toujours.")] },
  ],
  caption: "Une dette venue de nulle part.",
  hashtags: ["#drame"],
};
const synth = async (text: string, o: { outPath: string }) => {
  const seconds = text.split(/\s+/).length * 0.3;
  writeFileSync(o.outPath, encodeWav(new Float32Array(Math.round(22050 * seconds)).map((_, i) => 0.1 * Math.sin(i / 15)), 22050));
  return { path: o.outPath, durationMs: seconds * 1000, engine: "piper" as const };
};
const filmDeps = (extra: object = {}) => ({ synth, hasVoice: () => true, freeMb: 100_000, ...extra });
const frame = { width: 320, height: 180, fps: 12, crf: 32 };

function deps(dir: string, extra: object = {}, sent: { text: string; media?: string }[] = []) {
  return {
    env: { VIRAL_HOME: dir, VIRAL_TTS: "piper", PEXELS_API_KEY: "" },
    notify: async (text: string, media?: string) => void sent.push({ text, media }),
    llm: async () => {
      throw new Error("pas d'Ollama");
    },
    film: { frame, ...filmDeps(extra) },
  };
}
const req = { topic: "la dette", lang: "fr" as const, genre: "drame" as const, durationSec: 20, orientation: "paysage" as const, quality: "eco" as const, film };

describe("longJobId : un film interrompu se reprend en relançant la même demande", () => {
  it("même demande → même identifiant ; autre durée ou autre sujet → autre identifiant ; toujours de l'hexadécimal", () => {
    const a = longJobId({ ...req });
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(longJobId({ ...req })).toBe(a);
    expect(longJobId({ ...req, durationSec: 60 })).not.toBe(a);
    expect(longJobId({ ...req, topic: "autre" })).not.toBe(a);
    expect(longJobId({ ...req, orientation: "vertical" })).not.toBe(a);
  });
});

describe.skipIf(!hasFfmpeg())("runJob en long métrage", () => {
  it("produit un job « film » : vidéo, chapitres, message sans la vidéo jointe (trop lourde pour WhatsApp)", async () => {
    const dir = home();
    const sent: { text: string; media?: string }[] = [];
    const job = await runJob(req, deps(dir, {}, sent));
    expect(job.status).toBe("notified");
    expect(job.kind).toBe("long");
    expect(existsSync(job.videoPath!)).toBe(true);
    expect(job.script.hook).toBe("La dette");
    expect(job.script.template).toBe("film");
    expect(job.timeline.durationMs).toBeGreaterThan(8000);
    expect(job.film?.chapters.map((c) => c.title)).toEqual(["Le courrier", "La nuit"]);
    expect(job.film?.scenes).toBe(2);
    expect(job.script.caption).toContain("00:00 Le courrier");
    expect(job.ttsEngine).toBe("piper");
    expect(job.broll?.source).toBe("procedural");
    expect(job.source).toBe("claude");
    const store = createStore(dir);
    expect(store.getJob(job.id)?.status).toBe("notified");
    expect(sent).toHaveLength(1);
    expect(sent[0].media).toBeUndefined();
    expect(sent[0].text).toContain(`OUI #${store.ref(job.id)}`);
    expect(sent[0].text).toMatch(/film/i);
    expect(sent[0].text).toContain(job.videoPath!);
  }, 120_000);

  it("rendu interrompu → job « ratée » ; la même demande relancée reprend CE job et le termine", async () => {
    const dir = home();
    let n = 0;
    const flaky = { beforeRender: (i: number) => { if (i === 1 && ++n === 1) throw new FilmError("coupure", "render"); } };
    const first = await runJob(req, deps(dir, flaky));
    expect(first.status).toBe("failed");
    expect(first.error).toMatch(/coupure/);
    const second = await runJob(req, deps(dir));
    expect(second.id).toBe(first.id);
    expect(second.status).toBe("notified");
  }, 120_000);

  it("un film terminé, même demande : un NOUVEAU film, jamais l'ancien écrasé", async () => {
    const dir = home();
    const a = await runJob(req, deps(dir));
    const b = await runJob(req, deps(dir));
    expect(b.id).not.toBe(a.id);
    expect(existsSync(a.videoPath!)).toBe(true);
  }, 120_000);

  it("pas de voix, pas de place : la tâche échoue avec le message, sans job fantôme", async () => {
    const dir = home();
    await expect(runJob(req, deps(dir, { freeMb: 5 }))).rejects.toThrow(/place/);
    await expect(runJob(req, { ...deps(dir, { engine: "silent", hasVoice: () => false }), env: { VIRAL_HOME: dir, VIRAL_TTS: "auto" } })).rejects.toThrow(/voix/i);
    expect(createStore(dir).listJobs()).toHaveLength(0);
  });

  it("la progression remonte (phase, pourcentage, message)", async () => {
    const dir = home();
    const seen: { phase: string; percent: number }[] = [];
    await runJob(req, { ...deps(dir), progress: (p: { phase: string; percent: number }) => void seen.push(p) });
    expect(seen.at(-1)?.percent).toBe(100);
    expect(new Set(seen.map((s) => s.phase))).toContain("rendu");
  }, 120_000);

  it("annulé : job « ratée » avec « annulée », reprise possible", async () => {
    const dir = home();
    const ctl = new AbortController();
    const job = await runJob(req, { ...deps(dir, { synth: async (t: string, o: { outPath: string }) => (ctl.abort(), synth(t, o)) }), signal: ctl.signal });
    expect(job.status).toBe("failed");
    expect(job.error).toMatch(/annul/i);
  }, 60_000);
});
