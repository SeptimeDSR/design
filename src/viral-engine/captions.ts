import type { CaptionWord } from "./types";

// « pourquoi ? » reste un seul mot à l'écran (typographie française).
function tokens(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\s+/).filter(Boolean)) {
    if (/^[?!:;»…]+$/.test(raw) && out.length) out[out.length - 1] += ` ${raw}`;
    else out.push(raw);
  }
  return out;
}

export function wordTimings(text: string, startMs: number, endMs: number): CaptionWord[] {
  const words = tokens(text);
  if (!words.length) return [];
  const weights = words.map((w) => w.length + (/[.,;:!?…]$/.test(w) ? 2 : 0));
  const total = weights.reduce((a, b) => a + b, 0);
  const span = endMs - startMs;
  let acc = 0;
  return words.map((w, i) => {
    const from = startMs + Math.round((acc / total) * span);
    acc += weights[i];
    const to = i === words.length - 1 ? endMs : startMs + Math.round((acc / total) * span);
    return { text: w, startMs: from, endMs: to };
  });
}

export function pageCaptions(words: CaptionWord[], maxWords = 3): CaptionWord[][] {
  const pages: CaptionWord[][] = [];
  let page: CaptionWord[] = [];
  for (const w of words) {
    page.push(w);
    if (page.length >= maxWords || /[.,;:!?…]$/.test(w.text)) {
      pages.push(page);
      page = [];
    }
  }
  if (page.length) pages.push(page);
  return pages;
}
