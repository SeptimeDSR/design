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

type Run = (cmd: string, args: string[]) => number;
const inherit: Run = (cmd, args) => spawnSync(cmd, args, { stdio: "inherit" }).status ?? 1;

// septim setup --voix : Piper (voix gratuite, locale) dans un venv de l'usine, puis la voix française.
// pip --user est refusé par Ubuntu 23+ et Debian 12 (PEP 668) : un venv marche partout, sans sudo.
export function installVoice(home: string, io: IO, opts: { voice?: string; run?: Run } = {}): boolean {
  const run = opts.run ?? inherit;
  const voice = opts.voice ?? process.env.VIRAL_PIPER_VOICE ?? "fr_FR-tom-medium";
  const venv = join(home, "venv");
  const py = join(venv, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  if (run("python3", ["-m", "venv", venv]) !== 0) {
    io.err.write("✗ Impossible de créer le venv Python. Sur Ubuntu/WSL : sudo apt install python3-venv, puis relance septim setup --voix.\n");
    return false;
  }
  if (run(py, ["-m", "pip", "install", "--upgrade", "piper-tts"]) !== 0) {
    io.err.write("✗ pip n'a pas pu installer piper-tts (réseau ?). Relance septim setup --voix.\n");
    return false;
  }
  if (run(py, ["-m", "piper.download_voices", voice, "--data-dir", join(home, "voices")]) !== 0) {
    io.err.write(`✗ Téléchargement de la voix ${voice} raté. Relance septim setup --voix.\n`);
    return false;
  }
  say(io, `✓ Voix ${voice} installée (Piper, gratuite) : les prochaines vidéos parlent.`);
  return true;
}
