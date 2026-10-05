import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { createMcpServer, mcpHttpHandler } from "../mcp";
import { startServer } from "../server/http";
import { fakeFactory, seedJob } from "./fixtures/fake-factory";

const TONTINE = JSON.parse(readFileSync(join(__dirname, "fixtures", "tontine.json"), "utf8"));
const TOOLS = [
  "septim_create_video",
  "septim_doctor",
  "septim_get_task",
  "septim_get_video",
  "septim_lessons",
  "septim_lint_script",
  "septim_list_videos",
  "septim_publish_video",
  "septim_reject_video",
];

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((f) => f()));
});

async function connect(over: Parameters<typeof fakeFactory>[0] = {}, ids?: string[]) {
  const f = fakeFactory(over, ids);
  const server = createMcpServer(f.factory);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  cleanup.push(() => client.close());
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { type: string; text: string }[] };
    return { isError: !!r.isError, data: JSON.parse(r.content[0].text) };
  };
  return { ...f, client, call };
}

describe("MCP : ce que voit le client", () => {
  it("liste les 9 outils, les 2 ressources et le prompt nouvelle_video", async () => {
    const s = await connect();
    const tools = (await s.client.listTools()).tools;
    expect(tools.map((t) => t.name).sort()).toEqual(TOOLS);
    const publish = tools.find((t) => t.name === "septim_publish_video")!;
    expect(publish.description).toBe(
      'Publie une vidéo. N\'appelle cet outil QUE si l\'humain a écrit lui-même "OUI #<ref>" pour cette vidéo dans la conversation ; passe cette phrase telle quelle dans confirmation.',
    );
    expect(publish.annotations?.destructiveHint).toBe(true);
    const resources = (await s.client.listResources()).resources.map((r) => r.uri).sort();
    expect(resources).toEqual(["septim://checklist", "septim://guide-heat"]);
    const prompts = (await s.client.listPrompts()).prompts.map((p) => p.name);
    expect(prompts).toEqual(["nouvelle_video"]);
  });

  it("les ressources renvoient la checklist virale (JSON) et le guide H.E.A.T (Markdown)", async () => {
    const s = await connect();
    const checklist = (await s.client.readResource({ uri: "septim://checklist" })).contents[0] as { text: string; mimeType: string };
    expect(checklist.mimeType).toBe("application/json");
    expect(JSON.parse(checklist.text).rules.hook_max_seconds).toBeGreaterThan(0);
    const heat = (await s.client.readResource({ uri: "septim://guide-heat" })).contents[0] as { text: string; mimeType: string };
    expect(heat.mimeType).toBe("text/markdown");
    expect(heat.text).toContain("H.E.A.T");
  });

  it("prompt nouvelle_video {sujet} → message qui cite le sujet, la règle OUI #ref et septim_lint_script", async () => {
    const s = await connect();
    const p = await s.client.getPrompt({ name: "nouvelle_video", arguments: { sujet: "la tontine à Douala" } });
    const text = (p.messages[0].content as { text: string }).text;
    expect(text).toContain("la tontine à Douala");
    expect(text).toContain("OUI #");
    expect(text).toContain("septim_lint_script");
    expect(text).toContain("septim_create_video");
  });
});

