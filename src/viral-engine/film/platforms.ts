import type { Platform } from "../publish-plan";

// Durées maximales acceptées par chaque plateforme (en secondes) : un film d'une heure va sur YouTube et Facebook,
// pas sur TikTok ni en Reels. On filtre au lieu de laisser Postiz échouer.
const MAX_SECONDS: Record<Platform, number> = { tiktok: 600, instagram: 180, youtube: 12 * 3600, facebook: 4 * 3600 };

export const platformsForDuration = (seconds: number, platforms: Platform[]): Platform[] => platforms.filter((p) => seconds <= MAX_SECONDS[p]);
