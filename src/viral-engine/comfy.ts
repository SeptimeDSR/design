// Ce que ton ComfyUI a installé, lu par l'usine elle-même (API /object_info) : tu n'as rien à lui montrer.
export type ComfyProfile = "wan22-5b" | "wan21-t2v";

export type ComfyInfo = {
  reachable: boolean;
  version?: string;
  gpu?: string;
  vramGb?: number;
  models: { diffusion: string[]; textEncoders: string[]; vae: string[]; checkpoints: string[] };
  nodes: Record<string, boolean>;
  profile?: ComfyProfile;
  picked?: { unet: string; clip: string; vae: string };
  missing: string[];
};

const NODES = ["UNETLoader", "CLIPLoader", "VAELoader", "CheckpointLoaderSimple", "ModelSamplingSD3", "CreateVideo", "SaveVideo", "Wan22ImageToVideoLatent", "EmptyHunyuanLatentVideo"];
const trimUrl = (u: string) => u.replace(/\/+$/, "");

// Les listes de fichiers : [[a, b]] (ancien front) ou ["COMBO", { options: [a, b] }] (nouveau).
function options(info: unknown, node: string, field: string): string[] {
  const entry = (info as Record<string, { input?: { required?: Record<string, unknown> } }> | undefined)?.[node]?.input?.required?.[field];
  if (!Array.isArray(entry)) return [];
  if (Array.isArray(entry[0])) return entry[0].filter((x): x is string => typeof x === "string");
  if (entry[0] === "COMBO") return ((entry[1] as { options?: unknown[] } | undefined)?.options ?? []).filter((x): x is string => typeof x === "string");
  return [];
}

const WAN22 = /wan[._ -]?2[._ -]?2.*(ti2v|5b)/i;
const WAN21 = /wan[._ -]?2[._ -]?1.*t2v/i;
const pickClip = (names: string[]) => {
  const umt5 = names.filter((n) => /umt5/i.test(n));
  return umt5.find((n) => /fp8.*scaled/i.test(n)) ?? umt5.find((n) => /fp8/i.test(n)) ?? umt5[0];
};

export async function detectComfy(url: string, fetchImpl: typeof fetch = fetch): Promise<ComfyInfo> {
  const base = trimUrl(url);
  const empty: ComfyInfo = { reachable: false, models: { diffusion: [], textEncoders: [], vae: [], checkpoints: [] }, nodes: {}, missing: [] };
  const get = async (path: string) => {
    const res = await fetchImpl(`${base}${path}`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(String(res.status));
    return res.json() as Promise<unknown>;
  };
  let stats: { system?: { comfyui_version?: string }; devices?: { name?: string; vram_total?: number }[] };
  try {
    stats = (await get("/system_stats")) as typeof stats;
  } catch {
    return empty;
  }
  const infos = await Promise.all(NODES.map((n) => get(`/object_info/${n}`).catch(() => ({}))));
  const info = Object.fromEntries(NODES.map((n, i) => [n, infos[i]]));
  const nodes = Object.fromEntries(NODES.map((n) => [n, !!(info[n] as Record<string, unknown>)[n]]));
  const models = {
    diffusion: options(info.UNETLoader, "UNETLoader", "unet_name"),
    textEncoders: options(info.CLIPLoader, "CLIPLoader", "clip_name"),
    vae: options(info.VAELoader, "VAELoader", "vae_name"),
    checkpoints: options(info.CheckpointLoaderSimple, "CheckpointLoaderSimple", "ckpt_name"),
  };
  const device = stats.devices?.[0];
  const out: ComfyInfo = {
    reachable: true,
    ...(stats.system?.comfyui_version ? { version: stats.system.comfyui_version } : {}),
    ...(device?.name ? { gpu: device.name.replace(/^cuda:\d+\s*/, "").replace(/\s*:\s*cuda\w*$/i, "").trim() } : {}),
    ...(device?.vram_total ? { vramGb: Math.round(device.vram_total / 1024 ** 3) } : {}),
    models,
    nodes,
    missing: [],
  };

  const clip = pickClip(models.textEncoders);
  const common = nodes.UNETLoader && nodes.CLIPLoader && nodes.VAELoader && nodes.CreateVideo && nodes.SaveVideo && nodes.ModelSamplingSD3;
  const unet22 = models.diffusion.find((n) => WAN22.test(n));
  const vae22 = models.vae.find((n) => /wan[._ -]?2[._ -]?2/i.test(n));
  if (common && unet22 && clip && vae22 && nodes.Wan22ImageToVideoLatent) return { ...out, profile: "wan22-5b", picked: { unet: unet22, clip, vae: vae22 } };

  const unets21 = models.diffusion.filter((n) => WAN21.test(n)).sort((a, b) => Number(/1[._]3b/i.test(b)) - Number(/1[._]3b/i.test(a)));
  const vae21 = models.vae.find((n) => /wan[._ -]?2[._ -]?1/i.test(n));
  if (common && unets21[0] && clip && vae21 && nodes.EmptyHunyuanLatentVideo) return { ...out, profile: "wan21-t2v", picked: { unet: unets21[0], clip, vae: vae21 } };

  const missing: string[] = [];
  if (!nodes.Wan22ImageToVideoLatent) missing.push("ComfyUI est trop ancien : mets-le à jour (le nœud Wan22ImageToVideoLatent est absent).");
  if (!unet22) missing.push("Modèle vidéo : wan2.2_ti2v_5B_fp16.safetensors → dossier ComfyUI/models/diffusion_models");
  if (!clip) missing.push("Encodeur de texte : umt5_xxl_fp8_e4m3fn_scaled.safetensors → dossier ComfyUI/models/text_encoders");
  if (!vae22) missing.push("VAE : wan2.2_vae.safetensors → dossier ComfyUI/models/vae");
  return { ...out, missing };
}

// Cherche ComfyUI sur ton PC : 8188 (version portable) et 8000 (application Desktop), vu depuis Docker puis en local.
export async function discoverComfy(fetchImpl: typeof fetch = fetch, hosts = ["host.docker.internal", "127.0.0.1"], ports = [8188, 8000, 8189]): Promise<string | undefined> {
  const candidates = hosts.flatMap((h) => ports.map((p) => `http://${h}:${p}`));
  const hits = await Promise.all(candidates.map((u) => fetchImpl(`${u}/system_stats`, { signal: AbortSignal.timeout(900) }).then((r) => r.ok, () => false)));
  return candidates.find((_, i) => hits[i]);
}