describe("MCP : outils", () => {
  it("septim_publish_video sans la bonne confirmation → isError, code confirmation_required, aucune publication", async () => {
    const s = await connect();
    seedJob(s.store, "5f8a4d25");
    seedJob(s.store, "1234abcd");
    for (const confirmation of ["", "oui", "OUI #1234", "publie"]) {
      const r = await s.call("septim_publish_video", { ref: "5f8a", confirmation });
      expect(r.isError, confirmation).toBe(true);
      expect(r.data.error.code).toBe("confirmation_required");
    }
    expect(s.published).toEqual([]);
    const ok = await s.call("septim_publish_video", { ref: "#5F8A", confirmation: "OUI #5f8a" });
    expect(ok.isError).toBe(false);
    expect(ok.data).toMatchObject({ ref: "5f8a", status: "published" });
    expect(s.published).toEqual(["5f8a4d25"]);
  });

  it("septim_create_video wait_seconds 5 avec faux runJob rapide → renvoie la tâche done et la ref", async () => {
    const s = await connect();
    const r = await s.call("septim_create_video", { topic: "la tontine", template: "maths", script: TONTINE, wait_seconds: 5 });
    expect(r.isError).toBe(false);
    expect(r.data.task).toMatchObject({ status: "done", ref: "5f8a" });
    expect(r.data.video).toMatchObject({ ref: "5f8a", topic: "la tontine" });
  });

  it("septim_create_video wait_seconds absent → renvoie tout de suite la tâche queued", async () => {
    const s = await connect();
    const r = await s.call("septim_create_video", { topic: "la tontine" });
    expect(r.data.task.status).toBe("queued");
    await s.factory.idle();
    const t = await s.call("septim_get_task", { id: r.data.task.id });
    expect(t.data).toMatchObject({ status: "done", ref: "5f8a" });
  });

  it("septim_create_video avec un script refusé → isError bad_request avec les règles", async () => {
    const s = await connect();
    const r = await s.call("septim_create_video", { topic: "x", script: { hook: "x", beats: [], payoff: "" } });
    expect(r.isError).toBe(true);
    expect(r.data.error.code).toBe("bad_request");
    expect(r.data.error.details.issues.length).toBeGreaterThan(0);
  });

  it("septim_get_video \"#5F8A\" → détail ; référence ambiguë → isError ambiguous_ref", async () => {
    const s = await connect();
    seedJob(s.store, "5f8a4d25");
    seedJob(s.store, "ab12cdef");
    seedJob(s.store, "ab34cdef");
    const v = await s.call("septim_get_video", { ref: "#5F8A" });
    expect(v.isError).toBe(false);
    expect(v.data).toMatchObject({ id: "5f8a4d25", ref: "5f8a" });
    const amb = await s.call("septim_get_video", { ref: "ab" });
    expect(amb.isError).toBe(true);
    expect(amb.data.error.code).toBe("ambiguous_ref");
    expect(amb.data.error.details.matches).toHaveLength(2);
  });

  it("septim_list_videos, septim_lint_script, septim_reject_video, septim_doctor, septim_lessons → formes attendues", async () => {
    const s = await connect();
    seedJob(s.store, "5f8a4d25");
    expect((await s.call("septim_list_videos", { limit: 5 })).data.videos).toHaveLength(1);
    expect((await s.call("septim_lint_script", { script: TONTINE, template: "maths" })).data.ok).toBe(true);
    const bad = await s.call("septim_lint_script", { script: { hook: "x" } });
    expect(bad.data.ok).toBe(false);
    expect((await s.call("septim_reject_video", { ref: "5f8a" })).data.status).toBe("rejected");
    expect((await s.call("septim_doctor")).data.voice).toBe("silent");
    expect((await s.call("septim_lessons")).data).toEqual({ text: "", arms: [] });
  });
});

describe("MCP : HTTP sans état sur le serveur de l'usine", () => {
  it("POST /mcp initialize puis tools/list via le serveur HTTP → 9 outils, avec token", async () => {
    const f = fakeFactory();
    const srv = await startServer({ factory: f.factory, port: 0, token: "secret-123", mcp: mcpHttpHandler(f.factory) });
    cleanup.push(() => srv.close());
    const client = new Client({ name: "n8n", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${srv.url}/mcp`), { requestInit: { headers: { Authorization: "Bearer secret-123" } } }));
    cleanup.push(() => client.close());
    expect((await client.listTools()).tools.map((t) => t.name).sort()).toEqual(TOOLS);
    seedJob(f.store, "5f8a4d25");
    const r = (await client.callTool({ name: "septim_get_video", arguments: { ref: "5f8a" } })) as { content: { text: string }[] };
    expect(JSON.parse(r.content[0].text).ref).toBe("5f8a");
  });

  it("GET /mcp → 405 (serveur sans état, POST seulement)", async () => {
    const f = fakeFactory();
    const srv = await startServer({ factory: f.factory, port: 0, mcp: mcpHttpHandler(f.factory) });
    cleanup.push(() => srv.close());
    const res = await fetch(`${srv.url}/mcp`, { headers: { Accept: "text/event-stream" } });
    expect(res.status).toBe(405);
  });
});
