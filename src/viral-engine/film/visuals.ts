import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { BrollCredit } from "../broll";
import type { Env } from "../config";
import type { Orientation } from "../duration";
import { writeJsonAtomic } from "../lock";
import { cardImageArgs, prepareImageArgs, runFfmpeg, type Frame } from "./ffmpeg";
import type { FilmScript, Mood, Scene, Shot } from "./types";

// Les images du film. Gratuit d'abord : photos libres (Pexels, Pixabay) qui bougent doucement (Ken Burns), cartes de cinéma sinon.
// Si ton ComfyUI a un modèle d'image (Flux 2 klein), il dessine chaque plan lui-même : voir comfy-film.ts.
// BESOIN CREDIT: Higgsfield Soul ou Midjourney pour des visuels sur mesure. Alternative gratuite: Flux 2 klein dans ComfyUI, ou les photos ci-dessous.

export type ShotImage = { path: string; source: "comfyui" | "pexels" | "pixabay" | "procedural"; credit?: BrollCredit };
export type ImageGenerator = { name: "comfyui"; ready(): Promise<boolean>; generate(prompt: string, seed: number): Promise<Uint8Array> };

type Candidate = { key: string; url: string; credit: BrollCredit; headers?: Record<string, string> };
type Searcher = { name: "pexels" | "pixabay"; search(query: string): Promise<Candidate[]> };

// Une session = un film : ce qui est déjà pris ne l'est plus, un fournisseur épuisé n'est plus interrogé.
export type VisualSession = { used: Set<string>; exhausted: Set<string>; generatorReady?: boolean };
export const createVisualSession = (): VisualSession => ({ used: new Set(), exhausted: new Set() });

const MOOD_QUERY: Record<Mood, string> = {
  calme: "peaceful quiet landscape",
  tension: "dark shadows night",
  tristesse: "rain window lonely",
  joie: "sunny people smiling",
  mystere: "fog forest night",
  action: "city night lights motion",
};
const MOOD_LIGHT: Record<Mood, string> = {
  calme: "soft warm light, calm atmosphere",
  tension: "tense atmosphere, hard shadows, low key lighting",
  tristesse: "muted colors, overcast light, melancholic",
  joie: "bright warm sunlight, joyful",
  mystere: "fog, dim light, mysterious atmosphere",
  action: "dynamic lighting, motion, high contrast",
};

export function shotPrompt(film: FilmScript, scene: Scene, shot: Shot): string {
  const what = shot.visual || scene.location || scene.title;
  return `${what}, cinematic still from a ${film.genre ?? "drama"} film, ${MOOD_LIGHT[scene.mood]}, 35mm, shallow depth of field, realistic, no text, no watermark, no logo`;
}

async function getJson(fetchImpl: typeof fetch, url: string, headers?: Record<string, string>) {
  const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (res.status === 429) throw Object.assign(new Error("limite de requêtes atteinte"), { limited: true });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json() as Promise<unknown>;
}

function pexelsPhotos(env: Env, fetchImpl: typeof fetch, orientation: Orientation, lang: string): Searcher | undefined {
  const key = env.PEXELS_API_KEY?.trim();
  if (!key) return undefined;
  return {
    name: "pexels",
    async search(query) {
      const u = new URL("https://api.pexels.com/v1/search");
      u.searchParams.set("query", query.slice(0, 100));
      u.searchParams.set("orientation", orientation === "vertical" ? "portrait" : "landscape");
      u.searchParams.set("size", "large");
      u.searchParams.set("per_page", "30");
      if (lang === "fr") u.searchParams.set("locale", "fr-FR");
      const body = (await getJson(fetchImpl, u.toString(), { Authorization: key })) as { photos?: { id: number | string; url: string; photographer?: string; src: { large2x?: string; large?: string } }[] };
      return (body.photos ?? [])
        .filter((p) => p.src?.large2x || p.src?.large)
        .map((p) => ({ key: `pexels:${p.id}`, url: (p.src.large2x ?? p.src.large)!, credit: { provider: "pexels" as const, author: p.photographer ?? "Pexels", url: p.url } }));
    },
  };
}

