import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { brollShots, comfyWorkflow, gatherBroll, pickPexelsFile } from "../broll";
import { fallbackScript } from "../heat";
import { buildTimeline } from "../story";
import type { ViralScript } from "../types";

const base = fallbackScript({ topic: "la tontine", lang: "fr", formula: "secret", template: "story" });
const script: ViralScript = { ...base, beats: base.beats.map((b, i) => (i === 0 ? { ...b, visual: "african women counting cash at a market stall" } : b)) };
const timeline = buildTimeline(script);
const dir = () => mkdtempSync(join(tmpdir(), "septim-broll-"));

type Route = (url: URL, init?: RequestInit) => Response | Promise<Response>;
function fakeFetch(routes: Record<string, Route>) {
  const calls: string[] = [];
  const impl = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(`${init?.method ?? "GET"} ${url.origin}${url.pathname}`);
    const key = Object.keys(routes).find((k) => `${url.origin}${url.pathname}`.startsWith(k));
    if (!key) throw new Error(`réseau coupé : ${url}`);
    return routes[key](url, init);
  }) as unknown as typeof fetch;
  return { impl, calls };
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const mp4 = (n = 64) => new Response(new Uint8Array(n).fill(9), { status: 200, headers: { "Content-Type": "video/mp4" } });

const pexelsVideo = (id: number, files: { w: number; h: number; q?: string }[]) => ({
  id,
  url: `https://www.pexels.com/video/${id}/`,
  user: { name: `Auteur ${id}`, url: `https://www.pexels.com/@a${id}` },
  video_files: files.map((f, i) => ({ id: id * 10 + i, quality: f.q ?? "hd", file_type: "video/mp4", width: f.w, height: f.h, link: `https://videos.pexels.com/${id}-${f.w}x${f.h}.mp4` })),
});

describe("plans de B-roll", () => {
  it("un plan par segment ; la requête vient de « visual » si le beat en a une, sinon du sujet", () => {
    const shots = brollShots(script, timeline, 50);
    expect(shots).toHaveLength(timeline.segments.length);
    expect(shots[1].query).toBe("african women counting cash at a market stall");
    expect(shots[0].query).toBe("la tontine");
    expect(shots[2].query).toBe("la tontine");
    expect(brollShots(script, timeline, 3)).toHaveLength(3);
  });

  it("Pexels : le fichier vertical le plus proche de 1080×1920, jamais un 4K inutile", () => {
    const v = pexelsVideo(1, [
      { w: 3840, h: 2160, q: "uhd" },
      { w: 1080, h: 1920 },
      { w: 2160, h: 3840, q: "uhd" },
      { w: 720, h: 1280, q: "sd" },
    ]);
    expect(pickPexelsFile(v)?.link).toContain("1080x1920");
    expect(pickPexelsFile(pexelsVideo(2, [{ w: 1920, h: 1080 }]))?.link).toContain("1920x1080");
  });
});

