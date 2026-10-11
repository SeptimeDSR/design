import { spawn, spawnSync } from "node:child_process";
import { FilmError } from "./writer";

// Tout le rendu du long métrage passe par ffmpeg : pas de navigateur, environ 4 fois la vitesse réelle sur 4 cœurs.
export const ffmpegBin = (env: Record<string, string | undefined> = process.env) => env.FFMPEG_PATH || "ffmpeg";
export const ffprobeBin = (env: Record<string, string | undefined> = process.env) => env.FFPROBE_PATH || "ffprobe";

export function hasFfmpeg(env: Record<string, string | undefined> = process.env): boolean {
  return spawnSync(ffmpegBin(env), ["-version"], { stdio: "ignore" }).status === 0;
}

export type RunOpts = { signal?: AbortSignal; cwd?: string; env?: Record<string, string | undefined>; onProgress?: (seconds: number) => void };

export function runFfmpeg(args: string[], opts: RunOpts = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegBin(opts.env), ["-hide_banner", "-nostdin", "-loglevel", "error", "-progress", "pipe:1", "-y", ...args], { cwd: opts.cwd, stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stderr.on("data", (d) => (err = (err + d).slice(-1500)));
    child.stdout.on("data", (d) => {
      const m = /out_time_ms=(\d+)/.exec(String(d));
      if (m && opts.onProgress) opts.onProgress(Number(m[1]) / 1_000_000);
    });
    const abort = () => child.kill("SIGTERM");
    opts.signal?.addEventListener("abort", abort, { once: true });
    child.on("error", (e) => reject(new FilmError(/ENOENT/.test(e.message) ? "ffmpeg est introuvable : il fait partie de l'image Docker (docker compose up -d --build) ; hors Docker, installe-le (ffmpeg.org) ou règle FFMPEG_PATH." : `ffmpeg : ${e.message}`, "no_ffmpeg")));
    child.on("close", (code) => {
      opts.signal?.removeEventListener("abort", abort);
      if (opts.signal?.aborted) return reject(new FilmError("Fabrication annulée.", "aborted"));
      if (code === 0) return resolve();
      reject(new FilmError(`ffmpeg a échoué (${code}) : ${err.trim().split("\n").slice(-6).join(" | ")}`, "render"));
    });
  });
}

