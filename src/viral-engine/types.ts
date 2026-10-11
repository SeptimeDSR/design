export type Lang = "fr" | "en";
export type TemplateId = "story" | "maths" | "film";
export type HookFormula = "question" | "choc" | "secret" | "contre-intuitif";

export const TEMPLATES: TemplateId[] = ["story", "maths", "film"];
export const FORMULAS: HookFormula[] = ["question", "choc", "secret", "contre-intuitif"];

// visual : le plan à montrer pendant ce beat (B-roll), décrit concrètement, en anglais de préférence.
export type Beat = { text: string; emphasis?: string; visual?: string };

export type ViralScript = {
  topic: string;
  lang: Lang;
  template: TemplateId;
  formula: HookFormula;
  hook: string;
  beats: Beat[];
  payoff: string;
  cta: string;
  caption: string;
  hashtags: string[];
};

export type SegmentKind = "hook" | "beat" | "payoff" | "cta";
export type Segment = { kind: SegmentKind; text: string; startMs: number; endMs: number };
export type Timeline = { segments: Segment[]; durationMs: number };

export type CaptionWord = { text: string; startMs: number; endMs: number };

export type LintIssue = { rule: string; message: string };
