import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Env } from "./config";
import type { Timeline, ViralScript } from "./types";

// B-roll gratuit d'abord (D22) : IA locale ComfyUI si tu l'as branchée, sinon banques libres (Pexels, Pixabay),
// sinon les fonds procéduraux Remotion. Un étage qui échoue passe au suivant : le rendu ne s'arrête jamais pour ça.
// BESOIN CREDIT: Higgsfield Soul + Seedance (ou Runway, Pika) pour des plans sur mesure. Alternative gratuite: les étages ci-dessous.

export type BrollSource = "comfyui" | "pexels" | "pixabay" | "procedural";
export type BrollCredit = { provider: "pexels" | "pixabay"; author: string; url: string };
export type BrollResult = { source: BrollSource; files: string[]; credits: BrollCredit[] };
export type BrollShot = { segmentIndex: number; query: string; seconds: number; fromVisual: boolean };

type Opts = { env: Env; fetchImpl?: typeof fetch; maxShots?: number; pollMs?: number; log?: (text: string) => void };
type Fetched = { bytes: Uint8Array; credit?: BrollCredit };
type Provider = { name: Exclude<BrollSource, "procedural">; ready: () => Promise<boolean>; fetchShot: (shot: BrollShot, used: Set<string>) => Promise<Fetched | undefined> };

const MAX_BYTES = 80 * 1024 * 1024;

// Un plan par segment ; la requête est la description écrite par Claude (« visual »), sinon le sujet.
export function brollShots(script: ViralScript, timeline: Timeline, max: number): BrollShot[] {
  return timeline.segments.slice(0, Math.max(0, max)).map((seg, segmentIndex) => {
    const beat = seg.kind === "beat" ? script.beats.find((b) => b.text.includes(seg.text) || seg.text.includes(b.text)) : undefined;
    const visual = beat?.visual?.trim();
    return { segmentIndex, query: visual || script.topic, seconds: Math.max(1, (seg.endMs - seg.startMs) / 1000), fromVisual: !!visual };
  });
}

type PexelsFile = { quality?: string; file_type?: string; width: number; height: number; link: string };
type PexelsVideo = { id: number; url: string; user?: { name?: string; url?: string }; video_files: PexelsFile[] };

// Le fichier vertical le plus proche de 1080×1920 ; à défaut le plus grand MP4 sous la 4K.
export function pickPexelsFile(v: PexelsVideo): PexelsFile | undefined {
  const mp4 = v.video_files.filter((f) => (f.file_type ?? "video/mp4") === "video/mp4" && f.link);
  const vertical = mp4.filter((f) => f.height >= f.width);
  const pool = vertical.length ? vertical : mp4;
  const score = (f: PexelsFile) => Math.abs(Math.max(f.width, f.height) - 1920) + (Math.max(f.width, f.height) > 2600 ? 10_000 : 0);
  return [...pool].sort((a, b) => score(a) - score(b))[0];
}

async function download(fetchImpl: typeof fetch, url: string, headers?: Record<string, string>): Promise<Uint8Array> {
  const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`${res.status} sur ${new URL(url).host}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error(`fichier vidéo de ${bytes.length} octets refusé`);
  return bytes;
}

function pexels(env: Env, fetchImpl: typeof fetch, lang: string): Provider {
  const key = env.PEXELS_API_KEY?.trim();
  const search = async (query: string, locale: boolean) => {
    const u = new URL("https://api.pexels.com/videos/search");
    u.searchParams.set("query", query.slice(0, 100));
    u.searchParams.set("orientation", "portrait");
    u.searchParams.set("size", "medium");
    u.searchParams.set("per_page", "15");
    if (locale) u.searchParams.set("locale", lang === "fr" ? "fr-FR" : "en-US");
    const res = await fetchImpl(u, { headers: { Authorization: key! }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Pexels ${res.status}`);
    return ((await res.json()) as { videos?: PexelsVideo[] }).videos ?? [];
  };
  return {
    name: "pexels",
    ready: async () => !!key,
    async fetchShot(shot, used) {
      for (const [query, locale] of shot.fromVisual ? [[shot.query, false] as const, [shot.query, true] as const] : [[shot.query, true] as const]) {
        const video = (await search(query, locale)).find((v) => !used.has(`pexels:${v.id}`) && pickPexelsFile(v));
        if (!video) continue;
        used.add(`pexels:${video.id}`);
        return { bytes: await download(fetchImpl, pickPexelsFile(video)!.link), credit: { provider: "pexels", author: video.user?.name ?? "Pexels", url: video.url } };
      }
      return undefined;
    },
  };
}