function pixabayPhotos(env: Env, fetchImpl: typeof fetch, orientation: Orientation, lang: string): Searcher | undefined {
  const key = env.PIXABAY_API_KEY?.trim();
  if (!key) return undefined;
  return {
    name: "pixabay",
    async search(query) {
      const u = new URL("https://pixabay.com/api/");
      u.searchParams.set("key", key);
      u.searchParams.set("q", query.slice(0, 100));
      u.searchParams.set("image_type", "photo");
      u.searchParams.set("orientation", orientation === "vertical" ? "vertical" : "horizontal");
      u.searchParams.set("safesearch", "true");
      u.searchParams.set("per_page", "30");
      if (lang === "fr") u.searchParams.set("lang", "fr");
      const body = (await getJson(fetchImpl, u.toString())) as { hits?: { id: number | string; pageURL: string; user?: string; largeImageURL?: string }[] };
      return (body.hits ?? []).filter((h) => h.largeImageURL).map((h) => ({ key: `pixabay:${h.id}`, url: h.largeImageURL!, credit: { provider: "pixabay" as const, author: h.user ?? "Pixabay", url: h.pageURL } }));
    },
  };
}

export type SceneImagesOptions = {
  film: FilmScript;
  sceneIndex: number;
  dir: string;
  frame: Frame;
  orientation: Orientation;
  env: Env;
  fetchImpl?: typeof fetch;
  session: VisualSession;
  generator?: ImageGenerator;
  prepare?: (src: string, dst: string) => Promise<void>;
  card?: (dst: string, seed: number) => Promise<void>;
  signal?: AbortSignal;
  log?: (text: string) => void;
};

const pad = (n: number) => String(n).padStart(2, "0");
type Saved = { images: (Omit<ShotImage, "path"> & { path: string })[]; credits: BrollCredit[] };

