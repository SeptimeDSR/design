import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeFilm } from "../film/types";
import { createVisualSession, sceneImages, shotPrompt, type ImageGenerator } from "../film/visuals";

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "film-visuals-"));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

const frame = { width: 320, height: 180, fps: 12, crf: 30 };
const film = normalizeFilm(
  {
    title: "T",
    genre: "drame",
    scenes: [
      {
        title: "Cuisine",
        location: "old kitchen at night",
        mood: "tension",
        shots: [
          { narration: "Un.", visual: "old woman at kitchen table" },
          { narration: "Deux.", visual: "old woman at kitchen table" },
          { narration: "Trois.", visual: "rain on window" },
          { narration: "Quatre." },
        ],
      },
      { title: "Rue", mood: "calme", shots: [{ narration: "Cinq.", visual: "old woman at kitchen table" }] },
    ],
  },
  { lang: "fr", genre: "drame" },
)!;

// Faux réseau : Pexels et Pixabay répondent avec N photos par recherche ; chaque téléchargement rend 4 octets.
function fakeNet(opts: { pexels?: number; pixabay?: number; pexels429?: boolean; empty?: (q: string) => boolean } = {}) {
  const log: { url: string; headers?: Record<string, string> }[] = [];
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    log.push({ url, headers: init?.headers as Record<string, string> });
    const u = new URL(url);
    if (u.host === "api.pexels.com") {
      if (opts.pexels429) return new Response("rate limit", { status: 429 });
      const q = u.searchParams.get("query")!;
      const n = opts.empty?.(q) ? 0 : (opts.pexels ?? 10);
      return Response.json({ photos: Array.from({ length: n }, (_, i) => ({ id: `${q}-${i}`.replace(/\W/g, ""), url: `https://www.pexels.com/photo/${encodeURIComponent(q)}-${i}`, photographer: `Ana ${i}`, src: { large2x: `https://images.pexels.com/${encodeURIComponent(q)}/${i}.jpg` } })) });
    }
    if (u.host === "pixabay.com") {
      const q = u.searchParams.get("q")!;
      const n = opts.empty?.(q) ? 0 : (opts.pixabay ?? 10);
      return Response.json({ hits: Array.from({ length: n }, (_, i) => ({ id: `${q}-${i}`.replace(/\W/g, ""), pageURL: `https://pixabay.com/p/${i}`, user: `Bob ${i}`, largeImageURL: `https://cdn.pixabay.com/${encodeURIComponent(q)}/${i}.jpg` })) });
    }
    return new Response(new Uint8Array([1, 2, 3, 4]));
  }) as typeof fetch;
  return { fetchImpl, log };
}

const prepare = async (src: string, dst: string) => copyFileSync(src, dst);
const card = async (dst: string) => writeFileSync(dst, "card");
const base = (dir: string, net: ReturnType<typeof fakeNet>, env: Record<string, string> = {}) => ({
  film,
  dir,
  frame,
  orientation: "paysage" as const,
  env: { PEXELS_API_KEY: "SECRETKEY", ...env },
  fetchImpl: net.fetchImpl,
  prepare,
  card,
  session: createVisualSession(),
});

