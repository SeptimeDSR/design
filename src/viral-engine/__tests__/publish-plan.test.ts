import { describe, expect, it } from "vitest";
import { postizSettings, resolvePublishMode } from "../publish-plan";
import { fallbackScript } from "../heat";

const script = fallbackScript({ topic: "le café", lang: "fr", formula: "secret", template: "story" });

describe("resolvePublishMode", () => {
  it("manuel sans Postiz", () => expect(resolvePublishMode({}, false)).toBe("manual"));
  it("cloud avec une clé API", () => expect(resolvePublishMode({ POSTIZ_API_KEY: "k" }, false)).toBe("postiz-cloud"));
  it("cloud avec des identifiants OAuth", () => expect(resolvePublishMode({}, true)).toBe("postiz-cloud"));
  it("auto-hébergé avec une URL perso", () =>
    expect(resolvePublishMode({ POSTIZ_API_KEY: "k", POSTIZ_API_URL: "https://moi.local" }, false)).toBe("postiz-self"));
  it("forçable par VIRAL_PUBLISH_MODE", () =>
    expect(resolvePublishMode({ POSTIZ_API_KEY: "k", VIRAL_PUBLISH_MODE: "manual" }, false)).toBe("manual"));
});

describe("postizSettings", () => {
  it("TikTok public en cloud, privé en auto-hébergé", () => {
    expect(postizSettings("tiktok", "postiz-cloud", script)).toMatchObject({ privacy_level: "PUBLIC_TO_EVERYONE", content_posting_method: "DIRECT_POST" });
    expect(postizSettings("tiktok", "postiz-self", script)).toMatchObject({ privacy_level: "SELF_ONLY" });
  });

  it("TikTok en brouillon pour ajouter le son tendance", () => {
    expect(postizSettings("tiktok", "postiz-cloud", script, "UPLOAD")).toMatchObject({ content_posting_method: "UPLOAD" });
  });

  it("YouTube : titre = hook, public en cloud, privé en auto-hébergé", () => {
    expect(postizSettings("youtube", "postiz-cloud", script)).toMatchObject({ title: script.hook, type: "public" });
    expect(postizSettings("youtube", "postiz-self", script)).toMatchObject({ type: "private" });
  });

  it("Instagram en post vidéo (Reel)", () => {
    expect(postizSettings("instagram", "postiz-cloud", script)).toEqual({ post_type: "post" });
  });
});
