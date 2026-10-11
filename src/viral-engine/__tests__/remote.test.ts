import { describe, expect, it } from "vitest";
import { callFactory } from "../remote";

const fake = (routes: Record<string, () => Response>) =>
  (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const key = `${init?.method ?? "GET"} ${url.pathname}`;
    const handler = routes[key];
    if (!handler) throw new Error("ECONNREFUSED");
    return handler();
  }) as typeof fetch;

describe("callFactory : parler à l'usine qui tourne", () => {
  it("usine absente : jamais d'exception, une raison claire", async () => {
    const r = await callFactory({ SEPTIM_PORT: "4321" }, "POST", "/api/v1/videos", {}, fake({}));
    expect(r).toMatchObject({ ok: false, reason: "absent" });
  });

  it("envoie le token en en-tête et le corps en JSON ; rend la réponse", async () => {
    let seen: { auth?: string; body?: string } = {};
    const f = (async (input: string | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      if (path === "/api/v1/health") return Response.json({ ok: true });
      seen = { auth: (init?.headers as Record<string, string>).Authorization, body: String(init?.body) };
      return Response.json({ id: "t1" }, { status: 202 });
    }) as typeof fetch;
    const r = await callFactory({ SEPTIM_TOKEN: "abc" }, "POST", "/api/v1/videos", { topic: "x" }, f);
    expect(r).toEqual({ ok: true, json: { id: "t1" } });
    expect(seen).toEqual({ auth: "Bearer abc", body: '{"topic":"x"}' });
  });

  it("refus du serveur : le message du serveur remonte ; token faux → refused", async () => {
    const f = fake({
      "GET /api/v1/health": () => Response.json({ ok: true }),
      "POST /api/v1/videos": () => Response.json({ error: { code: "bad_request", message: "Genre inconnu" } }, { status: 400 }),
      "POST /api/v1/tasks/x/cancel": () => Response.json({ error: { message: "non" } }, { status: 401 }),
    });
    expect(await callFactory({}, "POST", "/api/v1/videos", {}, f)).toMatchObject({ ok: false, reason: "error", message: "Genre inconnu" });
    expect(await callFactory({}, "POST", "/api/v1/tasks/x/cancel", undefined, f)).toMatchObject({ ok: false, reason: "refused" });
  });
});
