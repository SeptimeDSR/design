import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { mulberry32 } from "./bandit";
import { encodeWav } from "./wav";

// Am7 – Fmaj7 – Cmaj7 – G6 : une boucle lo-fi douce qui ne fatigue pas l'oreille.
const CHORDS = [
  [220.0, 261.63, 329.63, 392.0],
  [174.61, 220.0, 261.63, 329.63],
  [130.81, 164.81, 196.0, 246.94],
  [196.0, 246.94, 293.66, 329.63],
];
const CHORD_SECONDS = 4;
const PEAK = 0.45;

export function ambientSamples(seconds: number, sampleRate: number, seed: number): Float32Array {
  const rng = mulberry32(seed);
  const n = Math.round(seconds * sampleRate);
  const out = new Float32Array(n);
  const detune = CHORDS.map((c) => c.map(() => 1 + (rng() - 0.5) * 0.004));
  const offset = Math.floor(rng() * CHORDS.length);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const pos = t / CHORD_SECONDS + offset;
    const idx = Math.floor(pos) % CHORDS.length;
    const phase = pos - Math.floor(pos);
    const env = Math.min(1, phase * 4, (1 - phase) * 4); // fondu entre accords
    let v = 0;
    CHORDS[idx].forEach((f, k) => {
      v += Math.sin(2 * Math.PI * f * detune[idx][k] * t) * (k === 0 ? 0.5 : 0.3);
    });
    v *= env * (0.85 + 0.15 * Math.sin(2 * Math.PI * 0.2 * t)); // respiration lente
    lp += 0.08 * (v - lp); // passe-bas : son feutré
    const crackle = rng() < 0.0015 ? (rng() - 0.5) * 0.6 : (rng() - 0.5) * 0.02;
    out[i] = lp + crackle;
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0 ? PEAK / peak : 0;
  for (let i = 0; i < n; i++) out[i] *= gain;
  return out;
}

export async function writeAmbient(outPath: string, seconds: number, seed = Date.now()): Promise<string> {
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, encodeWav(ambientSamples(seconds, 22050, seed), 22050));
  return outPath;
}

// npm run viral:ambient -- public/audio/ambient.wav 60
if (process.argv[1]?.endsWith("ambient.ts")) {
  const [out = "public/audio/ambient.wav", secs = "60"] = process.argv.slice(2);
  writeAmbient(out, Number(secs), 1).then((p) => console.log(`Lit ambiant écrit : ${p}`));
}
