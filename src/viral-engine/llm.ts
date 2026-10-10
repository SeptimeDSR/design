import { Ollama } from "ollama";
import { RULES } from "./checklist";
import type { ViralConfig } from "./config";
import { buildHeatPrompt, fallbackScript, parseHeatResponse } from "./heat";
import { buildTimeline, lintScript, normalizeBeats } from "./story";
import type { Beat, HookFormula, Lang, TemplateId, ViralScript } from "./types";

export type LlmClient = { chat(prompt: string): Promise<string> };
export type ScriptInput = { topic: string; lang: Lang; formula: HookFormula; template: TemplateId; trend?: string };

export function ollamaClient(cfg: ViralConfig): LlmClient {
  const client = new Ollama({ host: cfg.ollama.host });
  return {
    async chat(prompt) {
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Ollama trop lent")), cfg.ollama.timeoutMs));
      const res = await Promise.race([
        client.chat({ model: cfg.ollama.model, format: "json", messages: [{ role: "user", content: prompt }], options: { temperature: 0.9 } }),
        timeout,
      ]);
      return res.message.content;
    },
  };
}

export function assembleScript(input: ScriptInput, raw: Partial<ViralScript>): ViralScript | null {
  if (typeof raw.hook !== "string" || !Array.isArray(raw.beats) || typeof raw.payoff !== "string") return null;
  const beats: Beat[] = (raw.beats as unknown[])
    .map((b) => (typeof b === "string" ? { text: b } : b))
    .filter((b): b is { text: string; emphasis?: unknown; visual?: unknown } => !!b && typeof (b as Beat).text === "string" && (b as Beat).text.trim().length > 0)
    .map((b) => {
      // Un LLM renvoie parfois une emphase numérique : le rendu attend du texte.
      const emphasis = typeof b.emphasis === "string" ? b.emphasis : typeof b.emphasis === "number" ? String(b.emphasis) : undefined;
      // visual : le plan à chercher ou générer pour ce beat (B-roll gratuit).
      const visual = typeof b.visual === "string" && b.visual.trim() ? b.visual.trim() : undefined;
      return { text: b.text, ...(emphasis ? { emphasis } : {}), ...(visual ? { visual } : {}) };
    });
  return {
    topic: input.topic,
    lang: input.lang,
    template: input.template,
    formula: input.formula,
    hook: raw.hook.trim(),
    beats: normalizeBeats(beats, input.lang),
    payoff: raw.payoff.trim(),
    cta: RULES.cta[input.lang],
    caption: typeof raw.caption === "string" ? raw.caption : input.topic,
    hashtags: Array.isArray(raw.hashtags) ? raw.hashtags.filter((h): h is string => typeof h === "string") : [],
  };
}

// 3 essais : le LLM reçoit les violations du linter et corrige. Sinon, script de secours conforme.
export async function generateScript(
  input: ScriptInput,
  cfg: ViralConfig,
  client: LlmClient = ollamaClient(cfg),
): Promise<{ script: ViralScript; source: "ollama" | "fallback"; attempts: number }> {
  let prompt = buildHeatPrompt(input);
  for (let attempt = 1; attempt <= 3 && cfg.ollama.enabled; attempt++) {
    try {
      const parsed = parseHeatResponse(await client.chat(prompt));
      const script = parsed && assembleScript(input, parsed);
      if (script) {
        const issues = lintScript(script, buildTimeline(script));
        if (!issues.length) return { script, source: "ollama", attempts: attempt };
        prompt = `${buildHeatPrompt(input)}\n\nTa réponse précédente viole ces règles, corrige-les :\n${issues.map((i) => `- ${i.rule} : ${i.message}`).join("\n")}`;
      }
    } catch (error) {
      const message = (error as Error).message;
      console.warn(/fetch failed|ECONNREFUSED|ENOTFOUND/i.test(message) ? `[llm] Ollama absent (${cfg.ollama.host}) : script de secours. Pour un vrai script : Claude Code, ou ollama pull ${cfg.ollama.model}.` : `[llm] essai ${attempt} : ${message}`);
      break;
    }
  }
  const fb = fallbackScript(input);
  return { script: { ...fb, beats: normalizeBeats(fb.beats, input.lang) }, source: "fallback", attempts: 3 };
}
