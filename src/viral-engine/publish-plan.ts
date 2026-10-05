import type { ViralScript } from "./types";

export type PublishMode = "manual" | "postiz-cloud" | "postiz-self";
export type Platform = "tiktok" | "youtube" | "instagram" | "facebook";
export const PLATFORMS: Platform[] = ["tiktok", "youtube", "instagram", "facebook"];

const MODES: PublishMode[] = ["manual", "postiz-cloud", "postiz-self"];

export function resolvePublishMode(env: Record<string, string | undefined>, hasPostizCredentials: boolean): PublishMode {
  const forced = env.VIRAL_PUBLISH_MODE as PublishMode | undefined;
  if (forced && MODES.includes(forced)) return forced;
  if (!env.POSTIZ_API_KEY && !hasPostizCredentials) return "manual";
  const url = env.POSTIZ_API_URL;
  return url && !/postiz\.com/i.test(url) ? "postiz-self" : "postiz-cloud";
}

// Postiz cloud a des apps approuvées (publication publique). En auto-hébergé, les apps non auditées
// de TikTok et YouTube forcent le privé : on le dit au lieu de faire semblant.
export function postizSettings(
  platform: Platform,
  mode: PublishMode,
  script: ViralScript,
  tiktokMethod: "DIRECT_POST" | "UPLOAD" = "DIRECT_POST",
): Record<string, unknown> {
  const audited = mode === "postiz-cloud";
  switch (platform) {
    case "tiktok":
      return {
        privacy_level: audited ? "PUBLIC_TO_EVERYONE" : "SELF_ONLY",
        content_posting_method: tiktokMethod,
        duet: true,
        stitch: true,
      };
    case "youtube":
      return { title: script.hook.slice(0, 100), type: audited ? "public" : "private" };
    case "instagram":
      return { post_type: "post" };
    case "facebook":
      return {};
  }
}