export async function sceneImages(o: SceneImagesOptions): Promise<{ images: ShotImage[]; credits: BrollCredit[] }> {
  const scene = o.film.scenes[o.sceneIndex];
  const imgDir = join(o.dir, "images");
  mkdirSync(imgDir, { recursive: true });
  const savedPath = join(imgDir, `scene-${pad(o.sceneIndex)}.json`);
  if (existsSync(savedPath)) {
    try {
      const saved = JSON.parse(readFileSync(savedPath, "utf8")) as Saved;
      const images = saved.images.map((i) => ({ ...i, path: join(o.dir, i.path) }));
      if (images.length === scene.shots.length && images.every((i) => existsSync(i.path))) return { images, credits: saved.credits };
    } catch {
      // reprise abîmée : on refait la scène
    }
  }

  const fetchImpl = o.fetchImpl ?? fetch;
  const prepare = o.prepare ?? (async (src: string, dst: string) => runFfmpeg(prepareImageArgs(src, dst, o.frame), { signal: o.signal }));
  const card = o.card ?? (async (dst: string, seed: number) => runFfmpeg(cardImageArgs(dst, o.frame, seed), { signal: o.signal }));
  const log = o.log ?? ((t: string) => console.error(`[film] ${t}`));
  const searchers = [pexelsPhotos(o.env, fetchImpl, o.orientation, o.film.lang), pixabayPhotos(o.env, fetchImpl, o.orientation, o.film.lang)].filter((s): s is Searcher => !!s);

  const out: (ShotImage | undefined)[] = scene.shots.map(() => undefined);
  const rawOf = (k: number) => join(imgDir, `${pad(o.sceneIndex)}-${pad(k)}.raw`);
  const finalOf = (k: number) => join(imgDir, `${pad(o.sceneIndex)}-${pad(k)}.jpg`);

  async function finish(k: number, bytes: Uint8Array, source: ShotImage["source"], credit?: BrollCredit): Promise<void> {
    writeFileSync(rawOf(k), bytes);
    try {
      await prepare(rawOf(k), finalOf(k));
    } finally {
      rmSync(rawOf(k), { force: true });
    }
    out[k] = { path: finalOf(k), source, ...(credit ? { credit } : {}) };
  }

  // 1. ComfyUI dessine chaque plan (si branché et prêt).
  const todo: number[] = [];
  const generator = o.generator;
  const genOk = generator ? (o.session.generatorReady ??= await generator.ready().catch(() => false)) : false;
  for (const k of scene.shots.keys()) {
    if (generator && genOk) {
      try {
        await finish(k, await generator.generate(shotPrompt(o.film, scene, scene.shots[k]), o.sceneIndex * 1000 + k + 1), "comfyui");
        continue;
      } catch (error) {
        if (o.signal?.aborted) throw error;
        log(`image ${o.sceneIndex + 1}.${k + 1} : ComfyUI a échoué (${(error as Error).message}), photo libre pour ce plan.`);
      }
    }
    todo.push(k);
  }

  // 2. Photos libres : une recherche par description, des photos jamais déjà prises.
  const queryOf = (k: number) => scene.shots[k].visual || scene.location || scene.title;
  const pool = new Map<string, Candidate[]>();
  const origin = new Map<string, "pexels" | "pixabay">();
  async function searchFor(query: string): Promise<Candidate[]> {
    if (pool.has(query)) return pool.get(query)!;
    for (const s of searchers) {
      if (o.session.exhausted.has(s.name)) continue;
      try {
        const list = (await s.search(query)).filter((c) => !o.session.used.has(c.key));
        if (list.length) {
          list.forEach((c) => origin.set(c.key, s.name));
          pool.set(query, list);
          return list;
        }
      } catch (error) {
        if ((error as { limited?: boolean }).limited) {
          o.session.exhausted.add(s.name);
          log(`${s.name} : limite atteinte, on passe à la source suivante.`);
        } else log(`${s.name} : ${(error as Error).message}`);
      }
    }
    pool.set(query, []);
    return [];
  }
  async function fetchWithFallbackQueries(k: number): Promise<Candidate[]> {
    const tries = [queryOf(k), scene.location, MOOD_QUERY[scene.mood]].filter((q, i, a): q is string => !!q && a.indexOf(q) === i);
    for (const q of tries) {
      const list = await searchFor(q);
      if (list.some((c) => !o.session.used.has(c.key))) return list;
    }
    return [];
  }

  if (searchers.length) {
    // Passe 1 : chaque plan prend dans sa propre recherche. Passe 2 : les restes de la scène.
    const lists = new Map<number, Candidate[]>();
    for (const k of todo) lists.set(k, await fetchWithFallbackQueries(k));
    const wanted: Record<number, Candidate | undefined> = {};
    for (const k of todo) {
      const c = lists.get(k)!.find((x) => !o.session.used.has(x.key));
      if (c) {
        o.session.used.add(c.key);
        wanted[k] = c;
      }
    }
    for (const k of todo) {
      if (wanted[k]) continue;
      const rest = [...pool.values()].flat().find((x) => !o.session.used.has(x.key));
      if (rest) {
        o.session.used.add(rest.key);
        wanted[k] = rest;
      }
    }
    for (const k of todo) {
      const c = wanted[k];
      if (!c) continue;
      try {
        const res = await fetchImpl(c.url, { signal: AbortSignal.timeout(60_000) });
        if (!res.ok) throw new Error(`${new URL(c.url).host} ${res.status}`);
        await finish(k, new Uint8Array(await res.arrayBuffer()), origin.get(c.key) ?? "pexels", c.credit);
      } catch (error) {
        if (o.signal?.aborted) throw error;
        log(`téléchargement du plan ${o.sceneIndex + 1}.${k + 1} : ${(error as Error).message}`);
      }
    }
  }

  // 3. Les plans sans image reprennent une image de la scène (autre mouvement) ; sans aucune, une carte de cinéma.
  const have = () => out.filter((i): i is ShotImage => !!i && i.source !== "procedural");
  for (const k of scene.shots.keys()) {
    if (out[k]) continue;
    const pick = have()[k % Math.max(1, have().length)];
    if (pick) out[k] = pick;
  }
  for (const k of scene.shots.keys()) {
    if (out[k]) continue;
    await card(finalOf(k), o.sceneIndex * 7 + k);
    out[k] = { path: finalOf(k), source: "procedural" };
  }

  const images = out as ShotImage[];
  const credits = [...new Map(images.filter((i) => i.credit).map((i) => [i.credit!.url, i.credit!])).values()];
  const saved: Saved = { images: images.map((i) => ({ ...i, path: relative(o.dir, i.path) })), credits };
  writeJsonAtomic(savedPath, saved);
  return { images, credits };
}
