import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Writable } from "node:stream";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, it } from "vitest";
import { HELP, MCP_CLIENTS, main, mcpConfig, parseCommand, writeMcpConfig } from "../septim";
import { createStore } from "../store";
import { seedJob } from "./fixtures/fake-factory";

const ROOT = resolve(__dirname, "..", "..", "..");
const BIN = join(ROOT, "bin", "septim.mjs");
const NODE = "/usr/bin/node-test";

function capture() {
  let text = "";
  const stream = new Writable({
    write(chunk, _enc, done) {
      text += chunk.toString();
      done();
    },
  });
  return { stream, get text() {
    return text;
  } };
}

async function run(argv: string[]) {
  const out = capture();
  const err = capture();
  const code = await main(argv, { out: out.stream, err: err.stream });
  return { code, out: out.text, err: err.text };
}

const savedEnv = { ...process.env };
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in savedEnv)) delete process.env[k];
  Object.assign(process.env, savedEnv);
});

function tempHome() {
  const home = mkdtempSync(join(tmpdir(), "septim-cli-"));
  process.env.VIRAL_HOME = home;
  process.env.VIRAL_PUBLISH_MODE = "manual";
  process.env.VIRAL_WEBHOOK_URL = "";
  return { home, store: createStore(home) };
}

describe("septim : aide et répartition", () => {
  it("septim sans argument → aide en français qui liste video, studio, start, mcp, connect, publier", async () => {
    const r = await run([]);
    expect(r.code).toBe(0);
    expect(r.out).toBe(`${HELP}\n`);
    for (const word of ["septim video", "septim studio", "septim start", "septim mcp", "septim connect", "septim publier", "septim setup", "septim doctor"]) expect(HELP).toContain(word);
    expect(HELP).toMatch(/Fabriquer une vidéo/);
    expect((await run(["aide"])).out).toBe(`${HELP}\n`);
    expect((await run(["--help"])).out).toBe(`${HELP}\n`);
  });

  it("alias anglais : publish 5f8a → publier ; create → video ; list, show, reject", () => {
    expect(parseCommand(["publish", "5f8a"])).toEqual({ command: "publier", args: ["5f8a"] });
    expect(parseCommand(["create", "la tontine"])).toEqual({ command: "video", args: ["la tontine"] });
    expect(parseCommand(["list"]).command).toBe("videos");
    expect(parseCommand(["show", "5f8a"]).command).toBe("voir");
    expect(parseCommand(["reject", "5f8a"]).command).toBe("jeter");
    expect(parseCommand(["help"]).command).toBe("aide");
  });

  it("commande inconnue → sortie 1 avec suggestion", async () => {
    const r = await run(["vidoe", "x"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("« vidoe »");
    expect(r.err).toContain("septim video");
  });

  it("publier sans référence → sortie 1 et marche à suivre", async () => {
    tempHome();
    const r = await run(["publier"]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/septim publier <ref>/);
    expect(r.err).toMatch(/septim videos/);
  });
});

describe("septim setup --voix", () => {
  it("installe Piper dans le venv de l'usine (pas pip --user, refusé par PEP 668) puis la voix française", async () => {
    const { installVoice } = await import("../setup");
    const home = mkdtempSync(join(tmpdir(), "septim-voix-"));
    const calls: string[][] = [];
    const ok = installVoice(home, { out: capture().stream, err: capture().stream }, { voice: "fr_FR-tom-medium", run: (cmd, args) => (calls.push([cmd, ...args]), 0) });
    expect(ok).toBe(true);
    const py = join(home, "venv", "bin", "python");
    expect(calls).toEqual([
      ["python3", "-m", "venv", join(home, "venv")],
      [py, "-m", "pip", "install", "--upgrade", "piper-tts"],
      [py, "-m", "piper.download_voices", "fr_FR-tom-medium", "--data-dir", join(home, "voices")],
    ]);
  });

  it("--voix-hd installe Chatterbox (MIT) dans le même venv, et dit comment l'activer", async () => {
    const { installVoiceHd } = await import("../setup");
    const home = mkdtempSync(join(tmpdir(), "septim-voix-"));
    const calls: string[][] = [];
    const out = capture();
    expect(installVoiceHd(home, { out: out.stream, err: capture().stream }, { run: (cmd, args) => (calls.push([cmd, ...args]), 0) })).toBe(true);
    const py = join(home, "venv", "bin", "python");
    expect(calls).toEqual([
      ["python3", "-m", "venv", join(home, "venv")],
      [py, "-m", "pip", "install", "--upgrade", "chatterbox-tts"],
    ]);
    expect(out.text).toMatch(/VIRAL_TTS=chatterbox/);
  });

  it("venv impossible (python3-venv absent) → échec expliqué, rien d'autre lancé", async () => {
    const { installVoice } = await import("../setup");
    const err = capture();
    const calls: string[][] = [];
    const ok = installVoice(mkdtempSync(join(tmpdir(), "septim-voix-")), { out: capture().stream, err: err.stream }, { voice: "fr_FR-tom-medium", run: (cmd, args) => (calls.push([cmd, ...args]), 1) });
    expect(ok).toBe(false);
    expect(calls).toHaveLength(1);
    expect(err.text).toMatch(/python3-venv/);
  });
});

describe("septim : vidéos depuis le terminal", () => {
  it("videos, voir, jeter et publier passent par la fabrique (références « #5F8A », ambiguïté refusée)", async () => {
    const { store } = tempHome();
    seedJob(store, "5f8a4d25", { topic: "la tontine" });
    seedJob(store, "ab12cdef");
    seedJob(store, "ab34cdef");
    const list = await run(["videos"]);
    expect(list.code).toBe(0);
    expect(list.out).toContain("#5f8a");
    expect(list.out).toContain("À valider");
    const show = await run(["voir", "#5F8A"]);
    expect(show.code).toBe(0);
    expect(show.out).toContain("la tontine");
    expect(show.out).toContain("septim publier 5f8a");
    const amb = await run(["voir", "ab"]);
    expect(amb.code).toBe(1);
    expect(amb.err).toMatch(/plusieurs vidéos/);
    const pub = await run(["publier", "5F8A"]);
    expect(pub.code).toBe(0);
    expect(pub.out).toMatch(/Légende prête/);
    expect(store.getJob("5f8a4d25")!.status).toBe("published");
    const again = await run(["publish", "5f8a"]);
    expect(again.code).toBe(1);
    expect(again.err).toMatch(/déjà publiée/);
    const reject = await run(["jeter", "ab12"]);
    expect(reject.code).toBe(0);
    expect(store.getJob("ab12cdef")!.status).toBe("rejected");
  });

  it("voir affiche la source des plans et leurs crédits", async () => {
    const { store } = tempHome();
    const job = seedJob(store, "5f8a4d25", { topic: "la tontine" });
    store.saveJob({ ...job, broll: { source: "pexels", credits: [{ provider: "pexels", author: "Ama", url: "https://www.pexels.com/video/1/" }] } });
    const r = await run(["voir", "5f8a"]);
    expect(r.out).toMatch(/Plans\s+Pexels \(gratuit\), crédits : Ama/);
  });

  it("lint accepte aussi le corps de l'API ({\"script\": {…}})", async () => {
    tempHome();
    const dir = mkdtempSync(join(tmpdir(), "septim-lint-"));
    writeFileSync(join(dir, "corps.json"), JSON.stringify({ script: JSON.parse(readFileSync(join(__dirname, "fixtures", "tontine.json"), "utf8")) }));
    process.env.SEPTIM_CWD = dir;
    const r = await run(["lint", "corps.json", "--template", "maths"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/conforme/);
  });

  it("la file WhatsApp ne se remplit que si WhatsApp est lié (sinon un vieux message partirait plus tard)", async () => {
    const { queueToWhatsApp } = await import("../cli");
    const { home } = tempHome();
    const { loadConfig } = await import("../config");
    expect(queueToWhatsApp(loadConfig({ VIRAL_HOME: home, VIRAL_NOTIFIER: "whatsapp" }), false)).toBe(false);
    mkdirSync(join(home, "wa"), { recursive: true });
    expect(queueToWhatsApp(loadConfig({ VIRAL_HOME: home, VIRAL_NOTIFIER: "whatsapp" }), false)).toBe(true);
    expect(queueToWhatsApp(loadConfig({ VIRAL_HOME: home, VIRAL_NOTIFIER: "whatsapp" }), true)).toBe(false);
    expect(queueToWhatsApp(loadConfig({ VIRAL_HOME: home, VIRAL_NOTIFIER: "console" }), false)).toBe(false);
  });

  it("lint <fichier> relatif au dossier où l'on tape la commande", async () => {
    tempHome();
    process.env.SEPTIM_CWD = join(__dirname, "fixtures");
    const r = await run(["lint", "tontine.json", "--template", "maths"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/conforme/);
  });
});

describe("septim connect : configuration MCP de chaque client", () => {
  const opts = { root: "/opt/septim", node: NODE, home: "/home/ana", platform: "linux" as NodeJS.Platform };
  const server = { command: NODE, args: ["/opt/septim/bin/septim.mjs", "mcp"] };

  it("MCP_CLIENTS couvre les 7 clients", () => {
    expect([...MCP_CLIENTS]).toEqual(["claude-code", "claude-desktop", "cursor", "vscode", "windsurf", "codex", "gemini"]);
  });

  it("claude-code → commande claude mcp add en portée utilisateur", () => {
    expect(mcpConfig("claude-code", opts).command).toEqual(["claude", "mcp", "add", "--scope", "user", "septim", "--", NODE, "/opt/septim/bin/septim.mjs", "mcp"]);
  });

  it("claude-desktop → claude_desktop_config.json (Linux, macOS, Windows) avec mcpServers.septim absolu", () => {
    const linux = mcpConfig("claude-desktop", opts);
    expect(linux.path).toBe("/home/ana/.config/Claude/claude_desktop_config.json");
    expect(JSON.parse(linux.content)).toEqual({ mcpServers: { septim: server } });
    expect(mcpConfig("claude-desktop", { ...opts, platform: "darwin" }).path).toBe("/home/ana/Library/Application Support/Claude/claude_desktop_config.json");
    expect(mcpConfig("claude-desktop", { ...opts, platform: "win32", appData: "C:\\Users\\ana\\AppData\\Roaming" }).path).toMatch(/Claude[\\/]claude_desktop_config\.json$/);
  });

  it("cursor → ~/.cursor/mcp.json ; windsurf → ~/.codeium/windsurf/mcp_config.json ; gemini → ~/.gemini/settings.json", () => {
    expect(mcpConfig("cursor", opts).path).toBe("/home/ana/.cursor/mcp.json");
    expect(JSON.parse(mcpConfig("cursor", opts).content)).toEqual({ mcpServers: { septim: server } });
    expect(mcpConfig("windsurf", opts).path).toBe("/home/ana/.codeium/windsurf/mcp_config.json");
    expect(mcpConfig("gemini", opts).path).toBe("/home/ana/.gemini/settings.json");
    expect(JSON.parse(mcpConfig("gemini", opts).content)).toEqual({ mcpServers: { septim: server } });
  });

  it("vscode → mcp.json du profil utilisateur, clé servers et type stdio", () => {
    const c = mcpConfig("vscode", opts);
    expect(c.path).toBe("/home/ana/.config/Code/User/mcp.json");
    expect(JSON.parse(c.content)).toEqual({ servers: { septim: { type: "stdio", ...server } } });
    expect(mcpConfig("vscode", { ...opts, platform: "darwin" }).path).toBe("/home/ana/Library/Application Support/Code/User/mcp.json");
  });

  it("codex → ~/.codex/config.toml avec [mcp_servers.septim]", () => {
    const c = mcpConfig("codex", opts);
    expect(c.path).toBe("/home/ana/.codex/config.toml");
    expect(c.content).toContain("[mcp_servers.septim]");
    expect(c.content).toContain(`command = "${NODE}"`);
    expect(c.content).toContain('args = ["/opt/septim/bin/septim.mjs", "mcp"]');
  });

  it("--write fusionne : les autres serveurs restent, septim est remplacé ; JSON illisible → refus sans écraser", () => {
    const home = mkdtempSync(join(tmpdir(), "septim-connect-"));
    const o = { ...opts, home };
    const file = join(home, ".cursor", "mcp.json");
    mkdirSync(join(home, ".cursor"), { recursive: true });
    writeFileSync(file, JSON.stringify({ mcpServers: { github: { command: "gh" }, septim: { command: "vieux" } }, autre: 1 }));
    writeMcpConfig("cursor", o);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ mcpServers: { github: { command: "gh" }, septim: server }, autre: 1 });

    const toml = join(home, ".codex", "config.toml");
    mkdirSync(join(home, ".codex"), { recursive: true });
    writeFileSync(toml, 'model = "o4"\n\n[mcp_servers.septim]\ncommand = "vieux"\n\n[mcp_servers.autre]\ncommand = "x"\n');
    writeMcpConfig("codex", o);
    const t = readFileSync(toml, "utf8");
    expect(t).toContain('model = "o4"');
    expect(t).toContain("[mcp_servers.autre]");
    expect(t).not.toContain("vieux");
    expect(t.match(/\[mcp_servers\.septim\]/g)).toHaveLength(1);

    const broken = join(home, ".gemini", "settings.json");
    mkdirSync(join(home, ".gemini"), { recursive: true });
    writeFileSync(broken, "{ pas du json");
    expect(() => writeMcpConfig("gemini", o)).toThrow(/illisible/);
    expect(readFileSync(broken, "utf8")).toBe("{ pas du json");
    rmSync(home, { recursive: true, force: true });
  });

  it("septim connect <client> affiche le fichier et la configuration ; client inconnu → 1", async () => {
    const r = await run(["connect", "cursor"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain(".cursor/mcp.json");
    expect(r.out).toContain("bin/septim.mjs");
    expect(r.out).toContain("--write");
    const bad = await run(["connect", "notepad"]);
    expect(bad.code).toBe(1);
    expect(bad.err).toContain("claude-desktop");
  });
});

describe("septim : vrais processus, lancés depuis un autre dossier", () => {
  it("bin/septim.mjs doctor (cwd = dossier temporaire) sort en 0 et affiche « état de l'usine »", () => {
    const cwd = mkdtempSync(join(tmpdir(), "septim-ailleurs-"));
    const r = spawnSync(process.execPath, [BIN, "doctor"], { cwd, env: { ...process.env, VIRAL_NOTIFIER: "console" }, encoding: "utf8", timeout: 60_000 });
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("état de l'usine");
  }, 70_000);

  it("septim videos lancé ailleurs lit le VIRAL_HOME du repo (chemin relatif résolu depuis le repo)", () => {
    const rel = `.septim-test-${process.pid}`;
    const home = join(ROOT, rel);
    try {
      seedJob(createStore(home), "c0ffee12", { topic: "le marché Mokolo" });
      const cwd = mkdtempSync(join(tmpdir(), "septim-ailleurs-"));
      const r = spawnSync(process.execPath, [BIN, "videos"], { cwd, env: { ...process.env, VIRAL_HOME: rel }, encoding: "utf8", timeout: 60_000 });
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toContain("#c0ff");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  }, 70_000);

  it("septim mcp (vrai processus) répond à initialize puis tools/list sur stdio, sans rien d'autre sur stdout", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "septim-ailleurs-"));
    const home = mkdtempSync(join(tmpdir(), "septim-mcp-home-"));
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [BIN, "mcp"],
      cwd,
      env: { ...(process.env as Record<string, string>), VIRAL_HOME: home },
      stderr: "pipe",
    });
    const client = new Client({ name: "test", version: "1.0.0" });
    const errors: unknown[] = [];
    client.onerror = (e) => void errors.push(e);
    await client.connect(transport);
    try {
      const tools = await client.listTools();
      expect(tools.tools).toHaveLength(9);
      const doctor = (await client.callTool({ name: "septim_doctor", arguments: {} })) as { content: { text: string }[] };
      expect(JSON.parse(doctor.content[0].text).canRender).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await client.close();
    }
    expect(existsSync(join(home, "tasks"))).toBe(true);
  }, 70_000);
});

