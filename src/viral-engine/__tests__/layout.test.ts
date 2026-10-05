import { describe, expect, it } from "vitest";
import { LAYOUT, SAFE, VIEW, bigWordSize, chapterLabel, countUpText, fitFontSize, hookState, sceneFor, sfxCues, textWidth } from "../../remotion/viral/layout";
import { captionPages } from "../../remotion/viral/props";
import { fallbackScript } from "../heat";
import { buildTimeline } from "../story";
import type { ViralScript } from "../types";

const TONTINE: ViralScript = {
  ...fallbackScript({ topic: "la tontine", lang: "fr", formula: "question", template: "maths" }),
  hook: "Tu es le dernier à bouffer la tontine ?",
  beats: [
    { text: "Dix membres, 50 000 F chacun, chaque mois.", emphasis: "50 000 F" },
    { text: "La cagnotte fait 500 000 F.", emphasis: "500 000 F" },
    { text: "Le dernier, lui, cotise dix mois.", emphasis: "dernier" },
    { text: "Et récupère seulement son propre argent.", emphasis: "seulement" },
  ],
  payoff: "La réponse : le dernier perd environ 9 400 F.",
};
const timeline = buildTimeline(TONTINE);

describe("mise en page : zone sûre TikTok, Reels, Shorts", () => {
  it("la zone sûre laisse libres le haut (onglets), le bas (légende, musique) et la droite (boutons)", () => {
    expect(VIEW).toEqual({ width: 1080, height: 1920 });
    expect(SAFE.top).toBeGreaterThanOrEqual(200);
    expect(SAFE.bottom).toBeLessThanOrEqual(1480);
    expect(SAFE.right).toBeLessThanOrEqual(940);
    expect(SAFE.left).toBeGreaterThanOrEqual(60);
  });

  it("chaque bloc de texte des templates tient dans la zone sûre", () => {
    for (const [name, box] of Object.entries(LAYOUT)) {
      expect(box.top, name).toBeGreaterThanOrEqual(SAFE.top);
      expect(box.top + box.height, name).toBeLessThanOrEqual(SAFE.bottom);
      expect(box.left, name).toBeGreaterThanOrEqual(SAFE.left);
      expect(box.left + box.width, name).toBeLessThanOrEqual(SAFE.right);
    }
  });

  it("le mot géant ne déborde jamais : la taille s'ajuste à la largeur", () => {
    for (const word of ["prêt", "seulement", "500 000 F", "contre-intuitif", "anticonstitutionnellement"]) {
      const size = fitFontSize(word, { maxWidth: LAYOUT.bigWord.width, maxSize: 230, minSize: 70, em: 0.62 });
      expect(size, word).toBeLessThanOrEqual(230);
      expect(textWidth(word, size, 0.62), word).toBeLessThanOrEqual(LAYOUT.bigWord.width);
    }
    expect(fitFontSize("prêt", { maxWidth: 860, maxSize: 230, em: 0.62 })).toBe(230);
  });

  it("mot fort sur une ou deux lignes : il remplit la boîte sans jamais en sortir", () => {
    for (const word of ["prêt", "500 000 F", "Chaque mois d'attente", "anticonstitutionnellement", "9 400 F"]) {
      const { size, lines } = bigWordSize(word, 0.6);
      expect(lines.length, word).toBeLessThanOrEqual(2);
      for (const l of lines) expect(textWidth(l, size, 0.6), word).toBeLessThanOrEqual(LAYOUT.bigWord.width);
      expect(lines.length * size * 1.0, word).toBeLessThanOrEqual(LAYOUT.bigWord.height);
    }
    expect(bigWordSize("prêt", 0.6).size).toBe(240);
    expect(bigWordSize("Chaque mois d'attente", 0.6).lines).toHaveLength(2);
    // Un nombre ne se coupe jamais (« 50 / 000 F » se lirait 50).
    expect(bigWordSize("50 000 F", 0.6).lines).toEqual(["50 000 F"]);
    expect(bigWordSize("1 250 000 FCFA", 0.6).lines).toEqual(["1 250 000 FCFA"]);
    // fit < 1 : le mot laisse de la place autour (cercle de la réponse en maths).
    const ratio = 0.72;
    expect(textWidth("9 400 F", bigWordSize("9 400 F", 0.6, 240, ratio).size, 0.6)).toBeLessThanOrEqual(LAYOUT.bigWord.width * ratio);
  });
});

