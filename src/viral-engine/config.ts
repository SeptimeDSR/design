import { resolve } from "node:path";
import type { Platform } from "./publish-plan";
import type { Lang } from "./types";

export type Env = Record<string, string | undefined>;

export type ViralConfig = {
  home: string;
  lang: Lang;
  regions: string[];
  platforms: Platform[];
  ollama: { host: string; model: string; timeoutMs: number };
  tts: string;
  youtubeApiKey?: string;
  apify?: { token: string; actor: string; input: Record<string, unknown> };
  notifier: "whatsapp" | "console";
  whatsappTo?: string;
  tiktokMethod: "DIRECT_POST" | "UPLOAD";
  cron: string;
};

const list = (v: string | undefined, fallback: string[]) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : fallback);

export function loadConfig(env: Env = process.env): ViralConfig {
  return {
    home: resolve(env.VIRAL_HOME ?? ".septim-viral"),
    lang: env.VIRAL_LANG === "en" ? "en" : "fr",
    // Google Trends n'a pas de flux pour le Cameroun : FR + pays voisins francophones, YouTube couvre CM.
    regions: list(env.VIRAL_REGIONS, ["CM", "FR", "CI", "SN"]),
    platforms: list(env.VIRAL_PLATFORMS, ["tiktok", "youtube", "instagram", "facebook"]) as Platform[],
    ollama: {
      host: env.OLLAMA_HOST ?? "http://127.0.0.1:11434",
      model: env.VIRAL_OLLAMA_MODEL ?? "qwen2.5:7b",
      timeoutMs: Number(env.VIRAL_OLLAMA_TIMEOUT_MS ?? 120_000),
    },
    tts: env.VIRAL_TTS ?? "auto",
    youtubeApiKey: env.YOUTUBE_API_KEY,
    apify: env.APIFY_TOKEN
      ? {
          token: env.APIFY_TOKEN,
          actor: env.VIRAL_APIFY_ACTOR ?? "eunit/tiktok-trends-scraper",
          input: env.VIRAL_APIFY_INPUT ? JSON.parse(env.VIRAL_APIFY_INPUT) : {},
        }
      : undefined,
    notifier: env.VIRAL_NOTIFIER === "console" ? "console" : "whatsapp",
    whatsappTo: env.VIRAL_WHATSAPP_TO,
    tiktokMethod: env.VIRAL_TIKTOK_METHOD === "UPLOAD" ? "UPLOAD" : "DIRECT_POST",
    cron: env.VIRAL_CRON ?? "0 */6 * * *",
  };
}