describe("revue finale : septim video et septim mcp préviennent les webhooks", () => {
  it("septim video passe par la file de la fabrique : webhook video.ready reçu, brollDir transmis, ref unique affichée", async () => {
    const { createServer } = await import("node:http");
    const got: { event: string; ref?: string }[] = [];
    const srv = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c)).on("end", () => {
        const p = JSON.parse(body);
        got.push({ event: p.event, ref: p.video?.ref });
        res.end("ok");
      });
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
    try {
      const { store } = tempHome();
      seedJob(store, "5f8a1111");
      process.env.VIRAL_WEBHOOK_URL = `http://127.0.0.1:${(srv.address() as { port: number }).port}/hook`;
      const { runCli } = await import("../cli");
      const requests: unknown[] = [];
      const runJob = async (req: { brollDir?: string }) => {
        requests.push(req);
        return seedJob(store, "5f8a2222", req as never);
      };
      const out = capture();
      const code = await runCli(["la", "tontine", "--broll", "/tmp/clips", "--no-notify"], { out: out.stream, err: capture().stream }, { runJob });
      expect(code).toBe(0);
      expect(requests).toMatchObject([{ topic: "la tontine", brollDir: "/tmp/clips" }]);
      expect(got).toEqual([{ event: "video.ready", ref: "5f8a2" }]);
      expect(out.text).toContain("septim publier 5f8a2");
    } finally {
      srv.close();
    }
  });

  it("septim mcp branche les webhooks (même fabrique que le Studio)", () => {
    const src = readFileSync(join(ROOT, "src/viral-engine/septim.ts"), "utf8");
    const mcpCase = src.slice(src.indexOf('case "mcp"'), src.indexOf('case "connect"'));
    expect(mcpCase).toMatch(/attachWebhooks\(/);
  });
});

