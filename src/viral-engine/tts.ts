import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { RULES } from "./checklist";
import { estimateSpokenMs } from "./heat";
import type { Lang } from "./types";
import { encodeWav, normalizeSpeech, wavDurationMs } from "./wav";

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
// Chaque demande porte un id, chaque attente a un délai : un modèle bloqué ne bloque jamais le rendu.
type Reply = Record<string, unknown>;
type Worker = { child: ChildProcessWithoutNullStreams; ask: (job: Reply, ms: number) => Promise<Reply> };
let worker: Promise<Worker> | undefined;
let current: ChildProcessWithoutNullStreams | undefined;
let started = 0;
let seq = 0;
export const chatterboxWorkers = () => started;
export const chatterboxAlive = () => !!current && current.exitCode === null && !current.killed;

const msFromEnv = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

// Fin de vidéo (ou délai dépassé) : le processus et la mémoire du modèle sont rendus.
export function closeChatterbox(): void {
  const child = current;
  worker = undefined;
  current = undefined;
  if (child && child.exitCode === null) child.kill();
}

function startChatterbox(): Promise<Worker> {
  const script = process.env.VIRAL_CHATTERBOX_SCRIPT ?? join(__dirname, "py", "chatterbox_tts.py");
  const child = spawn(pythonBin(), [script], { stdio: ["pipe", "pipe", "pipe"] });
  current = child;
  started++;
  child.unref();
  const lines = createInterface({ input: child.stdout });
  const pending = new Map<string, (v: Reply) => void>();
  let hello: ((v: Reply) => void) | undefined;
  let err = "";
  child.stderr.on("data", (d) => (err = (err + d).slice(-500)));
  const fail = (why: string) => {
    if (current === child) closeChatterbox();
    hello?.({ ready: false, error: why });
    for (const r of pending.values()) r({ ok: false, error: why });
    pending.clear();
  };
  child.on("error", (e) => fail(e.message));
  child.on("exit", (code) => fail(`chatterbox s'est arrêté (${code}) : ${err}`));
  lines.on("line", (line) => {
    let msg: Reply;
    try {
      msg = JSON.parse(line);
    } catch {
      return; // une bibliothèque qui parle sur stdout : ignoré
    }
    if ("ready" in msg && hello) {
      hello(msg);
      hello = undefined;
      return;
    }
    const id = typeof msg.id === "string" ? msg.id : undefined;
    const waiting = id ? pending.get(id) : undefined;
    if (!waiting) return; // réponse d'une phrase déjà abandonnée, ou étrangère
    pending.delete(id!);
    waiting(msg);
  });
  // Délai dépassé : on coupe ce worker, la phrase suivante en relance un neuf.
  const timed = (p: Promise<Reply>, ms: number, what: string) =>
    new Promise<Reply>((resolve) => {
      const t = setTimeout(() => {
        if (current === child) closeChatterbox();
        resolve({ ok: false, ready: false, error: `${what} : pas de réponse en ${Math.round(ms / 1000)} s` });
      }, ms);
      t.unref();
      void p.then((v) => {
        clearTimeout(t);
        resolve(v);
      });
    });
  const ask = (job: Reply, ms: number) => {
    const id = String(++seq);
    const reply = new Promise<Reply>((r) => pending.set(id, r));
    child.stdin.write(`${JSON.stringify({ ...job, id })}\n`);
    return timed(reply, ms, "chatterbox").finally(() => pending.delete(id));
  };
  // Premier démarrage : le modèle (~ 2 Go) se télécharge, d'où un délai large.
  const ready = timed(new Promise<Reply>((r) => (hello = r)), msFromEnv("VIRAL_CHATTERBOX_START_TIMEOUT_MS", 900_000), "chatterbox au démarrage");
  return ready.then((h) => {
    if (!h.ready) throw new Error(String(h.error ?? `chatterbox n'a pas démarré : ${err}`));
    return { child, ask };
  });
}

async function runChatterbox(text: string, lang: Lang, outPath: string): Promise<void> {
  worker ??= startChatterbox();
  const w = await worker.catch((error) => {
    worker = undefined;
    throw error;
  });
  const r = await w.ask({ text, lang, out: outPath }, msFromEnv("VIRAL_CHATTERBOX_TIMEOUT_MS", 120_000));
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
      // Même niveau d'une phrase à l'autre et d'une voix à l'autre : ~ -16 dBFS, crête sous -1 dBFS.
      const voice = normalizeSpeech(await readFile(opts.outPath));
      await writeFile(opts.outPath, voice);
      return { path: opts.outPath, durationMs: wavDurationMs(voice), engine };
    }
  } catch (error) {
    // La voix HD en panne : la voix gratuite suivante (Piper, Kokoro) plutôt que le silence.
    const next = engine === "chatterbox" ? await detectEngine(opts.lang, "auto") : "silent";
    console.warn(`[tts] ${engine} indisponible, ${next === "silent" ? "piste silencieuse" : `voix ${next}`} : ${(error as Error).message}`);
    if (next !== "silent") return synthesize(text, { ...opts, engine: next });
  }

  const durationMs = estimateSpokenMs(text, opts.lang, speed);
  await writeFile(opts.outPath, encodeWav(new Float32Array(Math.round((durationMs / 1000) * 22050)), 22050));
  return { path: opts.outPath, durationMs, engine: "silent" };
}
