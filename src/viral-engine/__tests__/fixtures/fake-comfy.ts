// Faux ComfyUI : /system_stats et /object_info/<Nœud>, avec les deux formes de listes de fichiers.
const combo = (names: string[]) => [names]; // ancienne forme : [[...noms]]
const comboNew = (names: string[]) => ["COMBO", { options: names }]; // nouvelle forme du front ComfyUI

export type ComfyFixture = { unet?: string[]; clip?: string[]; vae?: string[]; ckpt?: string[]; nodes?: string[]; newCombo?: boolean; down?: boolean };
export function fakeComfy(f: ComfyFixture): typeof fetch {
  const c = f.newCombo ? comboNew : combo;
  const nodes = new Set(f.nodes ?? ["UNETLoader", "CLIPLoader", "VAELoader", "CheckpointLoaderSimple", "CreateVideo", "SaveVideo", "ModelSamplingSD3", "Wan22ImageToVideoLatent", "EmptyHunyuanLatentVideo"]);
  return (async (url: string) => {
    if (f.down) throw new Error("fetch failed");
    const path = new URL(String(url)).pathname;
    if (path === "/system_stats") return new Response(JSON.stringify({ system: { comfyui_version: "0.3.60" }, devices: [{ name: "cuda:0 NVIDIA GeForce RTX 3070 : cudaMallocAsync", vram_total: 8 * 1024 ** 3 }] }));
    const name = path.replace("/object_info/", "");
    if (!nodes.has(name)) return new Response("{}");
    const input: Record<string, unknown> = {
      UNETLoader: { unet_name: c(f.unet ?? []) },
      CLIPLoader: { clip_name: c(f.clip ?? []) },
      VAELoader: { vae_name: c(f.vae ?? []) },
      CheckpointLoaderSimple: { ckpt_name: c(f.ckpt ?? []) },
    }[name] ?? {};
    return new Response(JSON.stringify({ [name]: { input: { required: input } } }));
  }) as unknown as typeof fetch;
}


export const WAN22_FILES = { unet: ["wan2.2_ti2v_5B_fp16.safetensors", "flux1-dev.safetensors"], clip: ["umt5_xxl_fp8_e4m3fn_scaled.safetensors", "clip_l.safetensors"], vae: ["wan2.2_vae.safetensors", "ae.safetensors"] };
