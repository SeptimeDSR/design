import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanTopic, runJob } from "../pipeline";
import { createStore } from "../store";
import { buildTimeline, lintScript } from "../story";

const home = () => mkdtempSync(join(tmpdir(), "septim-viral-"));

function fakeDeps(sent: string[]) {
  return {
    render: async (_job: unknown, _props: unknown, dir: string) => join(dir, "video.mp4"),
    notify: async (text: string) => {
      sent.push(text);
    },
    llm: async () => {
      throw new Error("pas d'Ollama dans les tests");
    },
  };
}

describe("cleanTopic", () => {
  it.each([
    ["je veux une histoire sur la reine Njinga", "la reine Njinga"],
    ["« fais une vidéo sur le mobile money »", "le mobile money"],
    ["Le prix du pain", "Le prix du pain"],
    ["make a story about the tontine", "the tontine"],
    ["Je veux une vidéo sur le sommeil", "le sommeil"],
  ])("%s → %s", (raw, topic) => expect(cleanTopic(raw)).toBe(topic));
});

describe("runJob", () => {
  it("produit un job notifié, conforme, avec audio et bras du bandit", async () => {
    const dir = home();
    const sent: string[] = [];
    const job = await runJob(
      { topic: "je veux une histoire sur la tontine", template: "story" },
      { ...fakeDeps(sent), env: { VIRAL_HOME: dir, VIRAL_TTS: "silent" } },
    );
    expect(job.status).toBe("notified");
    expect(job.script.topic).toBe("la tontine");
    expect(job.arm.startsWith("story:")).toBe(true);
    expect(lintScript(job.script, buildTimeline(job.script, job.timeline.segments.map((s) => s.endMs - s.startMs)))).toEqual([]);
    expect(existsSync(join(dir, "jobs", job.id, "voice", "00.wav"))).toBe(true);
    expect(existsSync(join(dir, "jobs", job.id, "ambient.wav"))).toBe(true);
    expect(sent[0]).toContain(job.id.slice(0, 4));
    expect(createStore(dir).getJob(job.id)?.status).toBe("notified");
  });

  it("sans sujet, prend une tendance (ou un sujet permanent hors ligne)", async () => {
    const dir = home();
    const job = await runJob({}, { ...fakeDeps([]), env: { VIRAL_HOME: dir, VIRAL_TTS: "silent" }, fetchImpl: (async () => { throw new Error("offline"); }) as unknown as typeof fetch });
    expect(job.script.topic.length).toBeGreaterThan(0);
    expect(job.trend?.source).toBe("fallback");
  });

  it("un rendu en échec donne un job « failed » sans planter le démon", async () => {
    const dir = home();
    const job = await runJob(
      { topic: "le café" },
      { ...fakeDeps([]), render: async () => { throw new Error("Chrome absent"); }, env: { VIRAL_HOME: dir, VIRAL_TTS: "silent" } },
    );
    expect(job.status).toBe("failed");
    expect(job.error).toContain("Chrome absent");
  });
});