describe("revue finale : septim connect ne casse jamais la config d'un autre logiciel", () => {
  const opts = { root: "/opt/septim", node: NODE, home: "", platform: "linux" as NodeJS.Platform };

  it("codex : en-tête commenté reconnu, tables [[…]] gardées, copie .bak, droits gardés, lien symbolique suivi", async () => {
    const { chmodSync, lstatSync, statSync, symlinkSync } = await import("node:fs");
    const home = mkdtempSync(join(tmpdir(), "septim-toml-"));
    const real = join(home, "dotfiles", "codex.toml");
    mkdirSync(join(home, "dotfiles"), { recursive: true });
    const before = 'model = "o4"\n\n[mcp_servers.septim] # ancien\ncommand = "vieux"\n\n[[profiles]]\nname = "perso"\n\n[mcp_servers.autre]\ncommand = "x"\n';
    writeFileSync(real, before);
    chmodSync(real, 0o600);
    mkdirSync(join(home, ".codex"), { recursive: true });
    const link = join(home, ".codex", "config.toml");
    symlinkSync(real, link);
    writeMcpConfig("codex", { ...opts, home });
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    const t = readFileSync(real, "utf8");
    expect(t).not.toContain("vieux");
    expect(t).toContain('[[profiles]]\nname = "perso"');
    expect(t).toContain("[mcp_servers.autre]");
    expect(t.match(/\[mcp_servers\.septim\]/g)).toHaveLength(1);
    expect(statSync(real).mode & 0o777).toBe(0o600);
    expect(readFileSync(`${real}.bak`, "utf8")).toBe(before);
    rmSync(home, { recursive: true, force: true });
  });

  it("JSON : lien symbolique suivi et droits gardés aussi", async () => {
    const { chmodSync, lstatSync, statSync, symlinkSync } = await import("node:fs");
    const home = mkdtempSync(join(tmpdir(), "septim-json-"));
    const real = join(home, "dotfiles", "cursor.json");
    mkdirSync(join(home, "dotfiles"), { recursive: true });
    writeFileSync(real, JSON.stringify({ mcpServers: { github: { command: "gh" } } }));
    chmodSync(real, 0o600);
    mkdirSync(join(home, ".cursor"), { recursive: true });
    symlinkSync(real, join(home, ".cursor", "mcp.json"));
    writeMcpConfig("cursor", { ...opts, home });
    expect(lstatSync(join(home, ".cursor", "mcp.json")).isSymbolicLink()).toBe(true);
    expect(JSON.parse(readFileSync(real, "utf8")).mcpServers.github).toEqual({ command: "gh" });
    expect(statSync(real).mode & 0o777).toBe(0o600);
    rmSync(home, { recursive: true, force: true });
  });
});

