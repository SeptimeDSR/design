import { describe, expect, it } from "vitest";
import { EVERGREEN_TOPICS, fetchTrends, parseApifyTikTok, parseGoogleTrendsRss, parseYouTubePopular, pickTrend } from "../trends";
import { loadConfig } from "../config";

const RSS = `<?xml version="1.0"?><rss xmlns:ht="https://trends.google.com/trending/rss"><channel>
<item><title>Lions Indomptables</title><ht:approx_traffic>50 000+</ht:approx_traffic></item>
<item><title><![CDATA[Prix du carburant]]></title><ht:approx_traffic>2 000+</ht:approx_traffic></item>
</channel></rss>`;

const YT = { items: [
  { snippet: { title: "Clip A" }, statistics: { viewCount: "1000" } },
  { snippet: { title: "Clip B" }, statistics: { viewCount: "500000" } },
] };

describe("parseurs de tendances", () => {
  it("Google Trends RSS : titres, CDATA, score selon le trafic", () => {
    const t = parseGoogleTrendsRss(RSS, "FR");
    expect(t.map((x) => x.title)).toEqual(["Lions Indomptables", "Prix du carburant"]);
    expect(t[0].score).toBeGreaterThan(t[1].score);
    expect(t[0]).toMatchObject({ source: "google", region: "FR" });
  });

  it("YouTube mostPopular : score selon les vues", () => {
    const t = parseYouTubePopular(YT, "CM");
    expect(t.find((x) => x.title === "Clip B")!.score).toBeGreaterThan(t.find((x) => x.title === "Clip A")!.score);
  });

  it("Apify TikTok : hashtags et sons", () => {
    const t = parseApifyTikTok([{ hashtag: "#tontine", rank: 1 }, { songName: "Coup du marteau", rank: 2 }]);
    expect(t[0].title).toBe("#tontine");
    expect(t[1].sound).toBe("Coup du marteau");
  });

  it("ignore les entrées illisibles", () => {
    expect(parseYouTubePopular({ nope: true }, "CM")).toEqual([]);
    expect(parseApifyTikTok([null, 3, {}])).toEqual([]);
  });
});

describe("fetchTrends", () => {
  it("sans réseau, retombe sur les sujets permanents", async () => {
    const failing = async () => {
      throw new Error("offline");
    };
    const t = await fetchTrends(loadConfig({}), failing as typeof fetch);
    expect(t.length).toBeGreaterThan(0);
    expect(t.every((x) => x.source === "fallback")).toBe(true);
  });
});

describe("pickTrend", () => {
  it("prend le meilleur score pas encore utilisé", () => {
    const trends = [
      { title: "A", source: "google" as const, score: 0.9 },
      { title: "B", source: "google" as const, score: 0.5 },
    ];
    expect(pickTrend(trends, ["a"]).title).toBe("B");
  });

  it("ne renvoie jamais rien d'indéfini", () => {
    expect(pickTrend([], []).title).toBe(EVERGREEN_TOPICS[0]);
  });
});
