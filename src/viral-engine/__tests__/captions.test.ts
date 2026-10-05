import { describe, expect, it } from "vitest";
import { pageCaptions, wordTimings } from "../captions";

describe("wordTimings", () => {
  it("couvre exactement l'intervalle, dans l'ordre", () => {
    const w = wordTimings("a bb ccc", 0, 900);
    expect(w.map((x) => x.text)).toEqual(["a", "bb", "ccc"]);
    expect(w[0].startMs).toBe(0);
    expect(w.at(-1)?.endMs).toBe(900);
    for (let i = 1; i < w.length; i++) expect(w[i].startMs).toBe(w[i - 1].endMs);
  });

  it("donne plus de temps aux mots longs", () => {
    const [a, b] = wordTimings("a anticonstitutionnellement", 1000, 2000);
    expect(b.endMs - b.startMs).toBeGreaterThan(a.endMs - a.startMs);
  });

  it("renvoie une liste vide pour un texte vide", () => {
    expect(wordTimings("  ", 0, 100)).toEqual([]);
  });
});

describe("pageCaptions", () => {
  it("jamais plus de 3 mots par page", () => {
    const pages = pageCaptions(wordTimings("un deux trois quatre cinq six sept", 0, 7000));
    for (const p of pages) expect(p.length).toBeLessThanOrEqual(3);
  });

  it("coupe après une question", () => {
    const pages = pageCaptions(wordTimings("Tu sais pourquoi ? Moi oui", 0, 3000));
    expect(pages[0].at(-1)?.text).toBe("pourquoi ?");
  });
});
