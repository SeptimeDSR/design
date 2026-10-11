import { randomUUID } from "node:crypto";
import { options } from "../comfy";
import type { Env } from "../config";
import type { MusicGenerator } from "./music";
import type { ImageGenerator } from "./visuals";

// Tes modèles ComfyUI au service du film, sans rien de payant :
//  - images : Flux 2 klein (4B, quelques secondes par image) ;
//  - musique : ACE-Step 1.5 (instrumental).
// Les graphes suivent les nœuds officiels de ComfyUI ; chaque fichier de modèle est cherché dans TON installation (/object_info)
// et ce qui manque est dit avec le dossier où le mettre. Opt-in : il faut COMFYUI_URL.
// BESOIN CREDIT: Midjourney ou Higgsfield Soul pour des images sur mesure. Alternative gratuite: Flux 2 klein installé ici.

type Node = { class_type: string; inputs: Record<string, unknown> };
export type Workflow = Record<string, Node>;

export type FluxPick = { unet: string; clip: string; vae: string };
export type AcePick = { ckpt: string };
export type FilmModels = {
  reachable: boolean;
  image: { ready: boolean; picked?: FluxPick; missing: string[] };
  music: { ready: boolean; picked?: AcePick; missing: string[]; auraFlow: boolean };
};

const FLUX_NODES = ["UNETLoader", "CLIPLoader", "VAELoader", "CLIPTextEncode", "ConditioningZeroOut", "EmptyFlux2LatentImage", "Flux2Scheduler", "KSamplerSelect", "RandomNoise", "CFGGuider", "SamplerCustomAdvanced", "VAEDecode", "PreviewImage"];
const ACE_NODES = ["CheckpointLoaderSimple", "TextEncodeAceStepAudio1.5", "EmptyAceStep1.5LatentAudio", "ConditioningZeroOut", "KSampler", "VAEDecodeAudio", "PreviewAudio"];

export function fluxWorkflow(shot: { prompt: string; seed: number; width: number; height: number }, m: FluxPick): Workflow {
  return {
    "1": { class_type: "UNETLoader", inputs: { unet_name: m.unet, weight_dtype: "default" } },
    "2": { class_type: "CLIPLoader", inputs: { clip_name: m.clip, type: "flux2", device: "default" } },
    "3": { class_type: "VAELoader", inputs: { vae_name: m.vae } },
    "4": { class_type: "CLIPTextEncode", inputs: { clip: ["2", 0], text: shot.prompt } },
    "5": { class_type: "ConditioningZeroOut", inputs: { conditioning: ["4", 0] } },
    "6": { class_type: "EmptyFlux2LatentImage", inputs: { width: shot.width, height: shot.height, batch_size: 1 } },
    "7": { class_type: "Flux2Scheduler", inputs: { steps: 4, width: shot.width, height: shot.height } },
    "8": { class_type: "KSamplerSelect", inputs: { sampler_name: "euler" } },
    "9": { class_type: "RandomNoise", inputs: { noise_seed: shot.seed } },
    "10": { class_type: "CFGGuider", inputs: { model: ["1", 0], positive: ["4", 0], negative: ["5", 0], cfg: 1 } },
    "11": { class_type: "SamplerCustomAdvanced", inputs: { noise: ["9", 0], guider: ["10", 0], sampler: ["8", 0], sigmas: ["7", 0], latent_image: ["6", 0] } },
    "12": { class_type: "VAEDecode", inputs: { samples: ["11", 0], vae: ["3", 0] } },
    // PreviewImage : le fichier va dans le dossier temporaire de ComfyUI, pas dans tes sorties (place disque).
    "13": { class_type: "PreviewImage", inputs: { images: ["12", 0] } },
  };
}

export function aceWorkflow(track: { prompt: string; seconds: number; seed: number }, m: AcePick, opt: { auraFlow: boolean }): Workflow {
  const model: [string, number] = opt.auraFlow ? ["2", 0] : ["1", 0];
  const wf: Workflow = {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: m.ckpt } },
    "3": {
      class_type: "TextEncodeAceStepAudio1.5",
      inputs: { clip: ["1", 1], tags: track.prompt, lyrics: "[Instrumental]", seed: track.seed, bpm: 80, duration: track.seconds, timesignature: "4", language: "en", keyscale: "C minor", generate_audio_codes: true, cfg_scale: 2, temperature: 0.85, top_p: 0.9, top_k: 0, min_p: 0 },
    },
    "4": { class_type: "ConditioningZeroOut", inputs: { conditioning: ["3", 0] } },
    "5": { class_type: "EmptyAceStep1.5LatentAudio", inputs: { seconds: track.seconds, batch_size: 1 } },
    "6": { class_type: "KSampler", inputs: { model, positive: ["3", 0], negative: ["4", 0], latent_image: ["5", 0], seed: track.seed, steps: 8, cfg: 1, sampler_name: "euler", scheduler: "simple", denoise: 1 } },
    "7": { class_type: "VAEDecodeAudio", inputs: { samples: ["6", 0], vae: ["1", 2] } },
    "8": { class_type: "PreviewAudio", inputs: { audio: ["7", 0] } },
  };
  if (opt.auraFlow) wf["2"] = { class_type: "ModelSamplingAuraFlow", inputs: { model: ["1", 0], shift: 3 } };
  return wf;
}

