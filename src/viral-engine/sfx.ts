import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { mulberry32 } from "./bandit";
import { encodeWav } from "./wav";

// Bruitages générés par le code (D28) : gratuits, sans droits, identiques à chaque rendu.
// BESOIN CREDIT: banque de bruitages payante (Epidemic, Artlist). Alternative gratuite: ces synthèses.
export type SfxKind = "hit" | "whoosh" | "riser" | "ding";
export const SFX_FILES: Record<SfxKind, string> = { hit: "hit.wav", whoosh: "whoosh.wav", riser: "riser.wav", ding: "ding.wav" };
const RATE = 22050;
const PEAK = 0.85;

// Filtre passe-bande à variable d'état : la fréquence centrale peut glisser pendant le son.
function bandpass(input: Float32Array, centerHz: (t: number) => number, q: number, rate: number): Float32Array {
  const out = new Float32Array(input.length);
  let low = 0;
  let band = 0;
  for (let i = 0; i < input.length; i++) {
    const f = 2 * Math.sin((Math.PI * Math.min(centerHz(i / rate), rate / 6)) / rate);
    low += f * band;
    const high = input[i] - low - q * band;
    band += f * high;
    out[i] = band;
  }
  return out;
}

function finish(s: Float32Array, rate: number): Float32Array {
  // Fondus de 3 ms : jamais de clic au début ni à la fin.
  const edge = Math.round(0.003 * rate);
  for (let i = 0; i < edge; i++) {
    s[i] *= i / edge;
    s[s.length - 1 - i] *= i / edge;
  }
  let peak = 0;
  for (const v of s) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0 ? PEAK / peak : 0;
  for (let i = 0; i < s.length; i++) s[i] *= gain;
  return s;
}

export function sfxSamples(kind: SfxKind, rate = RATE): Float32Array {
  const rng = mulberry32(7);
  const noise = (seconds: number) => Float32Array.from({ length: Math.round(seconds * rate) }, () => rng() * 2 - 1);
  if (kind === "hit") {
    // Impact grave : un « boum » qui descend de 120 à 45 Hz, plus une attaque claquée.
    const n = Math.round(0.5 * rate);
    const s = new Float32Array(n);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      phase += (2 * Math.PI * (45 + 75 * Math.exp(-t * 18))) / rate;
      s[i] = Math.sin(phase) * Math.exp(-t * 7) + (t < 0.03 ? (rng() * 2 - 1) * (1 - t / 0.03) * 0.5 : 0);
    }
    return finish(s, rate);
  }
  if (kind === "whoosh") {
    // Souffle qui passe : bruit filtré dont la bande monte puis redescend.
    const T = 0.42;
    const s = bandpass(noise(T), (t) => 300 + 2700 * Math.sin((Math.PI * t) / T), 0.5, rate);
    for (let i = 0; i < s.length; i++) s[i] *= Math.pow(Math.sin((Math.PI * i) / s.length), 1.5);
    return finish(s, rate);
  }
  if (kind === "riser") {
    // Montée de tension avant la réponse : bruit et sinus qui grimpent ensemble.
    const T = 1.25;
    const s = bandpass(noise(T), (t) => 200 + 4800 * (t / T) ** 2, 0.4, rate);
    let phase = 0;
    for (let i = 0; i < s.length; i++) {
      const t = i / rate;
      phase += (2 * Math.PI * (200 + 700 * (t / T) ** 2)) / rate;
      const env = (t / T) ** 2 * Math.min(1, (T - t) / 0.04);
      s[i] = (s[i] * 0.7 + Math.sin(phase) * 0.3) * env;
    }
    return finish(s, rate);
  }
  // Ding : cloche (partiels inharmoniques d'une cloche, décroissance plus rapide dans les aigus).
  const T = 1.6;
  const n = Math.round(T * rate);
  const s = new Float32Array(n);
  const f0 = 1318.5;
  const partials: [number, number][] = [
    [1, 1],
    [2.76, 0.5],
    [5.4, 0.25],
    [8.93, 0.12],
  ];
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    let v = 0;
    partials.forEach(([ratio, amp], k) => (v += amp * Math.sin(2 * Math.PI * f0 * ratio * t) * Math.exp(-t * 3 * (k + 1))));
    s[i] = v * Math.min(1, t / 0.003);
  }
  return finish(s, rate);
}

export async function writeSfx(dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  for (const [kind, file] of Object.entries(SFX_FILES) as [SfxKind, string][]) await writeFile(join(dir, file), encodeWav(sfxSamples(kind), RATE));
  return dir;
}