type PixabayHit = { id: number; pageURL: string; user?: string; videos: Record<string, { url: string; width: number; height: number } | undefined> };

function pixabay(env: Env, fetchImpl: typeof fetch, lang: string): Provider {
  const key = env.PIXABAY_API_KEY?.trim();
  return {
    name: "pixabay",
    ready: async () => !!key,
    async fetchShot(shot, used) {
      const u = new URL("https://pixabay.com/api/videos/");
      u.searchParams.set("key", key!);
      u.searchParams.set("q", shot.query.slice(0, 100));
      u.searchParams.set("video_type", "film");
      u.searchParams.set("safesearch", "true");
      u.searchParams.set("per_page", "20");
      if (!shot.fromVisual) u.searchParams.set("lang", lang);
      const res = await fetchImpl(u, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`Pixabay ${res.status}`);
      const hits = ((await res.json()) as { hits?: PixabayHit[] }).hits ?? [];
      const hit = hits.find((h) => !used.has(`pixabay:${h.id}`) && (h.videos.large?.url || h.videos.medium?.url));
      if (!hit) return undefined;
      used.add(`pixabay:${hit.id}`);
      const file = hit.videos.large?.url ? hit.videos.large : hit.videos.medium!;
      return { bytes: await download(fetchImpl, file.url), credit: { provider: "pixabay", author: hit.user ?? "Pixabay", url: hit.pageURL } };
    },
  };
}

type ComfyNode = { class_type: string; inputs: Record<string, unknown> };
export type ComfyWorkflow = Record<string, ComfyNode>;

const NEGATIVE = "blurry, low quality, distorted, deformed hands, extra fingers, text, subtitles, watermark, logo, frame, static image, jpeg artifacts";

// Wan 2.2 TI2V 5B (Apache 2.0, ~8 Go de VRAM en natif ComfyUI), vertical 704×1280, 24 i/s.
// COMFYUI_WORKFLOW = ton propre workflow « API » (LTX-2, HunyuanVideo…) avec {{prompt}}, {{negative}}, {{seed}}, {{frames}}, {{width}}, {{height}}.
export function comfyWorkflow(shot: { prompt: string; seconds: number; seed: number }, opts: { template?: string; env?: Env }): ComfyWorkflow {
  const frames = Math.min(121, 4 * Math.ceil((shot.seconds * 24) / 4) + 1);
  const values: Record<string, string | number> = { prompt: shot.prompt, negative: NEGATIVE, seed: shot.seed, frames, width: 704, height: 1280 };
  if (opts.template) {
    const fill = (v: unknown): unknown => {
      if (typeof v === "string") {
        const whole = v.match(/^\{\{(\w+)\}\}$/);
        if (whole && whole[1] in values) return values[whole[1]];
        return v.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in values ? String(values[k]) : m));
      }
      if (Array.isArray(v)) return v.map(fill);
      if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)]));
      return v;
    };
    return fill(JSON.parse(opts.template)) as ComfyWorkflow;
  }
  const env = opts.env ?? {};
  return {
    "1": { class_type: "UNETLoader", inputs: { unet_name: env.COMFYUI_WAN_MODEL || "wan2.2_ti2v_5B_fp16.safetensors", weight_dtype: "default" } },
    "2": { class_type: "CLIPLoader", inputs: { clip_name: "umt5_xxl_fp8_e4m3fn_scaled.safetensors", type: "wan", device: "default" } },
    "3": { class_type: "VAELoader", inputs: { vae_name: "wan2.2_vae.safetensors" } },
    "4": { class_type: "ModelSamplingSD3", inputs: { model: ["1", 0], shift: 8 } },
    "5": { class_type: "CLIPTextEncode", inputs: { clip: ["2", 0], text: `${shot.prompt}, vertical 9:16 shot, cinematic, natural light, shallow depth of field, smooth camera motion` } },
    "6": { class_type: "CLIPTextEncode", inputs: { clip: ["2", 0], text: NEGATIVE } },
    "7": { class_type: "Wan22ImageToVideoLatent", inputs: { vae: ["3", 0], width: 704, height: 1280, length: frames, batch_size: 1 } },
    "8": { class_type: "KSampler", inputs: { model: ["4", 0], positive: ["5", 0], negative: ["6", 0], latent_image: ["7", 0], seed: shot.seed, steps: 20, cfg: 5, sampler_name: "uni_pc", scheduler: "simple", denoise: 1 } },
    "9": { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["3", 0] } },
    "10": { class_type: "CreateVideo", inputs: { images: ["9", 0], fps: 24 } },
    "11": { class_type: "SaveVideo", inputs: { video: ["10", 0], filename_prefix: "septim/broll", format: "mp4", codec: "h264" } },
  };
}

