import { readFileSync, rmSync } from "node:fs";
import { request } from "node:http";
import { createServer } from "node:net";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startServer } from "../server/http";
import { ROUTES } from "../server/routes";
import { openapi } from "../server/openapi";
import { fakeFactory, seedJob, VIDEO_BYTES } from "./fixtures/fake-factory";

const TONTINE = JSON.parse(readFileSync(join(__dirname, "fixtures", "tontine.json"), "utf8"));
const VERSION = JSON.parse(readFileSync("package.json", "utf8")).version;

const opened: { close(): Promise<void> }[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((s) => s.close()));
});

async function boot(o: { token?: string; corsOrigins?: string[]; ids?: string[]; mcp?: Parameters<typeof startServer>[0]["mcp"] } = {}) {
  const f = fakeFactory({}, o.ids);
  const srv = await startServer({ factory: f.factory, port: 0, token: o.token, corsOrigins: o.corsOrigins, mcp: o.mcp });
  opened.push(srv);
  const auth: Record<string, string> = o.token ? { Authorization: `Bearer ${o.token}` } : {};
  const get = (path: string, headers: Record<string, string> = {}) => fetch(srv.url + path, { headers: { ...auth, ...headers } });
  const post = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
    fetch(srv.url + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { ...f, srv, get, post };
}

// fetch normalise l'URL et refuse certains en-têtes (Host) : pour ces cas, une requête HTTP brute.
function raw(port: number, path: string, headers: Record<string, string> = {}, method = "GET", body?: string) {
  return new Promise<{ status: number; headers: Record<string, unknown>; body: string }>((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method, headers }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: data }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

describe("serveur : santé et fabrication", () => {
  it("GET /api/v1/health → 200 {ok:true, version} même avec token", async () => {
    const s = await boot({ token: "secret-123" });
    const res = await fetch(`${s.srv.url}/api/v1/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: VERSION });
  });

  it("POST /api/v1/videos {topic accentué} → 202, tâche queued, le sujet garde ses accents", async () => {
    const s = await boot();
    const res = await s.post("/api/v1/videos", { topic: "La tontine à Douala 🇨🇲" });
    expect(res.status).toBe(202);
    const task = (await res.json()) as { id: string; status: string };
    expect(task.status).toBe("queued");
    await s.factory.idle();
    const done = (await (await s.get(`/api/v1/tasks/${task.id}`)).json()) as { status: string; ref: string };
    expect(done.status).toBe("done");
    const video = (await (await s.get(`/api/v1/videos/${done.ref}`)).json()) as { topic: string };
    expect(video.topic).toBe("La tontine à Douala 🇨🇲");
  });

  it("POST /api/v1/videos sujet de 501 caractères → 400 bad_request", async () => {
    const s = await boot();
    const res = await s.post("/api/v1/videos", { topic: "a".repeat(501) });
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe("bad_request");
  });

  it("POST sans Content-Type JSON → 415 ; corps de plus de 1 Mo → 413 ; JSON invalide → 400", async () => {
    const s = await boot();
    const text = await fetch(`${s.srv.url}/api/v1/videos`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: '{"topic":"x"}' });
    expect(text.status).toBe(415);
    expect(await errorCode(text)).toBe("unsupported_media_type");
    const big = await s.post("/api/v1/videos", { topic: "x", pad: "a".repeat(1_100_000) });
    expect(big.status).toBe(413);
    expect(await errorCode(big)).toBe("payload_too_large");
    const broken = await fetch(`${s.srv.url}/api/v1/videos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"topic":' });
    expect(broken.status).toBe(400);
    expect(await errorCode(broken)).toBe("bad_request");
  });

  it("POST sans corps ni Content-Type (curl -X POST) → accepté comme {}", async () => {
    const s = await boot();
    seedJob(s.store, "5f8a4d25");
    const res = await fetch(`${s.srv.url}/api/v1/videos/5f8a/reject`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe("rejected");
  });
});

describe("serveur : garde-fous réseau", () => {
  it("Host: evil.example → 403 (DNS rebinding) ; Origin: https://evil.example → 403", async () => {
    const s = await boot();
    const rebinding = await raw(s.srv.port, "/api/v1/videos", { Host: `evil.example:${s.srv.port}` });
    expect(rebinding.status).toBe(403);
    expect(JSON.parse(rebinding.body).error.code).toBe("forbidden");
    const csrf = await s.post("/api/v1/videos", { topic: "x" }, { Origin: "https://evil.example" });
    expect(csrf.status).toBe(403);
    expect(await errorCode(csrf)).toBe("forbidden");
    expect(s.factory.listTasks()).toHaveLength(0);
  });

  it("Origin du serveur lui-même (le Studio) → accepté", async () => {
    const s = await boot();
    const res = await s.post("/api/v1/videos", { topic: "x" }, { Origin: s.srv.url });
    expect(res.status).toBe(202);
  });

  it("corsOrigins : origine permise → en-têtes CORS et pré-vol 204", async () => {
    const s = await boot({ corsOrigins: ["https://n8n.example"] });
    const pre = await fetch(`${s.srv.url}/api/v1/videos`, {
      method: "OPTIONS",
      headers: { Origin: "https://n8n.example", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,authorization" },
    });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe("https://n8n.example");
    expect(pre.headers.get("access-control-allow-headers")).toMatch(/authorization/i);
    const res = await s.get("/api/v1/videos", { Origin: "https://n8n.example" });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://n8n.example");
  });

  it("token défini : sans Authorization → 401 ; mauvais token → 401 ; avec Bearer → 200", async () => {
    const s = await boot({ token: "secret-123" });
    const none = await fetch(`${s.srv.url}/api/v1/videos`);
    expect(none.status).toBe(401);
    expect(await errorCode(none)).toBe("unauthorized");
    const wrong = await fetch(`${s.srv.url}/api/v1/videos`, { headers: { Authorization: "Bearer nope" } });
    expect(wrong.status).toBe(401);
    expect((await s.get("/api/v1/videos")).status).toBe(200);
  });

  it("token défini : le Studio (/) reste accessible sans token, et un autre Host est accepté (tunnel, Wi-Fi)", async () => {
    const s = await boot({ token: "secret-123" });
    expect((await fetch(`${s.srv.url}/`)).status).toBe(200);
    const lan = await raw(s.srv.port, "/api/v1/videos", { Host: `192.168.1.20:${s.srv.port}`, Authorization: "Bearer secret-123" });
    expect(lan.status).toBe(200);
  });

  it("startServer host 0.0.0.0 sans token → refuse de démarrer", async () => {
    const f = fakeFactory();
    await expect(startServer({ factory: f.factory, port: 0, host: "0.0.0.0" })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("port déjà pris → erreur claire qui propose --port", async () => {
    const blocker = createServer();
    await new Promise<void>((r) => blocker.listen(0, "127.0.0.1", r));
    const port = (blocker.address() as { port: number }).port;
    const f = fakeFactory();
    try {
      await expect(startServer({ factory: f.factory, port })).rejects.toThrow(/--port/);
    } finally {
      blocker.close();
    }
  });
});

describe("serveur : vidéos", () => {
  it("GET /api/v1/videos/:ref en 4 caractères, avec # encodé → 200 ; référence ambiguë → 409 avec details.matches", async () => {
    const s = await boot();
    seedJob(s.store, "5f8a4d25");
    seedJob(s.store, "ab12cdef");
    seedJob(s.store, "ab34cdef");
    const res = await s.get(`/api/v1/videos/${encodeURIComponent("#5F8A")}`);
    expect(res.status).toBe(200);
    const v = (await res.json()) as { ref: string; videoUrl: string };
    expect(v.ref).toBe("5f8a");
    expect(v.videoUrl).toBe("/api/v1/videos/5f8a4d25/video");
    const amb = await s.get("/api/v1/videos/ab");
    expect(amb.status).toBe(409);
    const body = (await amb.json()) as { error: { code: string; details: { matches: unknown[] } } };
    expect(body.error.code).toBe("ambiguous_ref");
    expect(body.error.details.matches).toHaveLength(2);
    expect((await s.get("/api/v1/videos/ffff")).status).toBe(404);
  });

  it("GET /api/v1/videos?status=&limit= → liste filtrée ; status inconnu ou limit hors bornes → 400", async () => {
    const s = await boot();
    seedJob(s.store, "5f8a4d25");
    seedJob(s.store, "1234abcd");
    s.store.saveJob({ ...s.store.getJob("1234abcd")!, status: "published" });
    const all = (await (await s.get("/api/v1/videos")).json()) as { videos: { id: string }[] };
    expect(all.videos).toHaveLength(2);
    const pub = (await (await s.get("/api/v1/videos?status=published&limit=5")).json()) as { videos: { id: string }[] };
    expect(pub.videos.map((v) => v.id)).toEqual(["1234abcd"]);
    expect((await s.get("/api/v1/videos?status=perdu")).status).toBe(400);
    expect((await s.get("/api/v1/videos?limit=101")).status).toBe(400);
    expect((await s.get("/api/v1/videos?limit=abc")).status).toBe(400);
  });

  it("POST /api/v1/videos/:ref/publish sans confirm → 428 ; avec « OUI #ref » → 200, une seule publication", async () => {
    const s = await boot();
    seedJob(s.store, "5f8a4d25");
    const none = await s.post("/api/v1/videos/5f8a/publish", {});
    expect(none.status).toBe(428);
    expect(await errorCode(none)).toBe("confirmation_required");
    const ok = await s.post("/api/v1/videos/5f8a/publish", { confirm: "OUI #5f8a" });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ref: "5f8a", status: "published", manualText: "légende prête" });
    const again = await s.post("/api/v1/videos/5f8a/publish", { confirm: "OUI #5f8a" });
    expect(again.status).toBe(409);
    expect(s.published).toEqual(["5f8a4d25"]);
  });

  it("POST /api/v1/videos/:ref/redo → 202 + tâche ; reject → statut rejected", async () => {
    const s = await boot({ ids: ["7777aaaa"] });
    seedJob(s.store, "5f8a4d25", { topic: "la tontine" });
    const redo = await s.post("/api/v1/videos/5f8a/redo");
    expect(redo.status).toBe(202);
    expect(((await redo.json()) as { kind: string }).kind).toBe("redo");
    await s.factory.idle();
    expect(s.store.getJob("5f8a4d25")!.status).toBe("rejected");
  });

  it("GET /api/v1/videos/:ref/video avec Range: bytes=0-99 → 206, Content-Length 100, video/mp4 ; sans Range → 200 ; mp4 supprimé → 404 JSON", async () => {
    const s = await boot();
    const job = seedJob(s.store, "5f8a4d25");
    const part = await s.get("/api/v1/videos/5f8a/video", { Range: "bytes=0-99" });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-length")).toBe("100");
    expect(part.headers.get("content-type")).toBe("video/mp4");
    expect(part.headers.get("content-range")).toBe(`bytes 0-99/${VIDEO_BYTES}`);
    expect((await part.arrayBuffer()).byteLength).toBe(100);
    const tail = await s.get("/api/v1/videos/5f8a/video", { Range: "bytes=-10" });
    expect(tail.status).toBe(206);
    expect(tail.headers.get("content-range")).toBe(`bytes ${VIDEO_BYTES - 10}-${VIDEO_BYTES - 1}/${VIDEO_BYTES}`);
    await tail.arrayBuffer();
    const full = await s.get("/api/v1/videos/5f8a/video");
    expect(full.status).toBe(200);
    expect(full.headers.get("accept-ranges")).toBe("bytes");
    expect((await full.arrayBuffer()).byteLength).toBe(VIDEO_BYTES);
    const out = await s.get("/api/v1/videos/5f8a/video", { Range: `bytes=${VIDEO_BYTES}-` });
    expect(out.status).toBe(416);
    expect(out.headers.get("content-range")).toBe(`bytes */${VIDEO_BYTES}`);
    rmSync(job.videoPath!);
    const gone = await s.get("/api/v1/videos/5f8a/video");
    expect(gone.status).toBe(404);
    expect(await errorCode(gone)).toBe("not_found");
  });

  it("token défini : la vidéo se lit aussi avec ?token= (une balise <video> ne peut pas envoyer d'en-tête)", async () => {
    const s = await boot({ token: "secret-123" });
    seedJob(s.store, "5f8a4d25");
    expect((await fetch(`${s.srv.url}/api/v1/videos/5f8a/video`)).status).toBe(401);
    const res = await fetch(`${s.srv.url}/api/v1/videos/5f8a/video?token=secret-123`);
    expect(res.status).toBe(200);
    await res.arrayBuffer();
    expect((await fetch(`${s.srv.url}/api/v1/videos?token=secret-123`)).status).toBe(401);
  });
});

describe("serveur : suivi, leçons, diagnostic, linter", () => {
  it("GET /api/v1/tasks/:id, /tasks, /lessons, /doctor (probe factice), POST /lint → formes attendues", async () => {
    const s = await boot();
    const task = (await (await s.post("/api/v1/videos", { topic: "la tontine" })).json()) as { id: string };
    await s.factory.idle();
    expect(await (await s.get(`/api/v1/tasks/${task.id}`)).json()).toMatchObject({ id: task.id, status: "done", ref: "5f8a" });
    expect((await s.get("/api/v1/tasks/inconnue")).status).toBe(404);
    const tasks = (await (await s.get("/api/v1/tasks")).json()) as { tasks: unknown[] };
    expect(tasks.tasks).toHaveLength(1);
    expect(await (await s.get("/api/v1/lessons")).json()).toEqual({ text: "", arms: [] });
    const doctor = (await (await s.get("/api/v1/doctor")).json()) as { voice: string; fixes: unknown[] };
    expect(doctor.voice).toBe("silent");
    expect(doctor.fixes.length).toBeGreaterThan(0);
    const good = (await (await s.post("/api/v1/lint", { script: TONTINE, template: "maths", topic: "la tontine" })).json()) as { ok: boolean };
    expect(good.ok).toBe(true);
    const bad = (await (await s.post("/api/v1/lint", { script: { hook: "x", beats: [], payoff: "" } })).json()) as { ok: boolean; issues: unknown[] };
    expect(bad.ok).toBe(false);
    expect(bad.issues.length).toBeGreaterThan(0);
    expect((await s.post("/api/v1/lint", { script: "pas un objet" })).status).toBe(400);
  });
});

describe("serveur : Studio, contrat, routes", () => {
  it("GET / → 200 text/html avec en-têtes de sécurité ; police servie ; pas de traversée de dossier", async () => {
    const s = await boot();
    const home = await fetch(`${s.srv.url}/`);
    expect(home.status).toBe(200);
    expect(home.headers.get("content-type")).toMatch(/^text\/html/);
    expect(home.headers.get("x-frame-options")).toBe("DENY");
    expect(home.headers.get("content-security-policy")).toMatch(/frame-ancestors 'none'/);
    const font = await fetch(`${s.srv.url}/studio/fonts/anybody.woff2`);
    expect(font.status).toBe(200);
    expect(font.headers.get("content-type")).toBe("font/woff2");
    await font.arrayBuffer();
    for (const path of ["/studio/../../package.json", "/studio/..%2f..%2fpackage.json", "/studio/..%2f..%2f..%2fpackage.json", "/studio/%2e%2e%2f%2e%2e%2f%2e%2e%2fpackage.json", "/studio/%2e%2e/%2e%2e/package.json", "/studio/fonts/../../../package.json"]) {
      const res = await raw(s.srv.port, path, { Host: `127.0.0.1:${s.srv.port}` });
      expect(res.status, path).toBe(404);
      expect(res.body).not.toContain('"dependencies"');
    }
  });

  it("GET /api/v1/openapi.json → contrat OpenAPI 3.1, sans token", async () => {
    const s = await boot({ token: "secret-123" });
    const res = await fetch(`${s.srv.url}/api/v1/openapi.json`);
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { openapi: string; servers: { url: string }[] };
    expect(doc.openapi).toMatch(/^3\.1/);
    expect(doc.servers[0].url).toBe(s.srv.url);
  });

  it("chaque route de ROUTES figure dans openapi.paths avec la même méthode, et réciproquement", () => {
    const fromRoutes = ROUTES.map((r) => `${r.method} ${r.path.replace(/:(\w+)/g, "{$1}")}`).sort();
    const paths = (openapi as { paths: Record<string, Record<string, unknown>> }).paths;
    const fromSpec = Object.entries(paths)
      .flatMap(([path, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${path}`))
      .sort();
    expect(fromSpec).toEqual(fromRoutes);
  });

  it("route inconnue → 404 JSON not_found", async () => {
    const s = await boot();
    const res = await s.get("/api/v1/nope");
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe("not_found");
    const wrongMethod = await fetch(`${s.srv.url}/api/v1/health`, { method: "DELETE" });
    expect(wrongMethod.status).toBe(404);
  });

  it("/mcp : délégué au gestionnaire MCP, protégé par le token ; absent → 404", async () => {
    const seen: unknown[] = [];
    const s = await boot({
      token: "secret-123",
      mcp: async (_req, res, body) => {
        seen.push(body);
        res.writeHead(200, { "Content-Type": "application/json" }).end('{"jsonrpc":"2.0","id":1,"result":{}}');
      },
    });
    expect((await fetch(`${s.srv.url}/mcp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status).toBe(401);
    const ok = await s.post("/mcp", { jsonrpc: "2.0", id: 1, method: "ping" });
    expect(ok.status).toBe(200);
    expect(seen).toEqual([{ jsonrpc: "2.0", id: 1, method: "ping" }]);
    const plain = await boot();
    expect((await plain.post("/mcp", {})).status).toBe(404);
  });
});
