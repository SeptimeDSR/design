import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { attachWebhooks, deliverWebhook, flushWebhooks, signBody, webhookPayload } from "../webhooks";
import type { EventPayload, FactoryEvent, VideoDetail } from "../factory";

const video = { id: "5f8a4d25", ref: "5f8a", status: "notified", hook: "Tu es le dernier ?", topic: "la tontine", template: "maths", lang: "fr", durationMs: 34000, voice: "piper", source: "claude", createdAt: "2026-10-05T12:00:00Z", hasVideo: true, caption: "Légende", hashtags: ["#tontine"], script: {} as never, videoPath: "/home/me/septim/.septim-viral/jobs/5f8a4d25/video.mp4", publishMode: "manual" } as VideoDetail;

function fakeFetch(statuses: number[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const status = statuses[Math.min(calls.length - 1, statuses.length - 1)];
    if (status === 0) throw new Error("réseau coupé");
    return new Response("", { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("webhooks", () => {
  it("signBody est vérifiable avec crypto.createHmac côté récepteur", () => {
    const body = JSON.stringify({ a: 1 });
    expect(signBody(body, "s3cret")).toBe(`sha256=${createHmac("sha256", "s3cret").update(body).digest("hex")}`);
  });

  it("deliverWebhook envoie X-Septim-Event, X-Septim-Delivery (uuid), X-Septim-Signature et Content-Type JSON", async () => {
    const f = fakeFetch([200]);
    const r = await deliverWebhook("https://hook.example/n8n", "video.ready", { x: 1 }, { secret: "s3cret", fetchImpl: f.impl, retryDelaysMs: [0, 0] });
    expect(r).toEqual({ ok: true, attempts: 1 });
    const headers = f.calls[0].init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["X-Septim-Event"]).toBe("video.ready");
    expect(headers["X-Septim-Delivery"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(headers["X-Septim-Signature"]).toBe(signBody(f.calls[0].init.body as string, "s3cret"));
  });

  it("500 puis 200 → 2 essais, ok", async () => {
    const f = fakeFetch([500, 200]);
    expect(await deliverWebhook("https://hook.example", "video.ready", {}, { fetchImpl: f.impl, retryDelaysMs: [0, 0] })).toEqual({ ok: true, attempts: 2 });
  });

  it("3 échecs → ok false, ne lève jamais", async () => {
    const f = fakeFetch([0, 500, 503]);
    expect(await deliverWebhook("https://hook.example", "video.ready", {}, { fetchImpl: f.impl, retryDelaysMs: [0, 0] })).toEqual({ ok: false, attempts: 3 });
  });

  it("payload : videoUrl seulement si SEPTIM_PUBLIC_URL, sans chemin disque", () => {
    const without = webhookPayload("video.ready", { video });
    expect(JSON.stringify(without)).not.toContain("/home/me");
    expect(without.video?.videoUrl).toBeUndefined();
    const withUrl = webhookPayload("video.ready", { video }, "https://usine.example/");
    expect(withUrl.video?.videoUrl).toBe("https://usine.example/api/v1/videos/5f8a4d25/video");
    expect(withUrl).toMatchObject({ event: "video.ready", video: { ref: "5f8a", hook: "Tu es le dernier ?", caption: "Légende" } });
  });

  it("échec sans vidéo : la tâche et l'erreur sont transmises", () => {
    const p = webhookPayload("video.failed", { task: { id: "t1", status: "failed" } as never, error: "Chrome introuvable" });
    expect(p).toMatchObject({ event: "video.failed", task: { id: "t1", status: "failed" }, error: "Chrome introuvable" });
  });

  it("attachWebhooks sans URL ne s'abonne pas ; avec URL, chaque événement part", async () => {
    const subscribed: FactoryEvent[] = [];
    const handlers = new Map<FactoryEvent, (p: EventPayload) => void>();
    const factory = { on: (e: FactoryEvent, h: (p: EventPayload) => void) => (subscribed.push(e), handlers.set(e, h), () => undefined) };
    attachWebhooks(factory, {});
    expect(subscribed).toEqual([]);
    const f = fakeFetch([200]);
    attachWebhooks(factory, { VIRAL_WEBHOOK_URL: "https://hook.example", VIRAL_WEBHOOK_SECRET: "k" }, f.impl);
    expect(subscribed.sort()).toEqual(["video.failed", "video.published", "video.ready", "video.rejected"]);
    handlers.get("video.published")!({ video });
    await new Promise((r) => setTimeout(r, 10));
    expect(f.calls).toHaveLength(1);
    expect(JSON.parse(f.calls[0].init.body as string).event).toBe("video.published");
  });

  it("flushWebhooks attend les livraisons en cours (une commande courte ne quitte pas avant d'avoir prévenu)", async () => {
    const handlers = new Map<FactoryEvent, (p: EventPayload) => void>();
    const factory = { on: (e: FactoryEvent, h: (p: EventPayload) => void) => (handlers.set(e, h), () => undefined) };
    let delivered = false;
    const slow = (async () => {
      await new Promise((r) => setTimeout(r, 80));
      delivered = true;
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    attachWebhooks(factory, { VIRAL_WEBHOOK_URL: "https://hook.example" }, slow);
    handlers.get("video.rejected")!({ video });
    expect(delivered).toBe(false);
    await flushWebhooks();
    expect(delivered).toBe(true);
    await flushWebhooks();
  });
});
