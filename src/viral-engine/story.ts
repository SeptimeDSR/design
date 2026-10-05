import { RULES } from "./checklist";
import { estimateSpokenMs, lintHook } from "./heat";
import type { Beat, Lang, LintIssue, Segment, SegmentKind, Timeline, ViralScript } from "./types";

const BEAT_MAX_MS = RULES.beatMaxSeconds * 1000;

const SAVE_CTA: Record<Lang, RegExp> = {
  fr: /\b(garde|sauvegarde|enregistre)/i,
  en: /\b(save|bookmark)/i,
};

function splitText(text: string, lang: Lang, speed: number): string[] {
  if (estimateSpokenMs(text, lang, speed) <= BEAT_MAX_MS) return [text];
  const words = text.split(/\s+/).filter(Boolean);
  const middle = words.length / 2;
  // Coupe à la ponctuation la plus proche du milieu, sinon au milieu exact.
  let cut = Math.ceil(middle);
  let best = Infinity;
  words.forEach((w, i) => {
    if (i < words.length - 1 && /[,;:.!?…—]$/.test(w) && Math.abs(i + 1 - middle) < best) {
      best = Math.abs(i + 1 - middle);
      cut = i + 1;
    }
  });
  const head = words.slice(0, cut).join(" ");
  const tail = words.slice(cut).join(" ");
  return [...splitText(head, lang, speed), ...splitText(tail, lang, speed)];
}

export function normalizeBeats(beats: Beat[], lang: Lang, speed: number = RULES.voiceSpeed): Beat[] {
  return beats.flatMap((beat) => {
    const parts = splitText(beat.text, lang, speed);
    if (parts.length === 1) return [beat];
    return parts.map((text) => (beat.emphasis && text.includes(beat.emphasis) ? { text, emphasis: beat.emphasis } : { text }));
  });
}

export function segmentTexts(script: ViralScript): { kind: SegmentKind; text: string }[] {
  return [
    { kind: "hook", text: script.hook },
    ...script.beats.map((b) => ({ kind: "beat" as const, text: b.text })),
    { kind: "payoff", text: script.payoff },
    { kind: "cta", text: script.cta },
  ];
}

export function buildTimeline(script: ViralScript, durationsMs?: number[]): Timeline {
  let cursor = 0;
  const segments: Segment[] = segmentTexts(script).map(({ kind, text }, i) => {
    const duration = durationsMs?.[i] ?? estimateSpokenMs(text, script.lang);
    const segment = { kind, text, startMs: cursor, endMs: cursor + duration };
    cursor += duration;
    return segment;
  });
  return { segments, durationMs: cursor };
}

export function lintScript(script: ViralScript, timeline: Timeline): LintIssue[] {
  const issues: LintIssue[] = [...lintHook(script.hook, script.lang)];

  for (const s of timeline.segments) {
    if (s.kind === "beat" && s.endMs - s.startMs > BEAT_MAX_MS) {
      issues.push({ rule: "beat.too_long", message: `Beat de ${s.endMs - s.startMs} ms : « ${s.text} ».` });
    }
  }

  const payoff = timeline.segments.find((s) => s.kind === "payoff");
  if (payoff && timeline.durationMs > 0 && payoff.startMs / timeline.durationMs < RULES.payoffMinRatio) {
    const pct = Math.round((payoff.startMs / timeline.durationMs) * 100);
    issues.push({ rule: "payoff.too_early", message: `La réponse arrive à ${pct} %, minimum ${RULES.payoffMinRatio * 100} %.` });
  }

  if (!SAVE_CTA[script.lang].test(script.cta)) {
    issues.push({ rule: "cta.missing", message: "Le CTA doit pousser à sauvegarder." });
  }

  const [min, max] = RULES.targetSeconds;
  if (timeline.durationMs < min * 1000 || timeline.durationMs > max * 1000) {
    issues.push({ rule: "duration.out_of_range", message: `Durée ${Math.round(timeline.durationMs / 1000)} s, attendu ${min}–${max} s.` });
  }
  return issues;
}
