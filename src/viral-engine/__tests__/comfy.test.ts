import { describe, expect, it } from "vitest";
import { detectComfy, discoverComfy } from "../comfy";
import { comfyWorkflow } from "../broll";
import { fakeComfy as comfy, WAN22_FILES } from "./fixtures/fake-comfy";

const WAN22 = WAN22_FILES;

describe("ComfyUI : ce qui est installé sur ton PC, lu par l'usine elle-même", () => {
  it("injoignable → reachable false, rien d'autre", async () => {
    const r = await detectComfy("http://host.docker.internal:8188", comfy({ down: true }));
    expect(r.reachable).toBe(false);
    expect(r.profile).toBeUndefined();
  });

  it("Wan 2.2 5B complet → profil wan22-5b, les vrais noms de fichiers, la carte et la version", async () => {
    const r = await detectComfy("http://c:8188/", comfy(WAN22));
    expect(r.reachable).toBe(true);
    expect(r.profile).toBe("wan22-5b");
    expect(r.picked).toEqual({ unet: "wan2.2_ti2v_5B_fp16.safetensors", clip: "umt5_xxl_fp8_e4m3fn_scaled.safetensors", vae: "wan2.2_vae.safetensors" });
    expect(r.missing).toEqual([]);
    expect(r.gpu).toMatch(/RTX 3070/);
    expect(r.vramGb).toBe(8);
    expect(r.version).toBe("0.3.60");
    // Toute la liste détectée est montrée à l'humain (pas seulement ce qui sert).
    expect(r.models.diffusion).toContain("flux1-dev.safetensors");
    expect(r.models.vae).toContain("ae.safetensors");
  });

  it("la nouvelle forme des listes (COMBO + options) est comprise aussi", async () => {
    const r = await detectComfy("http://c:8188", comfy({ ...WAN22, newCombo: true }));
    expect(r.profile).toBe("wan22-5b");
  });

  it("noms de fichiers différents (casse, tirets) : retrouvés quand même", async () => {
    const r = await detectComfy("http://c:8188", comfy({ unet: ["Wan2_2_TI2V_5B_fp8_scaled.safetensors"], clip: ["UMT5-XXL_fp16.safetensors"], vae: ["Wan2.2_VAE.safetensors"] }));
    expect(r.profile).toBe("wan22-5b");
    expect(r.picked!.unet).toBe("Wan2_2_TI2V_5B_fp8_scaled.safetensors");
  });

  it("pas de 2.2 5B mais Wan 2.1 texte→vidéo (1.3B préféré au 14B) → profil wan21-t2v", async () => {
    const r = await detectComfy("http://c:8188", comfy({ unet: ["wan2.1_t2v_14B_fp8_e4m3fn.safetensors", "wan2.1_t2v_1.3B_fp16.safetensors"], clip: ["umt5_xxl_fp8_e4m3fn_scaled.safetensors"], vae: ["wan_2.1_vae.safetensors"] }));
    expect(r.profile).toBe("wan21-t2v");
    expect(r.picked).toEqual({ unet: "wan2.1_t2v_1.3B_fp16.safetensors", clip: "umt5_xxl_fp8_e4m3fn_scaled.safetensors", vae: "wan_2.1_vae.safetensors" });
  });

  it("rien d'utilisable → liste précise de ce qui manque, avec le dossier ComfyUI de chaque fichier", async () => {
    const r = await detectComfy("http://c:8188", comfy({ unet: ["flux1-dev.safetensors"], clip: ["clip_l.safetensors"], vae: ["ae.safetensors"] }));
    expect(r.profile).toBeUndefined();
    const text = r.missing.join("\n");
    expect(text).toContain("wan2.2_ti2v_5B_fp16.safetensors");
    expect(text).toContain("models/diffusion_models");
    expect(text).toContain("umt5_xxl_fp8_e4m3fn_scaled.safetensors");
    expect(text).toContain("models/text_encoders");
    expect(text).toContain("wan2.2_vae.safetensors");
    expect(text).toContain("models/vae");
  });

  it("ComfyUI trop ancien (nœud Wan22ImageToVideoLatent absent) → « mets-le à jour »", async () => {
    const r = await detectComfy("http://c:8188", comfy({ ...WAN22, nodes: ["UNETLoader", "CLIPLoader", "VAELoader", "CreateVideo", "SaveVideo", "ModelSamplingSD3"] }));
    expect(r.profile).toBeUndefined();
    expect(r.missing.join("\n")).toMatch(/à jour/);
  });

  it("discoverComfy : trouve ComfyUI sur les ports habituels (8188 portable, 8000 Desktop) de l'hôte", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: string) => {
      seen.push(String(url));
      if (String(url).startsWith("http://host.docker.internal:8000/system_stats")) return new Response("{}");
      throw new Error("refused");
    }) as unknown as typeof fetch;
    expect(await discoverComfy(fetchImpl, ["host.docker.internal", "127.0.0.1"])).toBe("http://host.docker.internal:8000");
    expect(seen.some((u) => u.includes(":8188"))).toBe(true);
    expect(await discoverComfy((async () => { throw new Error("x"); }) as unknown as typeof fetch)).toBeUndefined();
  });
});

