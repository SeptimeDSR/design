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
