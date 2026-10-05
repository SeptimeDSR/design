import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { createConsoleNotifier } from "../notify";
import { formatReadyMessage, jobRef } from "../message";
import { fallbackScript } from "../heat";
import { buildTimeline } from "../story";
import type { Job } from "../store";

function job(over: Partial<Job> = {}): Job {
  const script = fallbackScript({ topic: "la tontine", lang: "fr", formula: "secret", template: "maths" });
  return {
    id: "a1b2c3d4",
    createdAt: new Date().toISOString(),
    status: "rendered",
    request: {},
    script,
    timeline: buildTimeline(script),
    arm: "maths:secret",
    source: "ollama",
    ttsEngine: "piper",
    jobDir: "/tmp/x",
    ...over,
  };
}

describe("formatReadyMessage", () => {
  it("contient la référence, le hook, la légende et la consigne OUI", () => {
    const text = formatReadyMessage(job(), "postiz-cloud");
    expect(text).toContain(`#${jobRef(job())}`);
    expect(text).toContain(job().script.hook);
    expect(text).toContain(job().script.caption);
    expect(text).toMatch(/OUI pour publier sur TikTok, YouTube, Facebook, Instagram/);
    expect(text.startsWith("🎬 Septim")).toBe(true);
  });

  it("en mode manuel, promet la légende à coller", () => {
    expect(formatReadyMessage(job(), "manual")).toContain("légende prête à coller");
  });

  it("signale le son tendance à ajouter dans l'app", () => {
    const text = formatReadyMessage(job({ trend: { title: "x", source: "tiktok", sound: "Coup du marteau", score: 1 } }), "manual");
    expect(text).toContain("Coup du marteau");
  });

  it("avoue le script de secours", () => {
    expect(formatReadyMessage(job({ source: "fallback" }), "manual")).toContain("script de secours");
  });
});

describe("notificateur console", () => {
  it("affiche les messages et transmet les réponses tapées", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let printed = "";
    output.on("data", (d) => (printed += d));
    const n = createConsoleNotifier({ input, output });
    const replies: string[] = [];
    n.onMessage((t) => replies.push(t));
    await n.start();
    await n.send("🎬 Septim · test", "/tmp/v.mp4");
    input.write("oui\n");
    await new Promise((r) => setTimeout(r, 20));
    expect(printed).toContain("🎬 Septim · test");
    expect(printed).toContain("/tmp/v.mp4");
    expect(replies).toEqual(["oui"]);
    await n.stop();
  });
});
