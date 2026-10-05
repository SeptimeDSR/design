import { describe, expect, it } from "vitest";
import { allArms, armKey, chooseArm, mulberry32, rewardFromViews, updateArm, type BanditState } from "../bandit";

describe("bandit (auto-amélioration)", () => {
  it("12 bras = 3 templates × 4 formules", () => {
    expect(allArms()).toHaveLength(12);
    expect(allArms()).toContain(armKey("story", "question"));
    expect(armKey("film", "secret")).toBe("film:secret");
  });

  it("converge vers le bras qui gagne", () => {
    let state: BanditState = {};
    for (let i = 0; i < 200; i++) {
      for (const arm of allArms()) state = updateArm(state, arm, arm === "story:question" ? 1 : 0);
    }
    const rng = mulberry32(42);
    let wins = 0;
    for (let i = 0; i < 100; i++) if (chooseArm(state, allArms(), rng) === "story:question") wins++;
    expect(wins).toBeGreaterThanOrEqual(90);
  });

  it("explore quand il ne sait rien", () => {
    const rng = mulberry32(7);
    const picks = new Set(Array.from({ length: 200 }, () => chooseArm({}, allArms(), rng)));
    expect(picks.size).toBeGreaterThanOrEqual(8);
  });

  it("updateArm ne modifie pas l'état reçu", () => {
    const state: BanditState = { "story:question": { alpha: 1, beta: 1 } };
    const next = updateArm(state, "story:question", 1);
    expect(state["story:question"]).toEqual({ alpha: 1, beta: 1 });
    expect(next["story:question"]).toEqual({ alpha: 2, beta: 1 });
  });

  it("récompense = au moins la médiane des vues passées", () => {
    expect(rewardFromViews(10, [1, 5, 20])).toBe(1);
    expect(rewardFromViews(4, [1, 5, 20])).toBe(0);
    expect(rewardFromViews(3, [])).toBe(1);
    expect(rewardFromViews(0, [])).toBe(0);
  });

  it("mulberry32 est déterministe", () => {
    expect(mulberry32(1)()).toBe(mulberry32(1)());
  });
});