describe("workflow ComfyUI selon le profil détecté", () => {
  const shot = { prompt: "un marché à Douala", seconds: 5, seed: 7 };
  it("wan22-5b avec les noms détectés : UNET, encodeur de texte et VAE de ton PC, 704×1280", () => {
    const w = comfyWorkflow(shot, { env: { COMFYUI_PROFILE: "wan22-5b", COMFYUI_WAN_MODEL: "Wan2_2_TI2V_5B.safetensors", COMFYUI_WAN_CLIP: "umt5-xxl.safetensors", COMFYUI_WAN_VAE: "Wan2.2_VAE.safetensors" } });
    expect(w["1"].inputs.unet_name).toBe("Wan2_2_TI2V_5B.safetensors");
    expect(w["2"].inputs.clip_name).toBe("umt5-xxl.safetensors");
    expect(w["3"].inputs.vae_name).toBe("Wan2.2_VAE.safetensors");
    expect(w["7"].class_type).toBe("Wan22ImageToVideoLatent");
    expect(w["7"].inputs).toMatchObject({ width: 704, height: 1280 });
  });

  it("sans réglage : le profil 2.2 5B et ses noms officiels (comme avant)", () => {
    const w = comfyWorkflow(shot, {});
    expect(w["1"].inputs.unet_name).toBe("wan2.2_ti2v_5B_fp16.safetensors");
    expect(w["2"].inputs.clip_name).toBe("umt5_xxl_fp8_e4m3fn_scaled.safetensors");
    expect(w["3"].inputs.vae_name).toBe("wan2.2_vae.safetensors");
  });

  it("wan21-t2v : EmptyHunyuanLatentVideo vertical 480×832, 16 i/s, 81 images pour 5 s, 30 pas", () => {
    const w = comfyWorkflow(shot, { env: { COMFYUI_PROFILE: "wan21-t2v", COMFYUI_WAN_MODEL: "wan2.1_t2v_1.3B_fp16.safetensors", COMFYUI_WAN_CLIP: "umt5.safetensors", COMFYUI_WAN_VAE: "wan_2.1_vae.safetensors" } });
    expect(w["7"].class_type).toBe("EmptyHunyuanLatentVideo");
    expect(w["7"].inputs).toMatchObject({ width: 480, height: 832, length: 81 });
    expect(w["8"].inputs).toMatchObject({ steps: 30, cfg: 6, sampler_name: "uni_pc" });
    expect(w["10"].inputs.fps).toBe(16);
    expect(w["1"].inputs.unet_name).toBe("wan2.1_t2v_1.3B_fp16.safetensors");
  });
});
