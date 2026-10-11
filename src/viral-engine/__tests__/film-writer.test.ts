import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { planFilm } from "../film/plan";
import { FilmError, writeFilm } from "../film/writer";

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "film-writer-"));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

const sentence = (n: number) => Array.from({ length: n }, (_, i) => `mot${i}`).join(" ") + ".";

// Un faux écrivain qui répond selon le schéma JSON demandé dans le prompt.
function fakeWriter(opts: { shotWords?: number; shots?: number; failBibleOnce?: boolean; scenesPerCall?: (asked: number) => number } = {}) {
  const calls: string[] = [];
  let bibleFailed = false;
  const chat = async (prompt: string) => {
    calls.push(prompt);
    if (prompt.includes('"acts"')) {
      if (opts.failBibleOnce && !bibleFailed) {
        bibleFailed = true;
        return "voici mon histoire, sans JSON";
      }
      return JSON.stringify({
        title: "La dette",
        logline: "Une mère doit rembourser ce qu'elle n'a pas emprunté.",
        characters: [{ name: "Mireille", gender: "femme", description: "mère" }, { name: "Paul", gender: "homme" }],
        acts: Array.from({ length: 5 }, (_, i) => ({ title: `Acte ${i + 1}`, summary: `Résumé ${i + 1}` })),
        caption: "Une dette.",
        hashtags: ["#drame"],
      });
    }
    if (prompt.includes('"location"')) {
      const asked = Number(/EXACTEMENT (\d+) scènes/.exec(prompt)?.[1] ?? 1);
      const n = opts.scenesPerCall ? opts.scenesPerCall(asked) : asked;
      return JSON.stringify({ scenes: Array.from({ length: n }, (_, i) => ({ title: `Scène ${calls.length}-${i}`, summary: `Il se passe ${i}.`, location: "kitchen", mood: i % 2 ? "tension" : "calme" })) });
    }
    // une scène : des plans
    return JSON.stringify({
      shots: Array.from({ length: opts.shots ?? 12 }, (_, i) => ({ narration: sentence(opts.shotWords ?? 30), speaker: i % 4 === 3 ? "Mireille" : "", visual: "old kitchen at night" })),
    });
  };
  return { chat, calls };
}