describe("gatherBroll : gratuit d'abord, jamais bloquant", () => {
  it("sans clé ni ComfyUI → aucun plan, fonds procéduraux, aucune requête réseau", async () => {
    const f = fakeFetch({});
    const r = await gatherBroll(script, timeline, dir(), { env: {}, fetchImpl: f.impl });
    expect(r).toEqual({ source: "procedural", files: [], credits: [] });
    expect(f.calls).toEqual([]);
  });

  it("VIRAL_BROLL=none coupe tout, même avec une clé", async () => {
    const f = fakeFetch({});
    const r = await gatherBroll(script, timeline, dir(), { env: { VIRAL_BROLL: "none", PEXELS_API_KEY: "k" }, fetchImpl: f.impl });
    expect(r.source).toBe("procedural");
    expect(f.calls).toEqual([]);
  });

  it("Pexels (clé gratuite) : un fichier par plan, vidéos différentes, crédits gardés, en-tête Authorization", async () => {
    let n = 0;
    const seenAuth: string[] = [];
    const f = fakeFetch({
      "https://api.pexels.com/videos/search": (url, init) => {
        seenAuth.push(String((init?.headers as Record<string, string>)?.Authorization));
        expect(url.searchParams.get("orientation")).toBe("portrait");
        return json({ videos: [pexelsVideo(++n, [{ w: 1080, h: 1920 }]), pexelsVideo(100 + n, [{ w: 1080, h: 1920 }])] });
      },
      "https://videos.pexels.com/": () => mp4(),
    });
    const out = dir();
    const r = await gatherBroll(script, timeline, out, { env: { PEXELS_API_KEY: "cle-gratuite" }, fetchImpl: f.impl, maxShots: 4 });
    expect(r.source).toBe("pexels");
    expect(r.files).toHaveLength(4);
    for (const file of r.files) expect(existsSync(join(out, file))).toBe(true);
    expect(new Set(r.files).size).toBe(4);
    expect(seenAuth.every((a) => a === "cle-gratuite")).toBe(true);
    expect(r.credits[0]).toMatchObject({ author: expect.stringContaining("Auteur"), url: expect.stringContaining("pexels.com") });
  });

  it("Pexels en panne → Pixabay prend le relais", async () => {
    const f = fakeFetch({
      "https://api.pexels.com/": () => json({ error: "quota" }, 429),
      "https://pixabay.com/api/videos/": (url) => {
        expect(url.searchParams.get("key")).toBe("pk");
        return json({ hits: [1, 2, 3].map((id) => ({ id, pageURL: `https://pixabay.com/videos/${id}/`, user: `u${id}`, videos: { large: { url: `https://cdn.pixabay.com/${id}.mp4`, width: 1920, height: 1080 }, medium: { url: `https://cdn.pixabay.com/${id}-m.mp4`, width: 1280, height: 720 } } })) });
      },
      "https://cdn.pixabay.com/": () => mp4(),
    });
    const r = await gatherBroll(script, timeline, dir(), { env: { PEXELS_API_KEY: "k", PIXABAY_API_KEY: "pk" }, fetchImpl: f.impl, maxShots: 3 });
    expect(r.source).toBe("pixabay");
    expect(r.files).toHaveLength(3);
  });

  it("tout échoue → procédural, sans lever (le rendu continue)", async () => {
    const f = fakeFetch({ "https://api.pexels.com/": () => json({ videos: [] }) });
    const r = await gatherBroll(script, timeline, dir(), { env: { PEXELS_API_KEY: "k" }, fetchImpl: f.impl, maxShots: 3 });
    expect(r).toEqual({ source: "procedural", files: [], credits: [] });
  });

  it("ComfyUI (IA locale, COMFYUI_URL) : POST /prompt, attend /history, télécharge /view ; prioritaire sur Pexels", async () => {
    const prompts: { prompt: Record<string, { class_type: string; inputs: Record<string, unknown> }> }[] = [];
    let polls = 0;
    const f = fakeFetch({
      "http://gpu.local:8188/system_stats": () => json({ system: { os: "posix" }, devices: [{ name: "cuda:0" }] }),
      "http://gpu.local:8188/prompt": (_u, init) => {
        prompts.push(JSON.parse(String(init?.body)));
        return json({ prompt_id: `p${prompts.length}` });
      },
      "http://gpu.local:8188/history/": (url) => {
        const id = url.pathname.split("/").pop()!;
        // Première interrogation : pas encore fini.
        if (++polls % 2 === 1) return json({});
        return json({ [id]: { status: { completed: true }, outputs: { "11": { images: [{ filename: `${id}.mp4`, subfolder: "septim", type: "output" }], animated: [true] } } } });
      },
      "http://gpu.local:8188/view": (url) => {
        expect(url.searchParams.get("subfolder")).toBe("septim");
        return mp4();
      },
    });
    const out = dir();
    const r = await gatherBroll(script, timeline, out, { env: { COMFYUI_URL: "http://gpu.local:8188", PEXELS_API_KEY: "k" }, fetchImpl: f.impl, maxShots: 2, pollMs: 1 });
    expect(r.source).toBe("comfyui");
    expect(r.files).toHaveLength(2);
    expect(f.calls.some((c) => c.includes("pexels"))).toBe(false);
    const nodes = Object.values(prompts[1].prompt);
    const text = nodes.find((n) => n.class_type === "CLIPTextEncode")!.inputs.text as string;
    expect(text).toContain("african women counting cash");
    expect(nodes.find((n) => n.class_type === "Wan22ImageToVideoLatent")!.inputs).toMatchObject({ width: 704, height: 1280 });
    expect(readFileSync(join(out, r.files[0])).length).toBe(64);
  });

  it("ComfyUI injoignable → étage suivant (Pexels)", async () => {
    const f = fakeFetch({
      "https://api.pexels.com/videos/search": () => json({ videos: [pexelsVideo(7, [{ w: 1080, h: 1920 }])] }),
      "https://videos.pexels.com/": () => mp4(),
    });
    const r = await gatherBroll(script, timeline, dir(), { env: { COMFYUI_URL: "http://gpu.local:8188", PEXELS_API_KEY: "k" }, fetchImpl: f.impl, maxShots: 2 });
    expect(r.source).toBe("pexels");
  });

  it("workflow ComfyUI : Wan 2.2 5B vertical, nombre d'images en 4n+1, et COMFYUI_WORKFLOW personnalisé avec {{prompt}}", () => {
    const wf = comfyWorkflow({ prompt: "a market at dawn", seconds: 3, seed: 42 }, {});
    const latent = Object.values(wf).find((n) => n.class_type === "Wan22ImageToVideoLatent")!;
    expect(((latent.inputs.length as number) - 1) % 4).toBe(0);
    expect(latent.inputs.length).toBeGreaterThanOrEqual(3 * 24);
    const custom = comfyWorkflow({ prompt: "a « market »", seconds: 2, seed: 7 }, { template: '{"1":{"class_type":"LTXVText","inputs":{"text":"{{prompt}}","seed":"{{seed}}","frames":"{{frames}}"}}}' });
    expect(custom["1"].inputs).toEqual({ text: "a « market »", seed: 7, frames: 49 });
  });
});
