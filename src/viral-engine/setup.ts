import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { mcpConfig } from "./connect";

type IO = { out: NodeJS.WritableStream; err: NodeJS.WritableStream };
const say = (io: IO, text = "") => void io.out.write(`${text}\n`);

export const hasCommand = (cmd: string) => spawnSync(cmd, ["--version"], { stdio: "ignore", shell: process.platform === "win32" }).status === 0;

// Branche septim dans Claude Code. Réessayer ne casse rien : chaque étape accepte « déjà fait ».
export function connectClaudeCode(root: string, io: IO): boolean {
  const { command } = mcpConfig("claude-code", { root, node: process.execPath });
  const [cmd, ...args] = command!;
  let r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0 && /already exists/i.test(`${r.stdout}${r.stderr}`)) {
    spawnSync(cmd, ["mcp", "remove", "--scope", "user", "septim"], { encoding: "utf8" });
    r = spawnSync(cmd, args, { encoding: "utf8" });
  }
  if (r.status === 0) {
    say(io, "✓ MCP septim ajouté à Claude Code (portée utilisateur). Vérifie : claude mcp list");
    return true;
  }
  io.err.write(`✗ claude mcp add a échoué : ${(r.stderr || r.stdout || "").trim()}\n  Lance-le toi-même : ${command!.join(" ")}\n`);
  return false;
}

function claude(io: IO, args: string[], label: string): boolean {
  const r = spawnSync("claude", args, { encoding: "utf8" });
  const text = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (r.status === 0 || /already|déjà/i.test(text)) {
    say(io, `✓ ${label}`);
    return true;
  }
  io.err.write(`✗ ${label} : ${text.trim()}\n  Commande : claude ${args.join(" ")}\n`);
  return false;
}

// septim setup : .env, puis Claude Code (marketplace, 2 plugins, MCP) s'il est installé. Le diagnostic suit.
export function setup(root: string, io: IO, opts: { withClaude: boolean; claudePresent?: boolean }): boolean {
  let ok = true;
  const env = join(root, ".env");
  if (!existsSync(env) && existsSync(join(root, ".env.example"))) {
    copyFileSync(join(root, ".env.example"), env);
    say(io, "✓ .env créé depuis .env.example (tout est optionnel : sans rien, l'usine tourne en gratuit).");
  } else {
    say(io, "✓ .env déjà là.");
  }

  if (!opts.withClaude) {
    say(io, "• Claude Code laissé tel quel (--sans-claude).");
    return ok;
  }
  if (!(opts.claudePresent ?? hasCommand("claude"))) {
    say(io, "• Claude Code absent : installe-le (npm install -g @anthropic-ai/claude-code), puis relance septim setup.");
    return ok;
  }
  ok = claude(io, ["plugin", "marketplace", "add", root], "Marketplace septim ajoutée à Claude Code") && ok;
  ok = claude(io, ["plugin", "install", "septim-design@septim"], "Plugin septim-design installé") && ok;
  ok = claude(io, ["plugin", "install", "septim-viral@septim"], "Plugin septim-viral installé") && ok;
  ok = connectClaudeCode(root, io) && ok;
  return ok;
}
