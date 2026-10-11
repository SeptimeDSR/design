// Sous-titres incrustés (ASS/libass) : grands, lisibles sur un téléphone, calés sur la voix de chaque plan.

export type CaptionShot = { text: string; startMs: number; endMs: number; speaker?: string };

const stamp = (ms: number) => {
  const cs = Math.round(ms / 10);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
};

const escapeAss = (t: string) => t.replace(/\\/g, "＼").replace(/[{}]/g, "").replace(/\n/g, " ");

// Coupe en lignes de `max` caractères au plus, aux espaces.
export function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && (line + " " + word).length > max) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

export type AssOptions = { width: number; height: number; font?: string; shots: CaptionShot[]; offsetMs?: number };

export function buildAss(o: AssOptions): string {
  const vertical = o.height > o.width;
  const size = Math.round(vertical ? o.width / 15 : o.height / 17);
  const maxChars = vertical ? 24 : 44;
  const font = o.font ?? "Liberation Sans";
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${o.width}`,
    `PlayResY: ${o.height}`,
    "WrapStyle: 2",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,${font},${size},&H00FFFFFF,&H000000FF,&H00000000,&H78000000,-1,0,0,0,100,100,0,0,1,${Math.max(2, Math.round(size / 11))},1,2,${Math.round(o.width * 0.06)},${Math.round(o.width * 0.06)},${Math.round(o.height * (vertical ? 0.18 : 0.07))},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const events: string[] = [];
  const offset = o.offsetMs ?? 0;
  for (const shot of o.shots) {
    const lines = wrap(shot.text, maxChars);
    // Deux lignes à l'écran à la fois : le temps du plan est réparti sur les groupes, au prorata des caractères.
    const groups: string[][] = [];
    for (let i = 0; i < lines.length; i += 2) groups.push(lines.slice(i, i + 2));
    const weights = groups.map((g) => g.join(" ").length);
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    const span = Math.max(0, shot.endMs - shot.startMs);
    let at = shot.startMs;
    groups.forEach((g, i) => {
      const end = i === groups.length - 1 ? shot.endMs : at + Math.round((span * weights[i]) / total);
      const body = g.map(escapeAss).join("\\N");
      const tag = shot.speaker ? `{\\c&H66E0FF&}` : "";
      events.push(`Dialogue: 0,${stamp(at + offset)},${stamp(end + offset)},Default,,0,0,0,,${tag}${body}`);
      at = end;
    });
  }
  return [...header, ...events, ""].join("\n");
}

// Carte titre : grand titre centré (et le genre dessous).
export function titleAss(o: { width: number; height: number; title: string; subtitle?: string; seconds: number; font?: string }): string {
  const vertical = o.height > o.width;
  const big = Math.round(vertical ? o.width / 9 : o.height / 8);
  const small = Math.round(big / 2.6);
  const font = o.font ?? "Liberation Sans";
  const titleLines = wrap(o.title, vertical ? 14 : 26).map(escapeAss).join("\\N");
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${o.width}`,
    `PlayResY: ${o.height}`,
    "WrapStyle: 2",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Title,${font},${big},&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,2,0,1,3,2,5,60,60,0,1`,
    `Style: Sub,${font},${small},&H00D8D8D8,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,6,0,1,2,1,5,60,60,0,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    `Dialogue: 0,${stamp(300)},${stamp(o.seconds * 1000 - 300)},Title,,0,0,0,,{\\fad(600,600)}${titleLines}`,
    ...(o.subtitle ? [`Dialogue: 0,${stamp(900)},${stamp(o.seconds * 1000 - 300)},Sub,,0,0,${Math.round(big * 1.7)},,{\\fad(600,600)}${escapeAss(o.subtitle)}`] : []),
    "",
  ].join("\n");
}

// Générique de fin : les crédits des images libres de droits.
export function creditsAss(o: { width: number; height: number; lines: string[]; seconds: number; font?: string }): string {
  const vertical = o.height > o.width;
  const size = Math.round(vertical ? o.width / 20 : o.height / 24);
  const font = o.font ?? "Liberation Sans";
  const text = o.lines.map(escapeAss).join("\\N");
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${o.width}`,
    `PlayResY: ${o.height}`,
    "WrapStyle: 2",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Credits,${font},${size},&H00E6E6E6,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,1,5,60,60,0,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    `Dialogue: 0,${stamp(300)},${stamp(o.seconds * 1000 - 300)},Credits,,0,0,0,,{\\fad(600,600)}${text}`,
    "",
  ].join("\n");
}