describe("sceneImages : une image par plan, sans jamais sortir de la scène sans image", () => {
  it("une recherche par image décrite (pas par plan), des photos différentes, la clé dans l'en-tête seulement", async () => {
    const dir = tmp();
    const net = fakeNet();
    const r = await sceneImages({ ...base(dir, net), sceneIndex: 0 });
    expect(r.images).toHaveLength(4);
    expect(new Set(r.images.map((i) => i.path)).size).toBe(4); // 4 plans, 4 fichiers distincts
    expect(r.images.every((i) => i.source === "pexels")).toBe(true);
    const searches = net.log.filter((l) => l.url.includes("/v1/search"));
    // 2 descriptions différentes + (plan sans description : le lieu de la scène)
    expect(searches.length).toBeLessThanOrEqual(3);
    expect(searches[0].url).toContain("orientation=landscape");
    expect(searches[0].headers?.Authorization).toBe("SECRETKEY");
    expect(net.log.every((l) => !l.url.includes("SECRETKEY"))).toBe(true);
    expect(r.credits.length).toBe(4);
    expect(r.credits[0]).toMatchObject({ provider: "pexels" });
  });

  it("vertical : orientation portrait", async () => {
    const net = fakeNet();
    await sceneImages({ ...base(tmp(), net), orientation: "vertical", sceneIndex: 0 });
    expect(net.log.find((l) => l.url.includes("/v1/search"))!.url).toContain("orientation=portrait");
  });

  it("la même photo n'est jamais reprise d'une scène à l'autre", async () => {
    const dir = tmp();
    const net = fakeNet();
    const common = base(dir, net);
    const a = await sceneImages({ ...common, sceneIndex: 0 });
    const b = await sceneImages({ ...common, sceneIndex: 1 });
    const urls = net.log.filter((l) => l.url.includes("images.pexels.com")).map((l) => l.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(a.images[0].path).not.toBe(b.images[0].path);
  });

  it("Pexels limité (429) : Pixabay prend le relais, et Pexels n'est plus interrogé de toute la session", async () => {
    const net = fakeNet({ pexels429: true });
    const common = base(tmp(), net, { PIXABAY_API_KEY: "PXKEY" });
    const a = await sceneImages({ ...common, sceneIndex: 0 });
    expect(a.images.every((i) => i.source === "pixabay")).toBe(true);
    const pexelsCalls = net.log.filter((l) => l.url.includes("api.pexels.com")).length;
    await sceneImages({ ...common, sceneIndex: 1 });
    expect(net.log.filter((l) => l.url.includes("api.pexels.com")).length).toBe(pexelsCalls);
  });

  it("aucune clé : des cartes de cinéma, aucun appel réseau", async () => {
    const net = fakeNet();
    const r = await sceneImages({ ...base(tmp(), net, { PEXELS_API_KEY: "" }), sceneIndex: 0 });
    expect(net.log).toHaveLength(0);
    expect(r.images.every((i) => i.source === "procedural" && existsSync(i.path))).toBe(true);
    expect(r.credits).toEqual([]);
  });

  it("description sans résultat : on essaie le lieu de la scène, puis l'ambiance", async () => {
    const net = fakeNet({ empty: (q) => q === "rain on window" || q === "old woman at kitchen table" });
    const r = await sceneImages({ ...base(tmp(), net), sceneIndex: 0 });
    const queries = net.log.filter((l) => l.url.includes("/v1/search")).map((l) => new URL(l.url).searchParams.get("query"));
    expect(queries).toContain("old kitchen at night");
    expect(r.images.every((i) => i.source !== "procedural")).toBe(true);
  });

  it("moins de photos que de plans : les images de la scène sont réutilisées (autre mouvement), pas de carte vide", async () => {
    const net = fakeNet({ pexels: 1 });
    const r = await sceneImages({ ...base(tmp(), net), sceneIndex: 0 });
    expect(r.images).toHaveLength(4);
    expect(r.images.filter((i) => i.source === "procedural")).toHaveLength(0);
    expect(new Set(r.images.map((i) => i.path)).size).toBeLessThan(4);
  });

  it("reprise : une scène déjà faite ne touche plus au réseau", async () => {
    const dir = tmp();
    const net = fakeNet();
    const first = await sceneImages({ ...base(dir, net), sceneIndex: 0 });
    const calls = net.log.length;
    const again = await sceneImages({ ...base(dir, net), sceneIndex: 0 });
    expect(net.log.length).toBe(calls);
    expect(again.images.map((i) => i.path)).toEqual(first.images.map((i) => i.path));
    expect(again.credits).toEqual(first.credits);
    expect(readdirSync(join(dir, "images")).some((f) => f.endsWith(".raw"))).toBe(false);
  });

  it("un téléchargement qui échoue ne perd pas la scène : l'image suivante ou une carte", async () => {
    const net = fakeNet();
    const failing = (async (input: string | URL, init?: RequestInit) => {
      if (String(input).includes("images.pexels.com")) throw new Error("fetch failed");
      return net.fetchImpl(input, init);
    }) as typeof fetch;
    const r = await sceneImages({ ...base(tmp(), net), fetchImpl: failing, sceneIndex: 0 });
    expect(r.images).toHaveLength(4);
    expect(r.images.every((i) => existsSync(i.path))).toBe(true);
  });
});

describe("images générées par ComfyUI (Flux 2 klein)", () => {
  const prompts: string[] = [];
  const generator = (failOn?: number): ImageGenerator => ({
    name: "comfyui",
    ready: async () => true,
    generate: async (prompt) => {
      prompts.push(prompt);
      if (failOn !== undefined && prompts.length === failOn) throw new Error("ComfyUI a planté");
      return new Uint8Array([9, 9, 9]);
    },
  });

  it("une image par plan, décrite avec le genre et l'ambiance ; aucun crédit à donner", async () => {
    prompts.length = 0;
    const net = fakeNet();
    const r = await sceneImages({ ...base(tmp(), net), generator: generator(), sceneIndex: 0 });
    expect(r.images.every((i) => i.source === "comfyui")).toBe(true);
    expect(prompts).toHaveLength(4);
    expect(prompts[0]).toContain("old woman at kitchen table");
    expect(prompts[0]).toMatch(/cinematic/i);
    expect(prompts[0]).toMatch(/tense|tension/i);
    expect(r.credits).toEqual([]);
    expect(net.log).toHaveLength(0);
  });

  it("une image ratée est remplacée par une photo libre pour ce plan seulement", async () => {
    prompts.length = 0;
    const net = fakeNet();
    const r = await sceneImages({ ...base(tmp(), net), generator: generator(2), sceneIndex: 0 });
    expect(r.images.map((i) => i.source)).toEqual(["comfyui", "pexels", "comfyui", "comfyui"]);
  });

  it("shotPrompt : le style du genre, jamais de texte à l'écran", () => {
    const p = shotPrompt(film, film.scenes[0], film.scenes[0].shots[0]);
    expect(p).toContain("old woman at kitchen table");
    expect(p).toMatch(/no text/i);
  });
});