describe("writeFilm : l'histoire s'écrit par morceaux, pas d'un seul coup", () => {
  it("un film d'une heure : le nombre de scènes demandé, les actes, les personnages et un point de reprise par étape", async () => {
    const dir = tmp();
    const w = fakeWriter();
    const progress: string[] = [];
    const film = await writeFilm({ topic: "la dette", lang: "fr", genre: "drame", durationSec: 3600, dir, llm: { chat: w.chat }, onProgress: (p) => progress.push(`${p.done}/${p.total}`) });
    const plan = planFilm(3600);
    expect(film.scenes).toHaveLength(plan.scenes);
    expect(film.title).toBe("La dette");
    expect(film.genre).toBe("drame");
    expect(film.characters.map((c) => c.gender)).toEqual(["f", "h"]);
    expect(film.scenes.every((s) => s.shots.length >= 10 && s.shots.every((sh) => sh.narration.length > 0))).toBe(true);
    expect(film.scenes[0].shots.some((s) => s.speaker === "Mireille")).toBe(true);
    // 1 appel pour la bible + 1 par acte + 1 par scène
    expect(w.calls.length).toBe(1 + plan.acts + plan.scenes);
    const files = readdirSync(join(dir, "story"));
    expect(files).toContain("bible.json");
    expect(files.filter((f) => /^scene-\d+\.json$/.test(f))).toHaveLength(plan.scenes);
    expect(progress.at(-1)).toMatch(/^(\d+)\/\1$/);
  });

  it("reprend où il s'est arrêté : une scène déjà écrite n'est jamais réécrite", async () => {
    const dir = tmp();
    const first = fakeWriter();
    await writeFilm({ topic: "la dette", lang: "fr", genre: "drame", durationSec: 600, dir, llm: { chat: first.chat } });
    const second = fakeWriter();
    const film = await writeFilm({ topic: "la dette", lang: "fr", genre: "drame", durationSec: 600, dir, llm: { chat: second.chat } });
    expect(second.calls).toHaveLength(0);
    expect(film.scenes).toHaveLength(planFilm(600).scenes);
  });

  it("plante au milieu, puis reprend : seules les scènes manquantes sont écrites", async () => {
    const dir = tmp();
    let n = 0;
    const base = fakeWriter();
    const flaky = async (prompt: string) => {
      if (!prompt.includes('"acts"') && !prompt.includes('"location"') && ++n === 4) throw new Error("fetch failed");
      return base.chat(prompt);
    };
    await expect(writeFilm({ topic: "t", lang: "fr", genre: "drame", durationSec: 600, dir, llm: { chat: flaky } })).rejects.toBeInstanceOf(FilmError);
    const again = fakeWriter();
    const film = await writeFilm({ topic: "t", lang: "fr", genre: "drame", durationSec: 600, dir, llm: { chat: again.chat } });
    expect(film.scenes).toHaveLength(planFilm(600).scenes);
    expect(again.calls.length).toBeLessThanOrEqual(planFilm(600).scenes - 3 + 0);
  });

  it("une réponse sans JSON est redemandée ; trois échecs d'affilée arrêtent avec un message clair", async () => {
    const ok = await writeFilm({ topic: "t", lang: "fr", genre: "drame", durationSec: 120, dir: tmp(), llm: { chat: fakeWriter({ failBibleOnce: true }).chat } });
    expect(ok.scenes.length).toBeGreaterThan(0);
    await expect(writeFilm({ topic: "t", lang: "fr", genre: "drame", durationSec: 120, dir: tmp(), llm: { chat: async () => "bla bla" } })).rejects.toThrow(/illisible|JSON/i);
  });

  it("Ollama absent : le message dit quoi faire (Ollama ou un script écrit par Claude), il n'invente aucune histoire", async () => {
    const dir = tmp();
    const err = await writeFilm({ topic: "t", lang: "fr", genre: "drame", durationSec: 120, dir, llm: { chat: async () => Promise.reject(new Error("fetch failed")) } }).catch((e) => e);
    expect(err).toBeInstanceOf(FilmError);
    expect(err.message).toMatch(/ollama/i);
    expect(err.message).toMatch(/--script|Claude/);
    expect(existsSync(join(dir, "story", "scene-00.json"))).toBe(false);
  });

  it("une scène trop courte est prolongée (suite demandée) jusqu'à environ la durée visée", async () => {
    const dir = tmp();
    let sceneCalls = 0;
    const base = fakeWriter({ shots: 3, shotWords: 20 });
    const chat = async (prompt: string) => {
      if (!prompt.includes('"acts"') && !prompt.includes('"location"')) sceneCalls++;
      return base.chat(prompt);
    };
    const film = await writeFilm({ topic: "t", lang: "fr", genre: "drame", durationSec: 120, dir, llm: { chat } });
    expect(sceneCalls).toBeGreaterThan(film.scenes.length); // au moins une suite demandée
    expect(sceneCalls).toBeLessThanOrEqual(film.scenes.length * 3); // jamais plus de deux suites par scène
  });

  it("un modèle qui renvoie moins de scènes que demandé : les scènes manquantes sont comblées, le film garde sa durée", async () => {
    const film = await writeFilm({ topic: "t", lang: "fr", genre: "thriller", durationSec: 600, dir: tmp(), llm: { chat: fakeWriter({ scenesPerCall: (asked) => Math.max(1, asked - 1) }).chat } });
    expect(film.scenes).toHaveLength(planFilm(600).scenes);
  });

  it("annulable : un signal d'arrêt coupe l'écriture entre deux scènes", async () => {
    const ctl = new AbortController();
    const base = fakeWriter();
    let scenes = 0;
    const chat = async (p: string) => {
      if (!p.includes('"acts"') && !p.includes('"location"') && ++scenes === 2) ctl.abort();
      return base.chat(p);
    };
    await expect(writeFilm({ topic: "t", lang: "fr", genre: "drame", durationSec: 600, dir: tmp(), llm: { chat }, signal: ctl.signal })).rejects.toThrow(/annul|arrêt/i);
  });
});
