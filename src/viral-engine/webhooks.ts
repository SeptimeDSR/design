import { createHmac, randomUUID } from "node:crypto";
import type { Env } from "./config";
import type { EventPayload, FactoryEvent } from "./factory";

const EVENTS: FactoryEvent[] = ["video.ready", "video.failed", "video.published", "video.rejected"];

// Le récepteur recalcule HMAC-SHA256(corps brut, secret) et compare : un faux appel est rejeté.
export const signBody = (body: string, secret: string): string => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

// Jamais de chemin disque dans un webhook : seulement une URL publique, si l'usine en a une.
export function webhookPayload(event: FactoryEvent, p: EventPayload, publicUrl?: string) {
  const v = p.video;
  const base = publicUrl?.replace(/\/+$/, "");
  return {
    event,
    at: new Date().toISOString(),
    video: v
      ? {
          id: v.id,
          ref: v.ref,
          status: v.status,
          hook: v.hook,
          topic: v.topic,
          template: v.template,
          durationMs: v.durationMs,
          caption: v.caption,
          hashtags: v.hashtags,
          videoUrl: base && v.hasVideo ? `${base}/api/v1/videos/${v.id}/video` : undefined,
        }
      : undefined,
    task: p.task ? { id: p.task.id, kind: p.task.kind, status: p.task.status, ref: p.task.ref } : undefined,
    error: p.error,
  };
}

export async function deliverWebhook(
  url: string,
  event: string,
  payload: unknown,
  opts: { secret?: string; fetchImpl?: typeof fetch; retryDelaysMs?: number[] } = {},
): Promise<{ ok: boolean; attempts: number }> {
  const body = JSON.stringify(payload);
  const delays = opts.retryDelaysMs ?? [1000, 5000];
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-Septim-Event": event, "X-Septim-Delivery": randomUUID() };
  if (opts.secret) headers["X-Septim-Signature"] = signBody(body, opts.secret);
  const doFetch = opts.fetchImpl ?? fetch;
  for (let attempt = 1; attempt <= delays.length + 1; attempt++) {
    try {
      const res = await doFetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(10_000) });
      if (res.ok) return { ok: true, attempts: attempt };
    } catch {
      // réseau coupé ou délai dépassé : on réessaie
    }
    if (attempt <= delays.length) await new Promise((r) => setTimeout(r, delays[attempt - 1]));
  }
  console.error(`[webhook] ${event} non livré à ${url} après ${delays.length + 1} essais.`);
  return { ok: false, attempts: delays.length + 1 };
}

// Branche les événements de l'usine sur VIRAL_WEBHOOK_URL (n8n, Make, Zapier, Slack…). Sans URL : rien.
export function attachWebhooks(
  factory: { on: (e: FactoryEvent, h: (p: EventPayload) => void) => () => void },
  env: Env = process.env,
  fetchImpl?: typeof fetch,
): () => void {
  const url = env.VIRAL_WEBHOOK_URL?.trim();
  if (!url) return () => undefined;
  const offs = EVENTS.map((event) =>
    factory.on(event, (p) => void deliverWebhook(url, event, webhookPayload(event, p, env.SEPTIM_PUBLIC_URL), { secret: env.VIRAL_WEBHOOK_SECRET, fetchImpl })),
  );
  return () => offs.forEach((off) => off());
}
