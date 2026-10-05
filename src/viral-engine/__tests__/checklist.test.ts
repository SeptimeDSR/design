import { describe, expect, it } from "vitest";
import checklist from "../viral-checklist.json";
import { RULES } from "../checklist";

describe("viral checklist", () => {
  it("garde les 8 règles du prompt utilisateur", () => {
    for (const key of [
      "hook_first_3_sec",
      "curiosity_gap",
      "pattern_interrupt_3sec",
      "sound_template",
      "voice",
      "variable_reward",
      "cta_save",
      "site_sticky_rules",
    ]) {
      expect(checklist).toHaveProperty(key);
    }
  });

  it("expose les seuils chiffrés du spec", () => {
    expect(RULES.hookMaxSeconds).toBe(3);
    expect(RULES.payoffMinRatio).toBe(0.8);
    expect(RULES.beatMaxSeconds).toBe(3.5);
    expect(RULES.voiceSpeed).toBe(1.1);
    expect(RULES.wordsPerSecond).toEqual({ fr: 3.0, en: 3.2 });
    expect(RULES.targetSeconds).toEqual([20, 60]);
    expect(RULES.cta.fr).toBe("Garde ça, tu vas en avoir besoin demain.");
  });
});
