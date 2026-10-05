import { describe, expect, it } from "vitest";
import { generateScript } from "../llm";
import { loadConfig } from "../config";
import { buildTimeline, lintScript } from "../story";

const input = { topic: "la tontine", lang: "fr" as const, formula: "question" as const, template: "maths" as const };
const cfg = loadConfig({});

const GOOD = JSON.stringify({
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
  hashtags: ["#tontine", "#argent"],
});

describe("generateScript", () => {
  it("utilise la réponse du LLM quand elle est valide", async () => {
    const r = await generateScript(input, cfg, { chat: async () => GOOD });
    expect(r.source).toBe("ollama");
    expect(r.script.hook).toContain("tontine");
    expect(r.script.cta).toBe("Garde ça, tu vas en avoir besoin demain.");
    expect(lintScript(r.script, buildTimeline(r.script))).toEqual([]);
  });

  it("retombe sur le script de secours si le LLM répond n'importe quoi", async () => {
    let calls = 0;
    const r = await generateScript(input, cfg, { chat: async () => (calls++, "désolé, je ne peux pas") });
    expect(r.source).toBe("fallback");
    expect(calls).toBe(3);
    expect(lintScript(r.script, buildTimeline(r.script))).toEqual([]);
  });

  it("retombe sur le secours si Ollama est injoignable", async () => {
    const r = await generateScript(input, cfg, { chat: async () => { throw new Error("ECONNREFUSED"); } });
    expect(r.source).toBe("fallback");
  });

  it("renvoie les erreurs du linter au LLM pour qu'il corrige", async () => {
    const prompts: string[] = [];
    const tooShort = JSON.stringify({ hook: "Le sujet.", beats: [{ text: "Un." }], payoff: "Fin.", caption: "x", hashtags: [] });
    await generateScript(input, cfg, { chat: async (p) => (prompts.push(p), prompts.length < 2 ? tooShort : GOOD) });
    expect(prompts[1]).toContain("hook.no_viewer");
  });
});

describe("robustesse des réponses du LLM", () => {
  it("une emphase non textuelle (nombre) est convertie ou ignorée, jamais transmise brute au rendu", async () => {
    const { assembleScript } = await import("../llm");
    const s = assembleScript(input, { hook: "Tu sais ?", beats: [{ text: "Dix mille francs.", emphasis: 10000 as unknown as string }, { text: "Rien.", emphasis: { x: 1 } as unknown as string }], payoff: "Fin." });
    expect(s?.beats[0].emphasis).toBe("10000");
    expect(s?.beats[1].emphasis).toBeUndefined();
  });
});

describe("Ollama absent : message clair", () => {
  it("« fetch failed » devient « Ollama absent … script de secours »", async () => {
    const { generateScript } = await import("../llm");
    const { loadConfig } = await import("../config");
    const warns: string[] = [];
    const orig = console.warn;
    console.warn = (m: string) => void warns.push(m);
    try {
      const r = await generateScript({ topic: "la tontine", lang: "fr", template: "story", formula: "question" }, loadConfig({}), { chat: async () => { throw new TypeError("fetch failed"); } });
      expect(r.source).toBe("fallback");
    } finally {
      console.warn = orig;
    }
    expect(warns.join(" ")).toMatch(/Ollama absent \(http:\/\/127\.0\.0\.1:11434\).*script de secours/);
  });
});
