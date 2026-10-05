import checklist from "./viral-checklist.json";
import type { Lang } from "./types";

const r = checklist.rules;

// Seuils viraux : la source de vérité reste viral-checklist.json.
export const RULES = {
  hookMaxSeconds: r.hook_max_seconds,
  wordsPerSecond: r.words_per_second as Record<Lang, number>,
  voiceSpeed: r.voice_speed,
  beatMaxSeconds: r.beat_max_seconds,
  payoffMinRatio: r.payoff_min_ratio,
  targetSeconds: r.target_seconds as [number, number],
  cta: r.cta as Record<Lang, string>,
} as const;

export { checklist };