const trim = (u: string) => u.replace(/\/+$/, "");

export async function detectFilmModels(base: string, fetchImpl: typeof fetch = fetch, env: Env = {}): Promise<FilmModels> {
  const root = trim(base);
  const names = [...new Set([...FLUX_NODES, ...ACE_NODES, "ModelSamplingAuraFlow"])];
  const info: Record<string, unknown> = {};
  try {
    const stats = await fetchImpl(`${root}/system_stats`, { signal: AbortSignal.timeout(4000) });
    if (!stats.ok) throw new Error(String(stats.status));
    await Promise.all(
      names.map(async (n) => {
        info[n] = await fetchImpl(`${root}/object_info/${encodeURIComponent(n)}`, { signal: AbortSignal.timeout(4000) }).then((r) => (r.ok ? r.json() : {}), () => ({}));
      }),
    );
  } catch {
    return { reachable: false, image: { ready: false, missing: [] }, music: { ready: false, missing: [], auraFlow: false } };
  }
  const has = (n: string) => !!(info[n] as Record<string, unknown> | undefined)?.[n];
  const old = (nodes: string[]) => {
    const gone = nodes.filter((n) => !has(n));
    return gone.length ? [`ComfyUI est trop ancien : mets-le à jour (nœud absent : ${gone.join(", ")}).`] : [];
  };
  const unets = options(info.UNETLoader, "UNETLoader", "unet_name");
  const clips = options(info.CLIPLoader, "CLIPLoader", "clip_name");
  const vaes = options(info.VAELoader, "VAELoader", "vae_name");
  const ckpts = options(info.CheckpointLoaderSimple, "CheckpointLoaderSimple", "ckpt_name");

  const unet = env.COMFYUI_FLUX_UNET || unets.find((n) => /flux[-_. ]?2.*klein/i.test(n));
  const clip = env.COMFYUI_FLUX_CLIP || clips.find((n) => /qwen[-_. ]?3.*4b/i.test(n));
  const vae = env.COMFYUI_FLUX_VAE || vaes.find((n) => /flux[-_. ]?2/i.test(n));
  const imageMissing = [
    ...old(FLUX_NODES),
    ...(unet ? [] : ["Modèle d'image : flux-2-klein-4b-fp8.safetensors → dossier ComfyUI/models/diffusion_models"]),
    ...(clip ? [] : ["Encodeur de texte : qwen_3_4b.safetensors → dossier ComfyUI/models/text_encoders"]),
    ...(vae ? [] : ["VAE : flux2-vae.safetensors → dossier ComfyUI/models/vae"]),
  ];
  const ckpt = env.COMFYUI_ACE_MODEL || ckpts.find((n) => /ace[-_. ]?step.*1[._]?5/i.test(n));
  const musicMissing = [...old(ACE_NODES), ...(ckpt ? [] : ["Modèle de musique : ace_step_1.5_turbo_aio.safetensors → dossier ComfyUI/models/checkpoints"])];
  return {
    reachable: true,
    image: { ready: imageMissing.length === 0, ...(unet && clip && vae ? { picked: { unet, clip, vae } } : {}), missing: imageMissing },
    music: { ready: musicMissing.length === 0, ...(ckpt ? { picked: { ckpt } } : {}), missing: musicMissing, auraFlow: has("ModelSamplingAuraFlow") },
  };
}

export function formatFilmModels(d: FilmModels): string {
  const lines: string[] = [];
  if (d.image.ready && d.image.picked) lines.push(`Images du film : Flux 2 klein prêt (${d.image.picked.unet})`);
  else lines.push("Images du film : pas encore (les photos libres Pexels/Pixabay servent en attendant). Il manque :", ...d.image.missing.map((m) => `  - ${m}`));
  if (d.music.ready && d.music.picked) lines.push(`Musique du film : ACE-Step prêt (${d.music.picked.ckpt})`);
  else lines.push("Musique du film : pas encore (un lit d'ambiance généré sert en attendant). Il manque :", ...d.music.missing.map((m) => `  - ${m}`));
  lines.push(
    "",
    "Vidéo IA légère (optionnel, pas nécessaire pour les films) :",
    "  - LTX-Video 2B distillé (≈ 4 Go en fp8) : rapide, tourne sur 8 Go de VRAM ; ou Wan 2.2 5B (≈ 10 Go) pour plus de qualité.",
    "  - Dans ComfyUI : menu Modèles > modèles de modèles > « LTX-Video » ou « Wan2.2 5B » télécharge tout.",
    "  Ton disque est limité : les films utilisent des images qui bougent, 100 fois plus légères que des clips vidéo.",
  );
  return lines.join("\n");
}

