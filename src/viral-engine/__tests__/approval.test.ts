import { describe, expect, it } from "vitest";
import { parseReply } from "../approval";

describe("parseReply : seul un accord net publie", () => {
  it.each([
    ["OUI", "publish"],
    ["oui", "publish"],
    ["Oui publie", "publish"],
    ["OUI!", "publish"],
    ["ok", "publish"],
    ["👍", "publish"],
    ["vas-y", "publish"],
    ["oui vas-y", "publish"],
    ["non", "reject"],
    ["Non merci", "reject"],
    ["stop", "reject"],
    ["REFAIS", "redo"],
    ["refais-la", "redo"],
    ["pro", "pro"],
  ])("« %s » → %s", (text, intent) => {
    expect(parseReply(text).intent).toBe(intent);
  });

  // Faux accords relevés par la revue : aucun ne doit publier.
  it.each([
    "oui mais non",
    "Oui mais pas sur TikTok",
    "Oui ?",
    "oui?? t'es sûr",
    "ok je regarde ce soir",
    "ok attends",
    "Go dormir",
    "👍 pas encore",
    "encore une",
    "🎬 Septim · Vidéo prête",
    "ouistiti",
    "",
  ])("« %s » → unknown", (text) => {
    expect(parseReply(text).intent).toBe("unknown");
  });

  it("capture la référence du job", () => {
    expect(parseReply("oui #a1b2c3d4")).toEqual({ intent: "publish", jobRef: "a1b2c3d4" });
    expect(parseReply("#a1b2 oui")).toEqual({ intent: "publish", jobRef: "a1b2" });
  });

  it("signale une tentative d'accord ambiguë", () => {
    expect(parseReply("ok je regarde ce soir").looksLikeApproval).toBe(true);
    expect(parseReply("salut").looksLikeApproval).toBe(false);
  });
});
