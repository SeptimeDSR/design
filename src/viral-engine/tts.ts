import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { RULES } from "./checklist";
import { estimateSpokenMs } from "./heat";
import type { Lang } from "./types";
import { encodeWav, wavDurationMs } from "./wav";

export type TtsEngine = "piper" | "kokoro" | "silent";

const PIPER_VOICE: Record<Lang, string> = {
  fr: process.env.VIRAL_PIPER_VOICE ?? "fr_FR-tom-medium",
  en: process.env.VIRAL_PIPER_VOICE_EN ?? "en_US-ryan-high",
};
const KOKORO_VOICE = process.env.VIRAL_KOKORO_VOICE ?? "am_michael";

const piperDir = () => process.env.VIRAL_PIPER_DIR ?? join(process.env.VIRAL_HOME ?? ".septim-viral", "voices");

function piperReady(lang: Lang): boolean {
  if (!existsSync(join(piperDir(), `${PIPER_VOICE[lang]}.onnx`))) return false;
  return spawnSync("python3", ["-c", "import piper"], { stdio: "ignore" }).status === 0;
}

async function kokoroReady(): Promise<boolean> {
  try {
    await import("kokoro-js" as string);
    return true;
  } catch {
    return false;
  }
}

export async function detectEngine(lang: Lang, pref = process.env.VIRAL_TTS ?? "auto"): Promise<TtsEngine> {
  if (pref === "piper" || pref === "kokoro" || pref === "silent") return pref;
  if (lang === "en" && (await kokoroReady())) return "kokoro";
  if (piperReady(lang)) return "piper";
  return "silent";
}

function runPiper(text: string, lang: Lang, outPath: string, speed: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ["-m", "piper", "-m", PIPER_VOICE[lang], "--data-dir", piperDir(), "-f", outPath, "--length-scale", (1 / speed).toFixed(3)];
    const child = spawn("python3", args, { stdio: ["pipe", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`piper a échoué (${code}) : ${err.slice(-300)}`))));
    child.stdin.end(text);
  });
}

async function runKokoro(text: string, outPath: string, speed: number): Promise<void> {
  const { KokoroTTS } = await import("kokoro-js" as string);
  const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" });
  const audio = await tts.generate(text, { voice: KOKORO_VOICE, speed });
  await audio.save(outPath);
}

export async function synthesize(
  text: string,
  opts: { lang: Lang; outPath: string; speed?: number; engine?: TtsEngine },
): Promise<{ path: string; durationMs: number; engine: TtsEngine }> {
  const speed = opts.speed ?? RULES.voiceSpeed;
  const engine = opts.engine ?? (await detectEngine(opts.lang));
  await mkdir(dirname(opts.outPath), { recursive: true });

  try {
    if (engine === "piper") await runPiper(text, opts.lang, opts.outPath, speed);
    else if (engine === "kokoro") await runKokoro(text, opts.outPath, speed);
    if (engine !== "silent") {
      return { path: opts.outPath, durationMs: wavDurationMs(await readFile(opts.outPath)), engine };
    }
  } catch (error) {
    console.warn(`[tts] ${engine} indisponible, piste silencieuse : ${(error as Error).message}`);
  }

  const durationMs = estimateSpokenMs(text, opts.lang, speed);
  await writeFile(opts.outPath, encodeWav(new Float32Array(Math.round((durationMs / 1000) * 22050)), 22050));
  return { path: opts.outPath, durationMs, engine: "silent" };
}
