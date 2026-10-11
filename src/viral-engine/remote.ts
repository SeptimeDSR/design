import type { Env } from "./config";

// Un film dure des heures : s'il y a déjà une usine qui tourne (Studio, `septim start`, Docker), c'est elle qui le fabrique
// et le terminal peut se fermer. L'usine locale est jointe avec le même token que le Studio.
export type RemoteResult = { ok: true; json: unknown } | { ok: false; reason: "absent" | "refused" | "error"; message: string };

const base = (env: Env) => `http://127.0.0.1:${env.SEPTIM_PORT || 4321}`;

export async function callFactory(env: Env, method: "GET" | "POST", path: string, body?: unknown, fetchImpl: typeof fetch = fetch): Promise<RemoteResult> {
  const token = env.SEPTIM_TOKEN?.trim();
  try {
    const health = await fetchImpl(`${base(env)}/api/v1/health`, { signal: AbortSignal.timeout(1500) });
    if (!health.ok) return { ok: false, reason: "absent", message: "Aucune usine ne répond." };
  } catch {
    return { ok: false, reason: "absent", message: "Aucune usine ne tourne (septim start ou docker compose up -d)." };
  }
  try {
    const res = await fetchImpl(`${base(env)}${path}`, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    if (res.ok) return { ok: true, json };
    return { ok: false, reason: res.status === 401 ? "refused" : "error", message: json.error?.message ?? `Erreur ${res.status}` };
  } catch (error) {
    return { ok: false, reason: "error", message: (error as Error).message };
  }
}
