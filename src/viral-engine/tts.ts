import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { RULES } from "./checklist";
import { estimateSpokenMs } from "./heat";
import type { Lang } from "./types";
import { encodeWav, wavDurationMs } from "./wav";

export type TtsEngine = "piper" | "kokoro" | "chatterbox" | "silent";

const PIPER_VOICE: Record<Lang, string> = {
  fr: process.env.VIRAL_PIPER_VOICE ?? "fr_FR-tom-medium",
  en: process.env.VIRAL_PIPER_VOICE_EN ?? "en_US-ryan-high",
};
const KOKORO_VOICE = process.env.VIRAL_KOKORO_VOICE ?? "am_michael";

// install.sh --voix installe Piper dans un venv de l'usine (pip --user est refusé par Ubuntu 23+ et Debian 12, PEP 668).
export function pythonBin(env: Record<string, string | undefined> = process.env): string {
  if (env.VIRAL_PYTHON) return env.VIRAL_PYTHON;
  const venv = join(env.VIRAL_HOME ?? ".septim-viral", "venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  return existsSync(venv) ? venv : "python3";
}

const piperDir = () => process.env.VIRAL_PIPER_DIR ?? join(process.env.VIRAL_HOME ?? ".septim-viral", "voices");

function piperReady(lang: Lang): boolean {
  if (!existsSync(join(piperDir(), `${PIPER_VOICE[lang]}.onnx`))) return false;
  return spawnSync(pythonBin(), ["-c", "import piper"], { stdio: "ignore" }).status === 0;
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
  if (pref === "piper" || pref === "kokoro" || pref === "chatterbox" || pref === "silent") return pref;
  if (lang === "en" && (await kokoroReady())) return "kokoro";
  if (piperReady(lang)) return "piper";
  return "silent";
}

function runPiper(text: string, lang: Lang, outPath: string, speed: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ["-m", "piper", "-m", PIPER_VOICE[lang], "--data-dir", piperDir(), "-f", outPath, "--length-scale", (1 / speed).toFixed(3)];
    const child = spawn(pythonBin(), args, { stdio: ["pipe", "ignore", "pipe"] });
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

// Voix HD (D24) : un seul processus Python garde Chatterbox chargé pour toutes les phrases de la vidéo.
type Worker = { child: ChildProcessWithoutNullStreams; next: () => Promise<Record<string, unknown>> };
let worker: Promise<Worker> | undefined;
let started = 0;
export const chatterboxWorkers = () => started;

function startChatterbox(): Promise<Worker> {
  const script = process.env.VIRAL_CHATTERBOX_SCRIPT ?? join(__dirname, "py", "chatterbox_tts.py");
  const child = spawn(pythonBin(), [script], { stdio: ["pipe", "pipe", "pipe"] });
  started++;
  child.unref();
  const lines = createInterface({ input: child.stdout });
  const queue: ((v: Record<string, unknown>) => void)[] = [];
  const buffered: Record<string, unknown>[] = [];
  let err = "";
  child.stderr.on("data", (d) => (err = (err + d).slice(-500)));
  const fail = (why: string) => {
    worker = undefined;
    for (const r of queue.splice(0)) r({ ok: false, error: why });
  };
  child.on("error", (e) => fail(e.message));
  child.on("exit", (code) => fail(`chatterbox s'est arrêté (${code}) : ${err}`));
  lines.on("line", (line) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line);
    } catch {
      return; // une bibliothèque qui parle sur stdout : ignoré
    }
    const waiting = queue.shift();
    if (waiting) waiting(msg);
    else buffered.push(msg);
  });
  const next = () => new Promise<Record<string, unknown>>((r) => (buffered.length ? r(buffered.shift()!) : queue.push(r)));
  return next().then((hello) => {
    if (!hello.ready) throw new Error(String(hello.error ?? `chatterbox n'a pas démarré : ${err}`));
    return { child, next };
  });
}

async function runChatterbox(text: string, lang: Lang, outPath: string): Promise<void> {
  worker ??= startChatterbox();
  const w = await worker;
  const reply = w.next();
  w.child.stdin.write(`${JSON.stringify({ text, lang, out: outPath })}\n`);
  const r = await reply;
  if (!r.ok) throw new Error(String(r.error ?? "chatterbox a échoué"));
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
    else if (engine === "chatterbox") await runChatterbox(text, opts.lang, opts.outPath);
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