type ComfyFile = { filename: string; subfolder?: string; type?: string };

function comfyui(env: Env, fetchImpl: typeof fetch, pollMs: number): Provider {
  const base = (env.COMFYUI_URL || "http://127.0.0.1:8188").replace(/\/+$/, "");
  const timeoutMs = Number(env.VIRAL_COMFYUI_TIMEOUT_MS || 20 * 60_000);
  const template = env.COMFYUI_WORKFLOW ? readFileSync(env.COMFYUI_WORKFLOW, "utf8") : undefined;
  return {
    name: "comfyui",
    // Opt-in : un plan IA prend plusieurs minutes de GPU, on ne le lance jamais sans que tu l'aies demandé.
    ready: async () => {
      if (!env.COMFYUI_URL && env.VIRAL_BROLL !== "comfyui") return false;
      try {
        return (await fetchImpl(`${base}/system_stats`, { signal: AbortSignal.timeout(3000) })).ok;
      } catch {
        return false;
      }
    },
    async fetchShot(shot) {
      const workflow = comfyWorkflow({ prompt: shot.query, seconds: Math.min(5, shot.seconds), seed: Math.floor(Math.random() * 2 ** 31) }, { template, env });
      const res = await fetchImpl(`${base}/prompt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: workflow, client_id: randomUUID() }) });
      if (!res.ok) throw new Error(`ComfyUI ${res.status} : ${(await res.text()).slice(0, 200)}`);
      const { prompt_id: id } = (await res.json()) as { prompt_id: string };
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const h = (await (await fetchImpl(`${base}/history/${id}`)).json()) as Record<string, { outputs?: Record<string, Record<string, unknown>>; status?: { status_str?: string } }>;
        const entry = h[id];
        if (entry?.status?.status_str === "error") throw new Error("ComfyUI : le workflow a échoué (voir la console de ComfyUI).");
        const files = Object.values(entry?.outputs ?? {}).flatMap((o) => ["videos", "gifs", "images"].flatMap((k) => (Array.isArray(o[k]) ? (o[k] as ComfyFile[]) : [])));
        const video = files.find((f) => /\.(mp4|webm|mov)$/i.test(f.filename));
        if (video) {
          const u = new URL(`${base}/view`);
          u.searchParams.set("filename", video.filename);
          u.searchParams.set("subfolder", video.subfolder ?? "");
          u.searchParams.set("type", video.type ?? "output");
          return { bytes: await download(fetchImpl, u.toString()) };
        }
        await new Promise((r) => setTimeout(r, pollMs));
      }
      throw new Error("ComfyUI : délai dépassé pour un plan.");
    },
  };
}

export async function gatherBroll(script: ViralScript, timeline: Timeline, dir: string, opts: Opts): Promise<BrollResult> {
  const { env } = opts;
  const none: BrollResult = { source: "procedural", files: [], credits: [] };
  const mode = (env.VIRAL_BROLL || "auto").toLowerCase();
  if (mode === "none" || mode === "procedural") return none;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const log = opts.log ?? ((t: string) => console.error(`[b-roll] ${t}`));
  const all = [comfyui(env, fetchImpl, opts.pollMs ?? 2000), pexels(env, fetchImpl, script.lang), pixabay(env, fetchImpl, script.lang)];
  const wanted = mode === "auto" ? all : all.filter((p) => p.name === mode || (mode === "stock" && p.name !== "comfyui"));

  for (const provider of wanted) {
    if (!(await provider.ready())) continue;
    const max = opts.maxShots ?? Number(env.VIRAL_BROLL_CLIPS || (provider.name === "comfyui" ? 4 : 12));
    const shots = brollShots(script, timeline, max);
    const used = new Set<string>();
    const files: string[] = [];
    const credits: BrollCredit[] = [];
    mkdirSync(dir, { recursive: true });
    try {
      for (const shot of shots) {
        const got = await provider.fetchShot(shot, used);
        if (!got) continue;
        const name = `${String(files.length).padStart(2, "0")}.mp4`;
        writeFileSync(join(dir, name), got.bytes);
        files.push(name);
        if (got.credit) credits.push(got.credit);
      }
      if (files.length) {
        log(`${files.length} plan(s) ${provider.name}.`);
        return { source: provider.name, files, credits };
      }
      log(`${provider.name} : aucun plan trouvé, étage suivant.`);
    } catch (error) {
      log(`${provider.name} indisponible (${(error as Error).message}), étage suivant.`);
    }
    for (const f of files) rmSync(join(dir, f), { force: true });
  }
  return none;
}
