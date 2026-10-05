import type { CaptionWord, Segment, Timeline, ViralScript } from "../../viral-engine/types";
import { pageCaptions, splitWords, wordTimings } from "../../viral-engine/captions";

export const VIRAL_FPS = 30;
export const VIRAL_WIDTH = 1080;
export const VIRAL_HEIGHT = 1920;
export const TAIL_FRAMES = 15;

export type ViralProps = {
  script: ViralScript;
  timeline: Timeline;
  audio: { segments: { src: string; startMs: number }[]; ambient?: string; ambientVolume?: number };
  // Plans de fond : tes clips, le B-roll gratuit (ComfyUI, Pexels, Pixabay) ou PRO (Higgsfield). Vide = fonds procéduraux.
  broll?: string[];
};

export const msToFrame = (ms: number, fps: number) => Math.round((ms / 1000) * fps);

export function durationInFrames(timeline: Timeline, fps = VIRAL_FPS): number {
  return Math.max(1, Math.ceil((timeline.durationMs / 1000) * fps) + TAIL_FRAMES);
}

export type CaptionPage = { words: CaptionWord[]; startMs: number; endMs: number; segment: Segment; segmentIndex: number };

export function captionPages(timeline: Timeline): CaptionPage[] {
  return timeline.segments.flatMap((segment, segmentIndex) =>
    pageCaptions(wordTimings(segment.text, segment.startMs, segment.endMs)).map((words) => ({
      words,
      startMs: words[0].startMs,
      endMs: words[words.length - 1].endMs,
      segment,
      segmentIndex,
    })),
  );
}

export function segmentAt(timeline: Timeline, ms: number): { segment: Segment; index: number } {
  const index = Math.max(
    0,
    timeline.segments.findIndex((s) => ms >= s.startMs && ms < s.endMs),
  );
  const safe = ms >= timeline.durationMs ? timeline.segments.length - 1 : index;
  return { segment: timeline.segments[safe], index: safe };
}

// Le mot fort d'un segment : l'emphase fournie, sinon après « : » (la vraie réponse) le premier nombre, sinon le plus long mot.
export function emphasisOf(text: string, emphasis?: string): string {
  if (emphasis && text.toLowerCase().includes(emphasis.toLowerCase())) return emphasis;
  const afterColon = text.includes(":") ? text.slice(text.indexOf(":") + 1) : text;
  const words = splitWords(afterColon.replace(/[.,;:!?…«»"]/g, " "));
  const number = words.find((w) => /\d/.test(w));
  return number ?? words.reduce((a, b) => (b.length > a.length ? b : a), "");
}