describe("Docker : septim connect branche par l'adresse HTTP (le conteneur n'a pas de claude ni de chemins utiles à l'hôte)", () => {
  it("dockerMcpConfig : la commande claude, le JSON de Cursor et de VS Code portent l'URL et le token", async () => {
    const { dockerMcpConfig } = await import("../connect");
    const o = { url: "http://localhost:4321/mcp", token: "abc123" };
    expect(dockerMcpConfig("claude-code", o).content).toBe('claude mcp add --transport http --scope user septim http://localhost:4321/mcp --header "Authorization: Bearer abc123"');
    expect(JSON.parse(dockerMcpConfig("cursor", o).content)).toEqual({ mcpServers: { septim: { url: o.url, headers: { Authorization: "Bearer abc123" } } } });
    expect(JSON.parse(dockerMcpConfig("vscode", o).content)).toEqual({ servers: { septim: { type: "http", url: o.url, headers: { Authorization: "Bearer abc123" } } } });
    // Les autres : l'adresse et l'en-tête à saisir, jamais un chemin du conteneur.
    const other = dockerMcpConfig("claude-desktop", o).content;
    expect(other).toContain(o.url);
    expect(other).toContain("Bearer abc123");
    expect(other).not.toContain("septim.mjs");
  });

  it("septim connect <client> dans Docker : URL du port publié + token, code 0 ; --write refusé (le conteneur n'écrit pas chez toi)", async () => {
    process.env.SEPTIM_IN_DOCKER = "1";
    process.env.SEPTIM_TOKEN = "tok999";
    process.env.SEPTIM_PUBLISHED_PORT = "4400";
    const r = await run(["connect", "cursor"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("http://localhost:4400/mcp");
    expect(r.out).toContain("Bearer tok999");
    expect(r.out).not.toContain("septim.mjs");
    const w = await run(["connect", "cursor", "--write"]);
    expect(w.code).toBe(1);
    expect(w.err + w.out).toMatch(/septim\.cmd|ton PC|hôte/);
    const c = await run(["connect", "claude-code"]);
    expect(c.code).toBe(0);
    expect(c.out).toContain('claude mcp add --transport http --scope user septim http://localhost:4400/mcp');
  });
});

describe("septim env : régler .env depuis le terminal", () => {
  async function workspace(extra = "") {
    const { copyFileSync, mkdtempSync: mk, writeFileSync: wf } = await import("node:fs");
    const root = mk(join(tmpdir(), "septim-envcli-"));
    copyFileSync(join(ROOT, ".env.example"), join(root, ".env.example"));
    if (extra !== null) wf(join(root, ".env"), extra);
    process.env.SEPTIM_ROOT = root;
    tempHome();
    return { root, file: join(root, ".env") };
  }
  const runWithInput = async (argv: string[], input: string) => {
    const { Readable } = await import("node:stream");
    const out = capture();
    const err = capture();
    const code = await main(argv, { out: out.stream, err: err.stream, input: Readable.from([input]) });
    return { code, out: out.text, err: err.text };
  };

  it("env set CLE=valeur écrit la ligne sans jamais répéter la clé ; la forme « CLE valeur » marche aussi", async () => {
    const { file } = await workspace("VIRAL_LANG=fr\n");
    const a = await run(["env", "set", "PEXELS_API_KEY=abc123secret"]);
    expect(a.code).toBe(0);
    expect(a.out).toContain("PEXELS_API_KEY");
    expect(a.out).toMatch(/enregistrée/);
    expect(a.out + a.err).not.toContain("abc123secret");
    expect(readFileSync(file, "utf8")).toContain("PEXELS_API_KEY=abc123secret");
    expect(readFileSync(file, "utf8")).toContain("VIRAL_LANG=fr");
    const b = await run(["env", "set", "COMFYUI_URL", "http://host.docker.internal:8188", "POSTIZ_API_URL=http://host.docker.internal:4007/api"]);
    expect(b.code).toBe(0);
    const text = readFileSync(file, "utf8");
    expect(text).toContain("COMFYUI_URL=http://host.docker.internal:8188");
    expect(text).toContain("POSTIZ_API_URL=http://host.docker.internal:4007/api");
  });

  it("le .env absent est créé avec un en-tête (pas la copie de .env.example : ses valeurs écraseraient les défauts de Docker)", async () => {
    const { file } = await workspace(null as never);
    expect((await run(["env", "set", "YOUTUBE_API_KEY=yt"])).code).toBe(0);
    const text = readFileSync(file, "utf8");
    expect(text).toContain("YOUTUBE_API_KEY=yt");
    expect(text).not.toMatch(/^VIRAL_NOTIFIER=/m);
  });

  it("nom inconnu ou mal écrit → code 1 avec la suggestion, rien n'est écrit", async () => {
    const { file } = await workspace("A=1\n");
    const r = await run(["env", "set", "PEXEL_API_KEY=x"]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/PEXELS_API_KEY/);
    expect(readFileSync(file, "utf8")).toBe("A=1\n");
    expect((await run(["env", "set", "pexels=x"])).code).toBe(1);
    expect((await run(["env", "set", "PEXELS_API_KEY"])).err).toMatch(/valeur/);
    expect((await run(["env", "set"])).code).toBe(1);
  });

  it("env unset retire la ligne ; env list montre réglé / vide, jamais une clé", async () => {
    const { file } = await workspace("PEXELS_API_KEY=supersecret99\n");
    const list = await run(["env", "list"]);
    expect(list.code).toBe(0);
    expect(list.out).toMatch(/PEXELS_API_KEY\s+réglé\s+•••• \(13 caractères\)/);
    expect(list.out).toMatch(/YOUTUBE_API_KEY\s+vide/);
    expect(list.out).not.toContain("supersecret99");
    expect((await run(["env"])).out).toMatch(/PEXELS_API_KEY\s+réglé/);
    expect((await run(["env", "unset", "PEXELS_API_KEY"])).code).toBe(0);
    expect(readFileSync(file, "utf8")).not.toContain("PEXELS_API_KEY=");
    const again = await run(["env", "unset", "PEXELS_API_KEY"]);
    expect(again.out + again.err).toMatch(/déjà vide|pas réglée/);
  });

  it("env init : l'assistant pose les questions, Entrée garde, une réponse règle ; WhatsApp en o/N", async () => {
    const { file } = await workspace("PEXELS_API_KEY=ancienne\n");
    // Pexels : Entrée (garde) ; Pixabay : réglée ; YouTube, Apify, Postiz URL, Postiz clé : Entrée ; ComfyUI : réglée ; WhatsApp : o
    const answers = ["", "pix-key", "", "", "http://host.docker.internal:4007/api", "pz-key", "http://host.docker.internal:8188", "o"].join("\n") + "\n";
    const r = await runWithInput(["env", "init"], answers);
    expect(r.code).toBe(0);
    const text = readFileSync(file, "utf8");
    expect(text).toContain("PEXELS_API_KEY=ancienne");
    expect(text).toContain("PIXABAY_API_KEY=pix-key");
    expect(text).toContain("POSTIZ_API_URL=http://host.docker.internal:4007/api");
    expect(text).toContain("POSTIZ_API_KEY=pz-key");
    expect(text).toContain("COMFYUI_URL=http://host.docker.internal:8188");
    expect(text).toContain("VIRAL_NOTIFIER=whatsapp");
    expect(r.out).toMatch(/5 valeurs? enregistrée/);
    expect(r.out).not.toContain("pix-key");
    expect(r.out).toContain("septim env check");
  });

  it("env init sans réponse (fin d'entrée) ne casse rien", async () => {
    const { file } = await workspace("A=1\n");
    const r = await runWithInput(["env", "init"], "");
    expect(r.code).toBe(0);
    expect(readFileSync(file, "utf8")).toBe("A=1\n");
    expect(r.out).toMatch(/Rien à changer/);
  });

  it("dans Docker : dit comment appliquer ; hors Docker : relancer septim", async () => {
    await workspace("");
    process.env.SEPTIM_IN_DOCKER = "1";
    expect((await run(["env", "set", "YOUTUBE_API_KEY=k"])).out).toMatch(/docker compose up -d/);
    delete process.env.SEPTIM_IN_DOCKER;
    expect((await run(["env", "set", "YOUTUBE_API_KEY=k2"])).out).toMatch(/septim studio|septim start/);
  });

  it("env check sans aucune clé : le dit et renvoie vers env init (aucun appel réseau)", async () => {
    await workspace("");
    for (const k of ["PEXELS_API_KEY", "PIXABAY_API_KEY", "YOUTUBE_API_KEY", "APIFY_TOKEN", "POSTIZ_API_KEY", "COMFYUI_URL"]) delete process.env[k];
    const r = await run(["env", "check"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/Aucune clé/);
    expect(r.out).toContain("septim env init");
  });

  it("septim aide cite env ; sous-commande inconnue → aide de env", async () => {
    expect((await run(["aide"])).out).toMatch(/septim env/);
    const r = await run(["env", "nimporte"]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/set|list|init|check/);
  });
});
