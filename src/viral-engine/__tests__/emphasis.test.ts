import { describe, expect, it } from "vitest";
import { emphasisOf } from "../../remotion/viral/props";

describe("emphasisOf", () => {
  it("prend le mot fort après les deux-points (la vraie réponse)", () => {
    expect(emphasisOf("The answer: the detail nobody looks at.")).toBe("detail");
    expect(emphasisOf("La réponse : le détail que personne ne regarde.")).toBe("personne");
  });

  it("respecte l'emphase fournie si elle est dans le texte", () => {
    expect(emphasisOf("Neuf personnes sur dix", "Neuf")).toBe("Neuf");
  });

  it("sinon le mot le plus long", () => {
    expect(emphasisOf("Tout le monde regarde au mauvais endroit.")).toBe("regarde");
  });
});
