import { describe, expect, it } from "vitest";
import { parseViews, publishJob } from "../publish";
import { fallbackScript } from "../heat";
import { buildTimeline } from "../story";
import type { Job } from "../store";

const script = fallbackScript({ topic: "la tontine", lang: "fr", formula: "secret", template: "story" });
const job: Job = {
  id: "a1b2c3d4", createdAt: "2026-10-05T10:00:00.000Z", status: "notified", request: {}, script,
  timeline: buildTimeline(script), arm: "story:secret", source: "ollama", ttsEngine: "piper", jobDir: "/tmp/j", videoPath: "/tmp/j/video.mp4",
};

const INTEGRATIONS = JSON.stringify([
  { id: "tt1", identifier: "tiktok", name: "TikTok", disabled: false },
  { id: "yt1", identifier: "youtube", name: "YouTube", disabled: false },
  { id: "ig1", identifier: "instagram-standalone", name: "Insta", disabled: false },
]);

function fakePostiz(calls: string[][]) {
  return async (args: string[]) => {
    calls.push(args);
    if (args[0] === "integrations:list") return INTEGRATIONS;
    if (args[0] === "upload") return JSON.stringify({ path: "https://cdn.postiz.com/v.mp4" });
    if (args[0] === "posts:create") return JSON.stringify([{ postId: `p-${args[args.indexOf("-i") + 1]}` }]);
    return "";
  };
}

describe("publishJob", () => {
  it("manuel : ne touche à rien et rend la légende à coller", async () => {
    const calls: string[][] = [];
    const r = await publishJob(job, "manual", ["tiktok"], "DIRECT_POST", fakePostiz(calls));
    expect(calls).toEqual([]);
    expect(r.manualText).toContain(script.caption);
  });

  it("Postiz : upload d'abord, puis un post par plateforme connectée", async () => {
    const calls: string[][] = [];
    const r = await publishJob(job, "postiz-cloud", ["tiktok", "youtube", "instagram", "facebook"], "DIRECT_POST", fakePostiz(calls));
    expect(calls[1]).toEqual(["upload", "/tmp/j/video.mp4"]);
    const creates = calls.filter((c) => c[0] === "posts:create");
    expect(creates).toHaveLength(3);
    const tiktok = creates.find((c) => c.includes("tt1"))!;
    expect(tiktok[tiktok.indexOf("-m") + 1]).toBe("https://cdn.postiz.com/v.mp4");
    expect(JSON.parse(tiktok[tiktok.indexOf("--settings") + 1])).toMatchObject({ privacy_level: "PUBLIC_TO_EVERYONE" });
    expect(r.posted).toEqual({ tiktok: ["p-tt1"], youtube: ["p-yt1"], instagram: ["p-ig1"] });
    expect(r.missing).toEqual(["facebook"]);
    expect(r.failed).toEqual([]);
  });

  it("échec partiel : les plateformes passées sont gardées, l'échec est signalé, rien ne lève", async () => {
    const calls: string[][] = [];
    const base = fakePostiz(calls);
    const failing = async (args: string[]) => {
      if (args[0] === "posts:create" && args.includes("yt1")) throw new Error("quota YouTube");
      return base(args);
    };
    const r = await publishJob(job, "postiz-cloud", ["tiktok", "youtube", "instagram"], "DIRECT_POST", failing);
    expect(r.posted).toEqual({ tiktok: ["p-tt1"], instagram: ["p-ig1"] });
    expect(r.failed).toEqual([{ platform: "youtube", error: "quota YouTube" }]);
  });

  it("relance : ne reposte jamais une plateforme déjà publiée", async () => {
    const calls: string[][] = [];
    const retry = { ...job, posted: { tiktok: ["p-tt1"], instagram: ["p-ig1"] } };
    const r = await publishJob(retry, "postiz-cloud", ["tiktok", "youtube", "instagram"], "DIRECT_POST", fakePostiz(calls));
    const creates = calls.filter((c) => c[0] === "posts:create");
    expect(creates.map((c) => c[c.indexOf("-i") + 1])).toEqual(["yt1"]);
    expect(r.posted).toEqual({ tiktok: ["p-tt1"], instagram: ["p-ig1"], youtube: ["p-yt1"] });
  });

  it("tout déjà publié : aucun appel Postiz", async () => {
    const calls: string[][] = [];
    await publishJob({ ...job, posted: { tiktok: ["a"] } }, "postiz-cloud", ["tiktok"], "DIRECT_POST", fakePostiz(calls));
    expect(calls.filter((c) => c[0] !== "integrations:list")).toEqual([]);
  });
});

describe("parseViews", () => {
  it("lit les vues dans les analytics Postiz", () => {
    const json = JSON.stringify([
      { label: "Likes", data: [{ total: 9, date: "d" }] },
      { label: "Views", data: [{ total: 120, date: "d1" }, { total: 80, date: "d2" }] },
    ]);
    expect(parseViews(json)).toBe(200);
  });

  it("null si l'analytics est manquante", () => {
    expect(parseViews(JSON.stringify({ missing: true }))).toBeNull();
    expect(parseViews("pas du json")).toBeNull();
  });
});
