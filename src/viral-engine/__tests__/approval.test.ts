import { describe, expect, it } from "vitest";
import { parseReply } from "../approval";

describe("parseReply", () => {
  it.each([
    ["OUI", "publish"],
    ["Oui publie", "publish"],
    ["oui mais non", "publish"],
    ["ok", "publish"],
    ["👍", "publish"],
    ["vas-y", "publish"],
    ["non", "reject"],
    ["Non merci", "reject"],
    ["stop", "reject"],
    ["REFAIS", "redo"],
    ["encore une", "redo"],
    ["pro", "pro"],
    ["🎬 Septim · Vidéo prête", "unknown"],
    ["ouistiti", "unknown"],
    ["", "unknown"],
  ])("« %s » → %s", (text, intent) => {
    expect(parseReply(text).intent).toBe(intent);
  });

  it("capture la référence du job", () => {
    expect(parseReply("oui #a1b2")).toEqual({ intent: "publish", jobRef: "a1b2" });
  });
});
