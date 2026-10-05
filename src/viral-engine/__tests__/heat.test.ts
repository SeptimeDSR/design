import { describe, expect, it } from "vitest";
import { buildHeatPrompt, estimateSpokenMs, fallbackScript, lintHook, parseHeatResponse } from "../heat";
import { RULES } from "../checklist";
import { FORMULAS, TEMPLATES, type Lang } from "../types";

const USER_HOOK = "Et si ta clé ne rentrait plus chez toi ?";

describe("estimateSpokenMs", () => {
  it("le hook d'exemple de l'utilisateur tient en 3 s à 1,1×", () => {
    expect(estimateSpokenMs(USER_HOOK, "fr", 1.1)).toBeLessThanOrEqual(3000);
  });

  it("ajoute une pause par ponctuation forte", () => {
    expect(estimateSpokenMs("Stop. Stop.", "en", 1)).toBeGreaterThan(estimateSpokenMs("Stop stop", "en", 1));
  });
});

describe("lintHook", () => {
  it("accepte le hook d'exemple", () => {
    expect(lintHook(USER_HOOK, "fr")).toEqual([]);
  });

  it("refuse un hook trop long", () => {
    const long = "Tu sais pourquoi " + "vraiment beaucoup trop de mots ici ".repeat(4) + "?";
    expect(lintHook(long, "fr").map((i) => i.rule)).toContain("hook.too_long");
  });

  it("exige le viewer et un trou de curiosité", () => {
    const rules = lintHook("La clé est importante.", "fr").map((i) => i.rule);
    expect(rules).toContain("hook.no_viewer");
    expect(rules).toContain("hook.no_gap");
  });

  it("refuse un hook vide", () => {
    expect(lintHook("   ", "en").map((i) => i.rule)).toContain("hook.empty");
  });
});

describe("parseHeatResponse", () => {
  it("lit un JSON entouré de balises", () => {
    expect(parseHeatResponse('```json\n{"hook":"x"}\n```')?.hook).toBe("x");
  });

  it("extrait le JSON d'une réponse bavarde", () => {
    expect(parseHeatResponse('Voici : {"hook":"y","beats":[{"text":"a"}]} voilà')?.beats?.[0].text).toBe("a");
  });

  it("renvoie null sur du texte", () => {
    expect(parseHeatResponse("pas du json")).toBeNull();
  });
});

describe("fallbackScript", () => {
  for (const lang of ["fr", "en"] as Lang[]) {
    for (const formula of FORMULAS) {
      it(`${lang}/${formula} : hook conforme et CTA de sauvegarde`, () => {
        const s = fallbackScript({ topic: "l'argent mobile", lang, formula, template: TEMPLATES[0] });
        expect(lintHook(s.hook, lang)).toEqual([]);
        expect(s.cta).toBe(RULES.cta[lang]);
        expect(s.beats.length).toBeGreaterThanOrEqual(6);
        expect(s.topic).toBe("l'argent mobile");
      });
    }
  }
});

describe("buildHeatPrompt", () => {
  it("transmet le sujet, la formule H.E.A.T et le format JSON", () => {
    const p = buildHeatPrompt({ topic: "le café", lang: "fr", formula: "secret", template: "story", trend: "#café" });
    expect(p).toContain("le café");
    expect(p).toContain("H.E.A.T");
    expect(p).toContain('"hook"');
    expect(p).toContain("#café");
  });
});