export function probeSeconds(file: string, env: Record<string, string | undefined> = process.env): number | undefined {
  const r = spawnSync(ffprobeBin(env), ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  const v = Number(r.stdout.trim());
  return r.status === 0 && Number.isFinite(v) && v > 0 ? v : undefined;
}

export type Frame = { width: number; height: number; fps: number; crf: number };

// Une image prête à bouger : plein cadre (cover) à 2 fois la taille de la vidéo, pour que le zoom reste net.
export function prepareImageArgs(src: string, dst: string, frame: Frame): string[] {
  const w = Math.min(frame.width * 2, 3000);
  const h = Math.round((w * frame.height) / frame.width / 2) * 2;
  return ["-i", src, "-vf", `scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h}`, "-frames:v", "1", "-q:v", "4", dst];
}

const CARD_PALETTE = [
  ["0x35506e", "0x0a0d14"],
  ["0x5a3a5e", "0x0d0811"],
  ["0x2f6157", "0x08130f"],
  ["0x6b4d33", "0x120c07"],
  ["0x34457a", "0x090b16"],
];

// Image de secours : un dégradé sombre de cinéma, jamais d'écran noir.
export function cardImageArgs(dst: string, frame: Frame, seed: number): string[] {
  const [a, b] = CARD_PALETTE[Math.abs(seed) % CARD_PALETTE.length];
  const w = frame.width * 2;
  const h = frame.height * 2;
  return ["-f", "lavfi", "-i", `gradients=s=${w}x${h}:c0=${a}:c1=${b}:x0=0:y0=0:x1=${w}:y1=${h}:d=1:r=1`, "-vf", "vignette=PI/3", "-frames:v", "1", "-q:v", "4", dst];
}

export type Motion = "zoom-in" | "zoom-out" | "pan-right" | "pan-left" | "drift-up" | "drift-down";
export const MOTIONS: Motion[] = ["zoom-in", "pan-right", "zoom-out", "drift-up", "pan-left", "drift-down"];

// Mouvement lent d'une image (Ken Burns). `n` = nombre d'images vidéo de ce plan.
export function motionFilter(motion: Motion, frame: Frame, n: number): string {
  const common = `d=${n}:s=${frame.width}x${frame.height}:fps=${frame.fps}`;
  const mid = { x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" };
  const p = `on/${Math.max(1, n - 1)}`;
  switch (motion) {
    case "zoom-in":
      return `zoompan=z='1+0.16*${p}':x='${mid.x}':y='${mid.y}':${common}`;
    case "zoom-out":
      return `zoompan=z='1.16-0.16*${p}':x='${mid.x}':y='${mid.y}':${common}`;
    case "pan-right":
      return `zoompan=z='1.14':x='(iw-iw/zoom)*${p}':y='${mid.y}':${common}`;
    case "pan-left":
      return `zoompan=z='1.14':x='(iw-iw/zoom)*(1-${p})':y='${mid.y}':${common}`;
    case "drift-up":
      return `zoompan=z='1.08+0.06*${p}':x='${mid.x}':y='(ih-ih/zoom)*(1-${p})':${common}`;
    case "drift-down":
      return `zoompan=z='1.08+0.06*${p}':x='${mid.x}':y='(ih-ih/zoom)*${p}':${common}`;
  }
}

// Un mouvement différent du plan d'avant, stable d'un rendu à l'autre.
export function motionFor(sceneIndex: number, shotIndex: number): Motion {
  return MOTIONS[(sceneIndex * 2 + shotIndex) % MOTIONS.length];
}

export type SceneShotSpec = { image: string; motion: Motion; frames: number };
export type SceneRenderSpec = {
  frame: Frame;
  shots: SceneShotSpec[];
  voice: string;
  durationSec: number;
  music?: string;
  musicVolume: number;
  ass?: string;
  out: string;
  fadeSec: number;
};

const AUDIO = "aac";

// Une scène = ses images qui bougent + sa voix + sa musique + ses sous-titres, en un seul appel ffmpeg.
export function sceneRenderArgs(s: SceneRenderSpec): string[] {
  const args: string[] = [];
  s.shots.forEach((shot) => args.push("-framerate", "1", "-loop", "1", "-t", "1", "-i", shot.image));
  const voiceIdx = s.shots.length;
  args.push("-i", s.voice);
  if (s.music) args.push("-stream_loop", "-1", "-i", s.music);
  const parts: string[] = s.shots.map((shot, i) => `[${i}:v]${motionFilter(shot.motion, s.frame, shot.frames)},format=yuv420p,setsar=1[v${i}]`);
  const labels = s.shots.map((_, i) => `[v${i}]`).join("");
  const fade = Math.min(s.fadeSec, s.durationSec / 3);
  const video = [`fade=t=in:st=0:d=${fade.toFixed(2)}`, `fade=t=out:st=${(s.durationSec - fade).toFixed(2)}:d=${fade.toFixed(2)}`];
  if (s.ass) video.unshift(`ass=${s.ass}`);
  parts.push(`${labels}concat=n=${s.shots.length}:v=1:a=0,${video.join(",")}[vout]`);
  const afade = `afade=t=in:st=0:d=${fade.toFixed(2)},afade=t=out:st=${(s.durationSec - fade).toFixed(2)}:d=${fade.toFixed(2)}`;
  if (s.music) {
    // amix divise par le nombre d'entrées : volume=2 le compense, alimiter garde la crête sous 0 dB.
    parts.push(`[${voiceIdx}:a]aformat=sample_rates=48000:channel_layouts=stereo,apad[voice]`);
    parts.push(`[${voiceIdx + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${s.musicVolume}[bed]`);
    parts.push(`[voice][bed]amix=inputs=2:duration=first:dropout_transition=0,volume=2,alimiter=limit=0.95,${afade}[aout]`);
  } else {
    parts.push(`[${voiceIdx}:a]aformat=sample_rates=48000:channel_layouts=stereo,apad,${afade}[aout]`);
  }
  args.push("-filter_complex", parts.join(";"), "-map", "[vout]", "-map", "[aout]", "-t", s.durationSec.toFixed(3));
  args.push(...encodeArgs(s.frame), s.out);
  return args;
}

// Mêmes réglages pour tous les morceaux : le collage final se fait sans réencoder.
export function encodeArgs(frame: Frame): string[] {
  return ["-c:v", "libx264", "-preset", "veryfast", "-crf", String(frame.crf), "-pix_fmt", "yuv420p", "-r", String(frame.fps), "-g", String(frame.fps * 5), "-c:a", AUDIO, "-b:a", "128k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart"];
}

// Carte titre ou générique : un dégradé, du texte (ASS), un silence.
export function cardSegmentArgs(o: { frame: Frame; image: string; ass?: string; seconds: number; out: string }): string[] {
  const n = Math.round(o.seconds * o.frame.fps);
  const vf = [motionFilter("zoom-in", o.frame, n), "format=yuv420p", "setsar=1", ...(o.ass ? [`ass=${o.ass}`] : []), `fade=t=in:st=0:d=0.6`, `fade=t=out:st=${(o.seconds - 0.6).toFixed(2)}:d=0.6`].join(",");
  return ["-framerate", "1", "-loop", "1", "-t", "1", "-i", o.image, "-f", "lavfi", "-t", String(o.seconds), "-i", "anullsrc=r=48000:cl=stereo", "-vf", vf, "-map", "0:v", "-map", "1:a", "-t", String(o.seconds), ...encodeArgs(o.frame), o.out];
}

export const concatListText = (files: string[]) => files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n") + "\n";

export type Chapter = { title: string; startMs: number; endMs: number };

// Chapitres lus par YouTube et les lecteurs vidéo.
export function chapterMetadata(title: string, chapters: Chapter[]): string {
  const esc = (t: string) => t.replace(/[=;#\\\n]/g, (c) => `\\${c}`);
  return [";FFMETADATA1", `title=${esc(title)}`, ...chapters.flatMap((c) => ["[CHAPTER]", "TIMEBASE=1/1000", `START=${c.startMs}`, `END=${c.endMs}`, `title=${esc(c.title)}`])].join("\n") + "\n";
}

export function concatArgs(list: string, meta: string, out: string): string[] {
  return ["-f", "concat", "-safe", "0", "-i", list, "-i", meta, "-map", "0", "-map_metadata", "1", "-c", "copy", "-movflags", "+faststart", out];
}

// Texte de description YouTube avec les chapitres (00:00 Titre).
export function chapterLines(chapters: Chapter[]): string {
  const stamp = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h ? `${h}:${String(m).padStart(2, "0")}` : String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };
  return chapters.map((c) => `${stamp(c.startMs)} ${c.title}`).join("\n");
}
