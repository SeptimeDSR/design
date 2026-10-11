import { describe, expect, it } from "vitest";
import { lintFilm, normalizeFilm } from "../film/types";
import { estimateFilmSeconds, planFilm, wordsFor } from "../film/plan";

describe("planFilm : combien de scènes pour la durée demandée", () => {
  it.each([
    [120, 2, 60],
    [600, 10, 60],
    [1800, 18, 100],
    [3600, 24, 150],
    [7200, 40, 180],
    [14400, 80, 180],
  ])("%i s → %i scènes de %i s", (duration, scenes, sceneSec) => {
    expect(planFilm(duration)).toMatchObject({ scenes, sceneSec });
  });

  it("une scène minimum, et le total retombe sur la durée demandée à une scène près", () => {
    expect(planFilm(61).scenes).toBeGreaterThanOrEqual(1);
    for (const d of [90, 300, 900, 2700, 5400, 9000]) {
      const p = planFilm(d);
      expect(Math.abs(p.scenes * p.sceneSec - d)).toBeLessThanOrEqual(p.sceneSec);
    }
  });

  it("les actes : 3 au plus court, 5 pour un long métrage, jamais plus d'actes que de scènes", () => {
    expect(planFilm(120).acts).toBe(2);
    expect(planFilm(600).acts).toBe(3);
    expect(planFilm(3600).acts).toBe(5);
    expect(planFilm(61).acts).toBe(1);
  });

  it("mots visés par scène : la voix dit ~2,6 mots par seconde en français", () => {
    expect(wordsFor(150, "fr")).toBe(390);
    expect(wordsFor(150, "en")).toBeGreaterThan(390);
    const p = planFilm(3600);
    expect(p.wordsPerScene).toBe(wordsFor(p.sceneSec, "fr"));
    expect(p.shotsPerScene).toBeGreaterThanOrEqual(8);
  });
});

const shot = (narration: string, extra: object = {}) => ({ narration, visual: "old kitchen at night", ...extra });
const film = (over: object = {}) => ({
  title: "La dette",
  logline: "Une mère doit rembourser ce qu'elle n'a jamais emprunté.",
  lang: "fr",
  genre: "drame",
  characters: [
    { name: "Mireille", gender: "f", description: "mère de famille" },
    { name: "Paul", gender: "h" },
  ],
  scenes: [{ title: "Le courrier", location: "kitchen", mood: "tension", shots: [shot("Le courrier est arrivé ce matin."), shot("Je ne l'ai pas signé.", { speaker: "Mireille" })] }],
  caption: "Une dette venue de nulle part.",
  hashtags: ["#drame"],
  ...over,
});

describe("normalizeFilm : accepte ce que Claude ou un LLM écrit, refuse le reste", () => {
  it("complète les valeurs absentes (langue, genre, humeur) sans rien inventer d'autre", () => {
    const f = normalizeFilm({ title: "T", scenes: [{ title: "S", shots: [{ narration: "Une phrase." }] }] }, { lang: "fr" });
    expect(f).not.toBeNull();
    expect(f!.lang).toBe("fr");
    expect(f!.scenes[0].mood).toBe("calme");
    expect(f!.characters).toEqual([]);
    expect(f!.scenes[0].shots[0].visual).toBeUndefined();
  });

  it("accepte des plans donnés en simples phrases", () => {
    const f = normalizeFilm({ title: "T", scenes: [{ title: "S", shots: ["Une phrase.", "Deux."] }] }, { lang: "fr" });
    expect(f!.scenes[0].shots.map((s) => s.narration)).toEqual(["Une phrase.", "Deux."]);
  });

  it("renvoie null quand il n'y a rien à raconter", () => {
    expect(normalizeFilm({}, { lang: "fr" })).toBeNull();
    expect(normalizeFilm({ title: "T", scenes: [] }, { lang: "fr" })).toBeNull();
    expect(normalizeFilm({ title: "T", scenes: [{ title: "S", shots: [] }] }, { lang: "fr" })).toBeNull();
    expect(normalizeFilm("pas un objet", { lang: "fr" })).toBeNull();
  });

  it("coupe un plan trop long en plusieurs plans (la voix et l'image restent synchrones)", () => {
    const long = Array.from({ length: 120 }, (_, i) => `mot${i}`).join(" ") + ".";
    const f = normalizeFilm({ title: "T", scenes: [{ title: "S", shots: [{ narration: long, visual: "sea" }] }] }, { lang: "fr" });
    expect(f!.scenes[0].shots.length).toBeGreaterThan(1);
    for (const s of f!.scenes[0].shots) expect(s.narration.split(/\s+/).length).toBeLessThanOrEqual(60);
    expect(f!.scenes[0].shots.every((s) => s.visual === "sea")).toBe(true);
  });
});

describe("lintFilm", () => {
  it("un film conforme ne signale rien", () => {
    const f = normalizeFilm(film(), { lang: "fr" })!;
    expect(lintFilm(f)).toEqual([]);
  });

  it("signale un titre vide, un personnage inconnu qui parle et une durée très loin de la demande", () => {
    const f = normalizeFilm(film({ title: " ", scenes: [{ title: "S", shots: [shot("Bonjour.", { speaker: "Inconnu" })] }] }), { lang: "fr" })!;
    const rules = lintFilm(f, { targetSec: 3600 }).map((i) => i.rule);
    expect(rules).toContain("film.title");
    expect(rules).toContain("film.speaker_unknown");
    expect(rules).toContain("film.duration");
  });

  it("estimateFilmSeconds lit les mots du film, pas le nombre de plans", () => {
    const f = normalizeFilm(film(), { lang: "fr" })!;
    expect(estimateFilmSeconds(f)).toBeGreaterThan(2);
    expect(estimateFilmSeconds(f)).toBeLessThan(20);
  });
});
