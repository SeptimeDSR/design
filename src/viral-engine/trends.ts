import type { ViralConfig } from "./config";

export type Trend = { title: string; source: "youtube" | "google" | "tiktok" | "fallback"; region?: string; sound?: string; score: number };

// Sujets qui marchent toujours : le cycle ne s'arrête jamais faute de réseau.
export const EVERGREEN_TOPICS = [
  "le mobile money",
  "la tontine",
  "le prix de ton forfait internet",
  "la reine Njinga",
  "le sommeil",
  "l'argent que tu perds sans le voir",
  "les maths du marché",
  "le cerveau et le scroll",
];

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

const toNumber = (s: unknown) => Number(String(s ?? "").replace(/[^\d]/g, "")) || 0;

function normalize(trends: Trend[]): Trend[] {
  const max = Math.max(1, ...trends.map((t) => t.score));
  return trends.map((t) => ({ ...t, score: t.score / max }));
}

export function parseGoogleTrendsRss(xml: string, region: string): Trend[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  return normalize(
    items
      .map((item) => ({
        title: decode(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ""),
        source: "google" as const,
        region,
        score: toNumber(item.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/)?.[1]),
      }))
      .filter((t) => t.title),
  );
}

export function parseYouTubePopular(json: unknown, region: string): Trend[] {
  const items = (json as { items?: unknown[] })?.items;
  if (!Array.isArray(items)) return [];
  return normalize(
    items
      .map((it) => {
        const v = it as { snippet?: { title?: string }; statistics?: { viewCount?: string } };
        return { title: v.snippet?.title ?? "", source: "youtube" as const, region, score: toNumber(v.statistics?.viewCount) };
      })
      .filter((t) => t.title),
  );
}

export function parseApifyTikTok(items: unknown[]): Trend[] {
  const out: Trend[] = [];
  items.forEach((raw, i) => {
    if (!raw || typeof raw !== "object") return;
    const it = raw as Record<string, unknown>;
    const sound = (it.songName ?? it.musicName ?? it.song) as string | undefined;
    const title = (it.hashtag ?? it.hashtagName ?? it.title ?? it.name ?? sound) as string | undefined;
    if (!title) return;
    const rank = toNumber(it.rank) || i + 1;
    out.push({ title, source: "tiktok", sound, score: 1 / rank });
  });
  return out;
}

async function withTimeout<T>(fetchImpl: typeof fetch, url: string, init: RequestInit, read: (r: Response) => Promise<T>, timeoutMs: number): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return await read(res);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchTrends(cfg: ViralConfig, fetchImpl: typeof fetch = fetch): Promise<Trend[]> {
  const jobs: Promise<Trend[]>[] = [];
  for (const region of cfg.regions) {
    if (region !== "CM") {
      jobs.push(withTimeout(fetchImpl, `https://trends.google.com/trending/rss?geo=${region}`, {}, async (r) => parseGoogleTrendsRss(await r.text(), region), cfg.timeouts.default));
    }
    if (cfg.youtubeApiKey) {
      const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&maxResults=15&regionCode=${region}&key=${cfg.youtubeApiKey}`;
      jobs.push(withTimeout(fetchImpl, url, {}, async (r) => parseYouTubePopular(await r.json(), region), cfg.timeouts.default));
    }
  }
  if (cfg.apify) {
    // timeout côté Apify aligné sur le nôtre : la course ne continue pas (ni ne facture) après notre abandon.
    const seconds = Math.max(1, Math.floor(cfg.timeouts.apify / 1000) - 5);
    const url = `https://api.apify.com/v2/acts/${cfg.apify.actor.replace("/", "~")}/run-sync-get-dataset-items?token=${cfg.apify.token}&timeout=${seconds}`;
    jobs.push(
      withTimeout(fetchImpl, url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cfg.apify.input) }, async (r) =>
        parseApifyTikTok((await r.json()) as unknown[]),
        cfg.timeouts.apify,
      ),
    );
  }

  const settled = await Promise.allSettled(jobs);
  const trends = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
  if (trends.length) return trends.sort((a, b) => b.score - a.score);
  return EVERGREEN_TOPICS.map((title, i) => ({ title, source: "fallback" as const, score: 1 - i / EVERGREEN_TOPICS.length }));
}

const key = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").trim();

export function pickTrend(trends: Trend[], recentTitles: string[]): Trend {
  const recent = new Set(recentTitles.map(key));
  const sorted = [...trends].sort((a, b) => b.score - a.score);
  return sorted.find((t) => !recent.has(key(t.title))) ?? sorted[0] ?? { title: EVERGREEN_TOPICS[0], source: "fallback", score: 0 };
}