type Out = { filename: string; subfolder?: string; type?: string };

async function runPrompt(base: string, fetchImpl: typeof fetch, workflow: Workflow, key: "images" | "audio", timeoutMs: number, pollMs: number): Promise<{ bytes: Uint8Array; filename: string }> {
  const res = await fetchImpl(`${base}/prompt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: workflow, client_id: randomUUID() }) });
  if (!res.ok) throw new Error(`ComfyUI ${res.status} : ${(await res.text()).slice(0, 300)}`);
  const { prompt_id: id } = (await res.json()) as { prompt_id: string };
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const h = (await (await fetchImpl(`${base}/history/${id}`)).json()) as Record<string, { outputs?: Record<string, Record<string, unknown>>; status?: { status_str?: string } }>;
    const entry = h[id];
    if (entry?.status?.status_str === "error") throw new Error("ComfyUI : le workflow a échoué (voir la console de ComfyUI).");
    const file = Object.values(entry?.outputs ?? {}).flatMap((o) => (Array.isArray(o[key]) ? (o[key] as Out[]) : []))[0];
    if (file) {
      const u = new URL(`${base}/view`);
      u.searchParams.set("filename", file.filename);
      u.searchParams.set("subfolder", file.subfolder ?? "");
      u.searchParams.set("type", file.type ?? "temp");
      const r = await fetchImpl(u.toString());
      if (!r.ok) throw new Error(`ComfyUI /view ${r.status}`);
      return { bytes: new Uint8Array(await r.arrayBuffer()), filename: file.filename };
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error("ComfyUI : délai dépassé.");
}

// Opt-in : COMFYUI_URL posée (Réglages > Vidéo IA locale). VIRAL_IMAGES=stock coupe les images IA, VIRAL_FILM_MUSIC=off la musique.
export function filmGenerators(env: Env, fetchImpl: typeof fetch = fetch, opt: { pollMs?: number } = {}): { image?: ImageGenerator; music?: MusicGenerator } {
  if (!env.COMFYUI_URL) return {};
  const base = trim(env.COMFYUI_URL);
  const pollMs = opt.pollMs ?? 1500;
  let models: Promise<FilmModels> | undefined;
  const detect = () => (models ??= detectFilmModels(base, fetchImpl, env));
  const out: { image?: ImageGenerator; music?: MusicGenerator } = {};
  const imageTimeout = Number(env.VIRAL_COMFYUI_IMAGE_TIMEOUT_MS || 10 * 60_000);

  if ((env.VIRAL_IMAGES ?? "").toLowerCase() !== "stock") {
    out.image = {
      name: "comfyui",
      async ready() {
        const d = await detect();
        if (!d.image.ready && d.reachable) console.error(`[film] ComfyUI ne peut pas encore dessiner les images :\n  - ${d.image.missing.join("\n  - ")}`);
        return d.image.ready;
      },
      async generate(prompt, seed) {
        const d = await detect();
        if (!d.image.picked) throw new Error("Flux 2 klein n'est pas prêt dans ComfyUI.");
        const vertical = (env.VIRAL_FILM_ORIENTATION ?? "") === "vertical";
        const r = await runPrompt(base, fetchImpl, fluxWorkflow({ prompt, seed, width: vertical ? 576 : 1024, height: vertical ? 1024 : 576 }, d.image.picked), "images", imageTimeout, pollMs);
        return r.bytes;
      },
    };
  }
  if ((env.VIRAL_FILM_MUSIC ?? "").toLowerCase() !== "off") {
    out.music = {
      async ready() {
        const d = await detect();
        return d.music.ready;
      },
      async generate(prompt, seconds, seed) {
        const d = await detect();
        if (!d.music.picked) throw new Error("ACE-Step n'est pas prêt dans ComfyUI.");
        const r = await runPrompt(base, fetchImpl, aceWorkflow({ prompt, seconds, seed }, d.music.picked, { auraFlow: d.music.auraFlow }), "audio", Number(env.VIRAL_COMFYUI_MUSIC_TIMEOUT_MS || 15 * 60_000), pollMs);
        return { bytes: r.bytes, ext: r.filename.split(".").pop() || "flac" };
      },
    };
  }
  return out;
}