describe("le hook se lit en entier dès la première image", () => {
  it("à 0 ms, la carte du hook montre la phrase entière ; elle disparaît à la fin du hook", () => {
    const start = hookState(timeline, 0);
    expect(start.visible).toBe(true);
    expect(start.words.map((w) => w.text).join(" ")).toBe("Tu es le dernier à bouffer la tontine ?");
    expect(start.fontSize).toBeGreaterThanOrEqual(96);
    const hookEnd = timeline.segments[0].endMs;
    expect(hookState(timeline, hookEnd).visible).toBe(false);
  });

  it("les sous-titres ne doublent pas le hook : ils commencent au premier beat", () => {
    const pages = captionPages(timeline);
    expect(pages[0].segment.kind).toBe("beat");
    expect(pages.every((p) => p.words.length <= 3)).toBe(true);
  });
});

describe("rythme : un changement visuel par segment", () => {
  it("deux segments qui se suivent n'ont jamais la même scène", () => {
    for (let i = 1; i < timeline.segments.length; i++) {
      const a = sceneFor(TONTINE, timeline, i - 1);
      const b = sceneFor(TONTINE, timeline, i);
      expect(`${a.hue}|${a.variant}|${a.word}`, `segment ${i}`).not.toBe(`${b.hue}|${b.variant}|${b.word}`);
    }
  });

  it("le mot fort d'un beat est son emphase, celui du payoff est la réponse chiffrée", () => {
    expect(sceneFor(TONTINE, timeline, 1).word).toBe("50 000 F");
    const payoff = timeline.segments.findIndex((s) => s.kind === "payoff");
    expect(sceneFor(TONTINE, timeline, payoff).word).toBe("9 400 F");
  });

  it("film : les chapitres commencent à I au premier beat", () => {
    expect(chapterLabel(timeline, 0, "fr")).toBe("PROLOGUE");
    expect(chapterLabel(timeline, 1, "fr")).toBe("I");
    expect(chapterLabel(timeline, 2, "fr")).toBe("II");
    const payoff = timeline.segments.findIndex((s) => s.kind === "payoff");
    expect(chapterLabel(timeline, payoff, "fr")).toBe("LA RÉPONSE");
  });

  it("compteur : les nombres montent depuis 0 en gardant leur écriture (espaces, unité)", () => {
    expect(countUpText("9 400 F", 1)).toBe("9 400 F");
    expect(countUpText("9 400 F", 0.5)).toBe("4 700 F");
    expect(countUpText("9 400 F", 0)).toBe("0 F");
    expect(countUpText("500 000", 0.25)).toBe("125 000");
    expect(countUpText("5 %", 0.5)).toBe("3 %");
    expect(countUpText("dernier", 0.3)).toBe("dernier");
  });
});

describe("bruitages générés : impact, whoosh à chaque coupe, montée, ding sur la réponse", () => {
  it("les repères suivent la timeline", () => {
    const cues = sfxCues(timeline);
    const payoff = timeline.segments.find((s) => s.kind === "payoff")!;
    expect(cues[0]).toMatchObject({ kind: "hit", atMs: 0 });
    for (const s of timeline.segments.slice(1)) {
      if (s.kind !== "payoff") expect(cues.some((c) => c.kind === "whoosh" && c.atMs === s.startMs), `${s.kind} ${s.startMs}`).toBe(true);
    }
    expect(cues.find((c) => c.kind === "ding")?.atMs).toBe(payoff.startMs);
    const riser = cues.find((c) => c.kind === "riser")!;
    expect(riser.atMs).toBeLessThan(payoff.startMs);
    expect(riser.atMs).toBeGreaterThanOrEqual(0);
    for (const c of cues) expect(c.atMs).toBeLessThan(timeline.durationMs);
  });
});
