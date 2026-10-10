import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MCP_CLIENTS } from "../connect";
import { ROUTES } from "../server/routes";
import { HELP } from "../septim";

const ROOT = resolve(__dirname, "..", "..", "..");
const ENGINE = join(ROOT, "src", "viral-engine");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const GUIDE = existsSync(join(ROOT, "docs/GUIDE.md")) ? read("docs/GUIDE.md") : "";

// Variables posées par le système ou par bin/septim.mjs, jamais par l'utilisateur.
const SYSTEM_VARS = new Set(["INIT_CWD", "APPDATA", "SEPTIM_CWD"]);

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === "__tests__" || e.name === "studio") return [];
    const p = join(dir, e.name);
    return e.isDirectory() ? sources(p) : e.name.endsWith(".ts") ? [p] : [];
  });
}

describe("documentation : elle ne dérive pas du code", () => {
  it("chaque variable lue dans src/viral-engine (process.env.X, env.X) figure dans .env.example", () => {
    const used = new Set<string>();
    for (const file of sources(ENGINE)) {
      for (const m of readFileSync(file, "utf8").matchAll(/\b(?:process\.env|env)\??\.([A-Z][A-Z0-9_]+)\b/g)) used.add(m[1]);
    }
    const documented = new Set([...read(".env.example").matchAll(/^\s*#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]));
    const missing = [...used].filter((v) => !SYSTEM_VARS.has(v) && !documented.has(v)).sort();
    expect(used.size).toBeGreaterThan(20);
    expect(missing).toEqual([]);
  });

  it("GUIDE.md cite chaque commande septim de HELP, chaque client MCP, chaque outil MCP et chaque route d'API", () => {
    expect(GUIDE.length).toBeGreaterThan(5000);
    const commands = new Set([...HELP.matchAll(/septim ([a-z]+)/g)].map((m) => m[1]));
    expect(commands.size).toBeGreaterThanOrEqual(14);
    for (const c of commands) expect(GUIDE, `septim ${c}`).toContain(`septim ${c}`);
    for (const c of MCP_CLIENTS) expect(GUIDE, c).toContain(`septim connect ${c}`);
    const tools = [...read("src/viral-engine/mcp.ts").matchAll(/registerTool\(\s*"(\w+)"/g)].map((m) => m[1]);
    expect(tools).toHaveLength(9);
    for (const t of tools) expect(GUIDE, t).toContain(t);
    for (const r of ROUTES) expect(GUIDE, `${r.method} ${r.path}`).toContain(`${r.method} ${r.path}`);
    for (const section of ["En 1 minute", "Installer", "Navigateur", "Terminal", "Claude Code", "MCP", "API", "Webhooks", "WhatsApp", "Recettes", "Configuration", "Dépannage", "Sécurité", "Docker", "Ce qui manque encore"]) {
      expect(GUIDE, section).toMatch(new RegExp(`^##+ .*${section}`, "m"));
    }
  });

  it("les commandes du plugin appellent septim (jamais npm run, qui ne marche que dans le repo)", () => {
    const dir = join(ROOT, "plugins/septim-viral/commands");
    const files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
    expect(files).toEqual(["aide.md", "publier.md", "studio.md", "videos.md"]);
    for (const f of files) {
      const text = readFileSync(join(dir, f), "utf8");
      expect(text, f).toMatch(/^---\ndescription: .+\n(?:.+\n)*---\n/);
      expect(text, f).toContain("septim");
      expect(text, f).not.toMatch(/npm run/);
    }
    expect(readFileSync(join(dir, "publier.md"), "utf8")).toMatch(/argument-hint: <ref>/);
  });

  it("la skill viral passe par le MCP ou par septim, et jamais par Postiz en direct", () => {
    const skill = read("plugins/septim-viral/skills/viral/SKILL.md");
    expect(skill).toContain("septim_create_video");
    expect(skill).toContain("septim video");
    expect(skill).toContain("septim publier");
    expect(skill).not.toMatch(/npm run viral -- --publish/);
  });

  it("le MCP septim a une seule définition (hook de session, pas de .mcp.json en double) ; docs/n8n-septim.json est valide", () => {
    expect(existsSync(join(ROOT, ".mcp.json"))).toBe(false);
    expect(read(".claude/hooks/session-start.sh")).toContain("bin/septim.mjs\" connect claude-code");
    const n8n = JSON.parse(read("docs/n8n-septim.json"));
    const types = n8n.nodes.map((n: { type: string }) => n.type);
    expect(types).toContain("n8n-nodes-base.webhook");
    expect(types).toContain("n8n-nodes-base.formTrigger");
    expect(types).toContain("n8n-nodes-base.httpRequest");
    expect(types).not.toContain("n8n-nodes-base.code");
    const names = new Set(n8n.nodes.map((n: { name: string }) => n.name));
    for (const [from, out] of Object.entries(n8n.connections as Record<string, { main: { node: string }[][] }>)) {
      expect(names.has(from), from).toBe(true);
      for (const branch of out.main) for (const link of branch) expect(names.has(link.node), link.node).toBe(true);
    }
  });

  it("scripts/install.sh est un bash valide, strict, et ne demande rien", () => {
    expect(spawnSync("bash", ["-n", join(ROOT, "scripts/install.sh")]).status).toBe(0);
    const sh = read("scripts/install.sh");
    expect(sh).toContain("set -euo pipefail");
    expect(sh).toContain("PUPPETEER_SKIP_DOWNLOAD=1");
    expect(sh).toContain("npm link");
    expect(sh).toContain("--voix");
    expect(sh).toContain("--voix-hd) SETUP_ARGS+=(--voix-hd)");
    expect(sh).not.toMatch(/\bread\s+-/);
  });

  it("Docker : compose.yaml, Dockerfile et entrée sont cohérents, le GUIDE donne les commandes", () => {
    for (const f of ["Dockerfile", "compose.yaml", ".dockerignore", "docker/septim"]) expect(existsSync(join(ROOT, f)), f).toBe(true);
    for (const f of ["docker/septim"]) expect(spawnSync("sh", ["-n", join(ROOT, f)]).status, f).toBe(0);
    const compose = read("compose.yaml");
    // Le Studio n'est ouvert qu'à cette machine par défaut ; le token est généré si absent ; les données survivent au conteneur.
    expect(compose).toMatch(/127\.0\.0\.1|SEPTIM_BIND/);
    expect(compose).toContain("VIRAL_HOME: /data");
    expect(compose).toContain("healthcheck");
    expect(compose).toContain("shm_size");
    expect(compose).toMatch(/profiles:\s*\[ia\]/);
    const docker = read("Dockerfile");
    expect(docker).toContain("PUPPETEER_SKIP_DOWNLOAD=1");
    expect(docker).toMatch(/chromium/);
    expect(docker).toMatch(/ffmpeg/);
    expect(docker).toMatch(/fonts-noto-color-emoji/);
    const ignore = read(".dockerignore");
    for (const secret of [".env", ".septim-viral", "node_modules"]) expect(ignore, secret).toMatch(new RegExp(`^${secret.replace(".", "\\.")}$`, "m"));
    const dockerSection = GUIDE.slice(GUIDE.search(/^##+ .*Docker/m));
    for (const cmd of ["docker compose up", "docker compose run --rm septim", "docker compose --profile ia", "docker compose logs", "docker compose down"]) expect(dockerSection, cmd).toContain(cmd);
    // Variables propres au compose : documentées dans .env.example.
    const example = read(".env.example");
    for (const v of ["SEPTIM_BIND", "SEPTIM_OLLAMA_HOST"]) expect(example, v).toContain(v);
  });

  it("Windows : LANCER.bat et LANCER.ps1 lancent tout avec Docker, .gitattributes protège les fins de ligne", () => {
    for (const f of ["LANCER.bat", "LANCER.ps1", ".gitattributes"]) expect(existsSync(join(ROOT, f)), f).toBe(true);
    const ps1 = readFileSync(join(ROOT, "LANCER.ps1"));
    // Windows PowerShell 5.1 lit un .ps1 sans BOM en ANSI : tout accent casserait le script.
    expect([...ps1].every((b) => b < 128), "LANCER.ps1 en ASCII").toBe(true);
    const text = ps1.toString("utf8");
    expect(text).toContain("docker compose up -d --build");
    expect(text).toContain("winget install -e --id Docker.DockerDesktop");
    expect(text).toContain("Start-Process");
    expect(text).not.toMatch(/ErrorActionPreference\s*=\s*["']Stop/);
    expect(read("LANCER.bat")).toMatch(/powershell .*-ExecutionPolicy Bypass .*-File .*LANCER\.ps1/);
    // Un script shell copié par git sous Windows en CRLF ferait planter le conteneur (« /bin/sh^M »).
    const attrs = read(".gitattributes");
    expect(attrs).toMatch(/docker\/\*\s+text eol=lf/);
    expect(attrs).toMatch(/Dockerfile\s+text eol=lf/);
    expect(attrs).toMatch(/\*\.(bat|ps1)[^\n]*eol=crlf|\*\.\{bat,ps1\}[^\n]*eol=crlf/);
    expect(GUIDE).toContain("LANCER.bat");
    expect(GUIDE).toContain("Expand-Archive");
  });

  it("Windows : septim.cmd relaie vers le conteneur et branche Claude Code par HTTP ; LANCER.ps1 ajoute le dossier au PATH", () => {
    const cmd = readFileSync(join(ROOT, "septim.cmd"));
    expect([...cmd].every((b) => b < 128), "septim.cmd en ASCII (cmd lit l'OEM, pas l'UTF-8)").toBe(true);
    const text = cmd.toString("utf8");
    expect(text).toContain("docker compose exec septim septim %*");
    expect(text).toContain("claude mcp add --transport http --scope user septim");
    expect(text).toContain("Authorization: Bearer");
    expect(text).toMatch(/\/data\/\.token/);
    expect(read(".gitattributes")).toMatch(/\*\.cmd[^\n]*eol=crlf|\*\.\{bat,cmd,ps1\}[^\n]*eol=crlf/);
    expect(read("LANCER.ps1")).toContain("SetEnvironmentVariable");
    expect(read("Dockerfile")).toContain("SEPTIM_IN_DOCKER=1");
    expect(GUIDE).toContain("septim.cmd");
  });
});
