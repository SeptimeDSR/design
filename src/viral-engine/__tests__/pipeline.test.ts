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

describe("runJob avec un script écrit par Claude (--script)", () => {
  const good = {
    hook: "Et si ta tontine te faisait perdre de l'argent ?",
    beats: [
      { text: "Dix personnes, dix mille chacun, chaque mois.", emphasis: "dix" },
      { text: "Tu reçois cent mille le jour de ton tour.", emphasis: "cent" },
      { text: "Ça ressemble à un bon plan, non ?" },
      { text: "Sauf que l'argent n'a pas la même valeur.", emphasis: "valeur" },
      { text: "Le premier reçoit tout, tout de suite.", emphasis: "premier" },
      { text: "Le dernier attend dix mois entiers.", emphasis: "dernier" },
      { text: "Pendant ce temps, les prix montent.", emphasis: "prix" },
      { text: "Et personne ne fait jamais le calcul.", emphasis: "calcul" },
      { text: "Moi, je l'ai fait pour toi.", emphasis: "fait" },
    ],
    payoff: "Le dernier perd environ cinq pour cent.",
    caption: "Ta tontine, vraiment gagnante ?",
    hashtags: ["#tontine"],
  };

  it("utilise le script tel quel, sans appeler de LLM, source « claude »", async () => {
    const dir = home();
    let llmCalls = 0;
    const job = await runJob(
      { topic: "la tontine", template: "maths", script: good },
      { ...fakeDeps([]), llm: async () => (llmCalls++, ""), env: { VIRAL_HOME: dir, VIRAL_TTS: "silent" } },
    );
    expect(llmCalls).toBe(0);
    expect(job.source).toBe("claude");
    expect(job.script.hook).toBe(good.hook);
    expect(job.script.template).toBe("maths");
  });

  it("refuse un script non conforme en listant les règles violées", async () => {
    const dir = home();
    await expect(
      runJob({ topic: "la tontine", script: { ...good, hook: "La tontine est un sujet." } }, { ...fakeDeps([]), env: { VIRAL_HOME: dir, VIRAL_TTS: "silent" } }),
    ).rejects.toThrow(/hook\.no_viewer/);
  });
});

describe("checkScript (--lint-only)", () => {
  it("donne la durée, le moment de la réponse et les problèmes", async () => {
    const { checkScript } = await import("../pipeline");
    const r = checkScript({ topic: "x", lang: "fr", template: "story", formula: "question" }, { hook: "Le sujet.", beats: [{ text: "Un." }], payoff: "Fin." });
    expect(r.issues.map((i) => i.rule)).toEqual(expect.arrayContaining(["hook.no_viewer", "payoff.too_early"]));
    expect(r.durationMs).toBeGreaterThan(0);
    expect(r.payoffRatio).toBeGreaterThan(0);
    expect(r.payoffRatio).toBeLessThan(1);
  });

  it("signale un JSON incomplet", async () => {
    const { checkScript } = await import("../pipeline");
    expect(checkScript({ topic: "x", lang: "fr", template: "story", formula: "question" }, { hook: "Tu sais ?" }).issues[0].rule).toBe("script.invalid");
  });
});

describe("runJob PRO avec plans B-roll", () => {
  it("copie les clips et les passe au rendu", async () => {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    const dir = home();
    const broll = join(dir, "clips");
    mkdirSync(broll);
    writeFileSync(join(broll, "b.mp4"), "x");
    writeFileSync(join(broll, "a.mp4"), "x");
    writeFileSync(join(broll, "notes.txt"), "x");
    let seen: unknown;
    const job = await runJob(
      { topic: "le café", brollDir: broll },
      { ...fakeDeps([]), render: async (_j: unknown, props: { broll?: string[] }, d: string) => ((seen = props.broll), join(d, "video.mp4")), env: { VIRAL_HOME: dir, VIRAL_TTS: "silent" } },
    );
    expect(seen).toEqual([`viral/${job.id}/broll/a.mp4`, `viral/${job.id}/broll/b.mp4`]);
    expect(existsSync(join(dir, "jobs", job.id, "broll", "a.mp4"))).toBe(true);
  });
});
