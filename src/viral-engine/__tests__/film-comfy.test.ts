import { describe, expect, it } from "vitest";
import { detectFilmModels, filmGenerators, formatFilmModels, fluxWorkflow, aceWorkflow } from "../film/comfy-film";

const combo = (names: string[]) => [names];
// Faux ComfyUI : les nœuds et fichiers qu'on lui donne ; /prompt garde le workflow ; /history rend une image ou un son.
function fakeComfy(o: { unet?: string[]; clip?: string[]; vae?: string[]; ckpt?: string[]; missingNodes?: string[]; fail?: boolean }) {
  const prompts: Record<string, { class_type: string; inputs: Record<string, unknown> }>[] = [];
  const nodes: Record<string, object> = {
    UNETLoader: { input: { required: { unet_name: combo(o.unet ?? []) } } },
    CLIPLoader: { input: { required: { clip_name: combo(o.clip ?? []) } } },
    VAELoader: { input: { required: { vae_name: combo(o.vae ?? []) } } },
    CheckpointLoaderSimple: { input: { required: { ckpt_name: combo(o.ckpt ?? []) } } },
  };
  for (const n of ["CLIPTextEncode", "EmptyFlux2LatentImage", "Flux2Scheduler", "KSamplerSelect", "RandomNoise", "CFGGuider", "SamplerCustomAdvanced", "VAEDecode", "PreviewImage", "ConditioningZeroOut", "TextEncodeAceStepAudio1.5", "EmptyAceStep1.5LatentAudio", "KSampler", "VAEDecodeAudio", "PreviewAudio", "ModelSamplingAuraFlow"]) nodes[n] = { input: { required: {} } };
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    const m = /^\/object_info\/(.+)$/.exec(u.pathname);
    if (m) {
      const name = decodeURIComponent(m[1]);
      return o.missingNodes?.includes(name) || !nodes[name] ? Response.json({}) : Response.json({ [name]: nodes[name] });
    }
    if (u.pathname === "/system_stats") return Response.json({});
    if (u.pathname === "/prompt") {
      prompts.push(JSON.parse(String(init?.body)).prompt);
      return o.fail ? new Response("bad", { status: 400 }) : Response.json({ prompt_id: "p1" });
    }
    if (u.pathname === "/history/p1") {
      const wf = prompts.at(-1)!;
      const isAudio = Object.values(wf).some((n) => n.class_type === "PreviewAudio");
      return Response.json({ p1: { status: { status_str: "success" }, outputs: { "9": isAudio ? { audio: [{ filename: "a.flac", subfolder: "", type: "temp" }] } : { images: [{ filename: "i.png", subfolder: "", type: "temp" }] } } } });
    }
    if (u.pathname === "/view") return new Response(new Uint8Array([1, 2, 3, 4]));
    return new Response("", { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, prompts };
}
const READY = { unet: ["flux-2-klein-4b-fp8.safetensors"], clip: ["qwen_3_4b.safetensors"], vae: ["flux2-vae.safetensors", "wan2.2_vae.safetensors"], ckpt: ["ace_step_1.5_turbo_aio.safetensors"] };

describe("detectFilmModels : ce que ton ComfyUI sait faire pour un film", () => {
  it("Flux 2 klein et ACE-Step 1.5 reconnus par leurs fichiers, avec ce qui a été choisi", async () => {
    const d = await detectFilmModels("http://c", fakeComfy(READY).fetchImpl);
    expect(d.image).toMatchObject({ ready: true, picked: { unet: "flux-2-klein-4b-fp8.safetensors", clip: "qwen_3_4b.safetensors", vae: "flux2-vae.safetensors" } });
    expect(d.music).toMatchObject({ ready: true, picked: { ckpt: "ace_step_1.5_turbo_aio.safetensors" } });
  });

  it("le cas réel de ce PC : modèle d'image et musique là, mais aucun encodeur de texte → dit lequel télécharger et où", async () => {
    const d = await detectFilmModels("http://c", fakeComfy({ ...READY, clip: [], vae: ["wan2.2_vae.safetensors"] }).fetchImpl);
    expect(d.image.ready).toBe(false);
    expect(d.image.missing.join(" ")).toMatch(/qwen_3_4b.*text_encoders/);
    expect(d.image.missing.join(" ")).toMatch(/flux2-vae.*vae/);
    expect(d.music.ready).toBe(true);
    const text = formatFilmModels(d);
    expect(text).toMatch(/Images du film : pas encore/);
    expect(text).toMatch(/Musique du film : ACE-Step prêt/);
  });

  it("nœud absent (ComfyUI trop ancien) : le dit", async () => {
    const d = await detectFilmModels("http://c", fakeComfy({ ...READY, missingNodes: ["EmptyFlux2LatentImage"] }).fetchImpl);
    expect(d.image.ready).toBe(false);
    expect(d.image.missing.join(" ")).toMatch(/met.*à jour|EmptyFlux2LatentImage/);
  });

  it("tes variables COMFYUI_FLUX_UNET / _CLIP / _VAE passent avant la détection", async () => {
    const d = await detectFilmModels("http://c", fakeComfy({ unet: ["autre.safetensors"], clip: ["enc.safetensors"], vae: ["v.safetensors"], ckpt: [] }).fetchImpl, { COMFYUI_FLUX_UNET: "autre.safetensors", COMFYUI_FLUX_CLIP: "enc.safetensors", COMFYUI_FLUX_VAE: "v.safetensors" });
    expect(d.image.ready).toBe(true);
  });
});

describe("workflows", () => {
  it("Flux 2 klein : graphe cohérent (chaque lien pointe un nœud qui existe), 4 pas, cfg 1, taille multiple de 16", () => {
    const wf = fluxWorkflow({ prompt: "old kitchen", seed: 5, width: 1024, height: 576 }, { unet: "u", clip: "c", vae: "v" });
    for (const node of Object.values(wf)) for (const v of Object.values(node.inputs)) if (Array.isArray(v)) expect(wf[String(v[0])], JSON.stringify(v)).toBeDefined();
    const cls = Object.values(wf).map((n) => n.class_type);
    expect(cls).toEqual(expect.arrayContaining(["UNETLoader", "CLIPLoader", "VAELoader", "EmptyFlux2LatentImage", "Flux2Scheduler", "CFGGuider", "SamplerCustomAdvanced", "PreviewImage"]));
    expect(Object.values(wf).find((n) => n.class_type === "CLIPLoader")!.inputs.type).toBe("flux2");
    expect(Object.values(wf).find((n) => n.class_type === "Flux2Scheduler")!.inputs.steps).toBe(4);
    expect(Object.values(wf).find((n) => n.class_type === "CFGGuider")!.inputs.cfg).toBe(1);
    expect(1024 % 16 + 576 % 16).toBe(0);
  });

  it("ACE-Step 1.5 : instrumental, durée demandée, liens cohérents, modèle d'échantillonnage seulement s'il existe", () => {
    const wf = aceWorkflow({ prompt: "tense strings", seconds: 90, seed: 3 }, { ckpt: "k" }, { auraFlow: false });
    for (const node of Object.values(wf)) for (const v of Object.values(node.inputs)) if (Array.isArray(v)) expect(wf[String(v[0])]).toBeDefined();
    const enc = Object.values(wf).find((n) => n.class_type === "TextEncodeAceStepAudio1.5")!;
    expect(enc.inputs.lyrics).toBe("[Instrumental]");
    expect(enc.inputs.duration).toBe(90);
    expect(Object.values(wf).some((n) => n.class_type === "ModelSamplingAuraFlow")).toBe(false);
    expect(Object.values(aceWorkflow({ prompt: "x", seconds: 30, seed: 1 }, { ckpt: "k" }, { auraFlow: true })).some((n) => n.class_type === "ModelSamplingAuraFlow")).toBe(true);
  });
});

describe("filmGenerators", () => {
  it("sans COMFYUI_URL : rien (opt-in), même si ComfyUI tourne", () => {
    expect(filmGenerators({}, fakeComfy(READY).fetchImpl)).toEqual({});
  });

  it("image : prête quand les fichiers y sont, rend les octets de l'image ; prompt envoyé à /prompt", async () => {
    const c = fakeComfy(READY);
    const g = filmGenerators({ COMFYUI_URL: "http://c" }, c.fetchImpl, { pollMs: 1 });
    expect(await g.image!.ready()).toBe(true);
    const bytes = await g.image!.generate("rain on window, cinematic", 7);
    expect([...bytes]).toEqual([1, 2, 3, 4]);
    expect(JSON.stringify(c.prompts[0])).toContain("rain on window");
  });

  it("image pas prête (encodeur absent) : ready() faux, jamais de workflow envoyé", async () => {
    const c = fakeComfy({ ...READY, clip: [] });
    const g = filmGenerators({ COMFYUI_URL: "http://c" }, c.fetchImpl, { pollMs: 1 });
    expect(await g.image!.ready()).toBe(false);
    expect(c.prompts).toHaveLength(0);
  });

  it("VIRAL_IMAGES=stock coupe les images IA ; VIRAL_FILM_MUSIC=off coupe la musique IA", () => {
    const g = filmGenerators({ COMFYUI_URL: "http://c", VIRAL_IMAGES: "stock", VIRAL_FILM_MUSIC: "off" }, fakeComfy(READY).fetchImpl);
    expect(g.image).toBeUndefined();
    expect(g.music).toBeUndefined();
  });

  it("musique : rend l'extension du fichier produit ; ComfyUI qui refuse le workflow → erreur avec son message", async () => {
    const c = fakeComfy(READY);
    const g = filmGenerators({ COMFYUI_URL: "http://c" }, c.fetchImpl, { pollMs: 1 });
    expect(await g.music!.ready()).toBe(true);
    const r = await g.music!.generate("tense strings", 90, 1);
    expect(r.ext).toBe("flac");
    const bad = filmGenerators({ COMFYUI_URL: "http://c" }, fakeComfy({ ...READY, fail: true }).fetchImpl, { pollMs: 1 });
    await expect(bad.music!.generate("x", 30, 1)).rejects.toThrow(/ComfyUI 400/);
  });
});
