import { describe, expect, it } from "vitest";
import { buildTimeline, lintScript, normalizeBeats } from "../story";
import { estimateSpokenMs, fallbackScript } from "../heat";
import type { ViralScript } from "../types";

const base = (): ViralScript => fallbackScript({ topic: "le mobile money", lang: "fr", formula: "secret", template: "story" });

describe("normalizeBeats", () => {
  it("coupe un beat trop long en morceaux de 3,5 s maximum", () => {
    const long = { text: Array.from({ length: 30 }, (_, i) => `mot${i}`).join(" ") };
    const beats = normalizeBeats([long], "fr");
    expect(beats.length).toBeGreaterThan(1);
    for (const b of beats) expect(estimateSpokenMs(b.text, "fr")).toBeLessThanOrEqual(3500);
  });

  it("coupe de préférence à la ponctuation", () => {
    const beats = normalizeBeats([{ text: "Un deux trois quatre cinq six sept, huit neuf dix onze douze treize quatorze." }], "fr");
    expect(beats[0].text.endsWith(",")).toBe(true);
  });

  it("laisse un beat court intact", () => {
    expect(normalizeBeats([{ text: "Court." }], "fr")).toEqual([{ text: "Court." }]);
  });
});

describe("buildTimeline", () => {
  it("enchaîne hook, beats, payoff, cta sans trou", () => {
    const t = buildTimeline(base());
    expect(t.segments[0].kind).toBe("hook");
    expect(t.segments.at(-1)?.kind).toBe("cta");
    expect(t.segments.at(-2)?.kind).toBe("payoff");
    for (let i = 1; i < t.segments.length; i++) expect(t.segments[i].startMs).toBe(t.segments[i - 1].endMs);
    expect(t.durationMs).toBe(t.segments.at(-1)?.endMs);
  });

  it("utilise les durées réelles du TTS quand elles sont fournies", () => {
    const s = base();
    const n = 1 + s.beats.length + 2;
    const t = buildTimeline(s, Array(n).fill(1000));
    expect(t.durationMs).toBe(n * 1000);
  });
});

describe("lintScript", () => {
  it("le script de secours est conforme", () => {
    const s = base();
    expect(lintScript(s, buildTimeline(s))).toEqual([]);
  });

  it("refuse une réponse donnée trop tôt", () => {
    const s = { ...base(), beats: base().beats.slice(0, 1) };
    expect(lintScript(s, buildTimeline(s)).map((i) => i.rule)).toContain("payoff.too_early");
  });

  it("exige un CTA de sauvegarde", () => {
    const s = { ...base(), cta: "Abonne-toi." };
    expect(lintScript(s, buildTimeline(s)).map((i) => i.rule)).toContain("cta.missing");
  });

  it("signale un beat trop long", () => {
    const s = { ...base(), beats: [...base().beats, { text: Array(20).fill("mot").join(" ") }] };
    expect(lintScript(s, buildTimeline(s)).map((i) => i.rule)).toContain("beat.too_long");
  });
});

describe("scripts de secours, tous cas", () => {
  const topic = "la reine Njinga du royaume de Ndongo et Matamba face aux Portugais";
  for (const lang of ["fr", "en"] as const) {
    for (const formula of ["question", "choc", "secret", "contre-intuitif"] as const) {
      it(`${lang}/${formula} avec un sujet long reste conforme après normalisation`, () => {
        const s = fallbackScript({ topic, lang, formula, template: "film" });
        const normalized = { ...s, beats: normalizeBeats(s.beats, lang) };
        expect(lintScript(normalized, buildTimeline(normalized))).toEqual([]);
      });
    }
  }
});
