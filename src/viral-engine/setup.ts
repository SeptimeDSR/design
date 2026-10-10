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

// Une étape d'installation : la même liste sert à `septim setup` (terminal) et aux boutons du Studio.
export type InstallStep = { label: string; cmd: string; args: string[]; hint: string };

const venvPython = (home: string) => join(home, "venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");

// pip --user est refusé par Ubuntu 23+ et Debian 12 (PEP 668) : un venv marche partout, sans sudo.
const venvStep = (home: string, flag: string): InstallStep => ({
  label: "Environnement Python",
  cmd: "python3",
  args: ["-m", "venv", join(home, "venv")],
  hint: `Impossible de créer le venv Python. Sur Ubuntu/WSL : sudo apt install python3-venv, puis relance septim setup ${flag}.`,
});

// Piper : voix gratuite, locale, dans un venv de l'usine, puis la voix française.
export function voiceSteps(home: string, voice = process.env.VIRAL_PIPER_VOICE ?? "fr_FR-tom-medium"): InstallStep[] {
  const py = venvPython(home);
  return [
    venvStep(home, "--voix"),
    { label: "Piper (voix gratuite)", cmd: py, args: ["-m", "pip", "install", "--upgrade", "piper-tts"], hint: "pip n'a pas pu installer piper-tts (réseau ?). Relance l'installation." },
    { label: `Voix ${voice}`, cmd: py, args: ["-m", "piper.download_voices", voice, "--data-dir", join(home, "voices")], hint: `Téléchargement de la voix ${voice} raté (réseau ?). Relance l'installation.` },
  ];
}

// Chatterbox Multilingual (licence MIT, français, clonage de ta voix) dans le même venv.
export function voiceHdSteps(home: string): InstallStep[] {
  return [
    venvStep(home, "--voix-hd"),
    {
      label: "Chatterbox (voix HD)",
      cmd: venvPython(home),
      args: ["-m", "pip", "install", "--upgrade", "chatterbox-tts"],
      hint: "pip n'a pas pu installer chatterbox-tts (plusieurs Go avec torch : réseau, ou place disque ?). Relance l'installation.",
    },
  ];
}

function runSteps(steps: InstallStep[], io: IO, run: Run): boolean {
  for (const step of steps) {
    if (run(step.cmd, step.args) !== 0) {
      io.err.write(`✗ ${step.hint.replace(/Relance l'installation\./, "Relance septim setup.")}\n`);
      return false;
    }
  }
  return true;
}

// septim setup --voix
export function installVoice(home: string, io: IO, opts: { voice?: string; run?: Run } = {}): boolean {
  const voice = opts.voice ?? process.env.VIRAL_PIPER_VOICE ?? "fr_FR-tom-medium";
  if (!runSteps(voiceSteps(home, voice), io, opts.run ?? inherit)) return false;
  say(io, `✓ Voix ${voice} installée (Piper, gratuite) : les prochaines vidéos parlent.`);
  return true;
}

// septim setup --voix-hd
export function installVoiceHd(home: string, io: IO, opts: { run?: Run } = {}): boolean {
  if (!runSteps(voiceHdSteps(home), io, opts.run ?? inherit)) return false;
  say(io, "✓ Voix HD installée (Chatterbox Multilingual, gratuite). Active-la : echo VIRAL_TTS=chatterbox >> .env");
  say(io, "  Ta propre voix : enregistre 10 s propres en WAV, puis echo VIRAL_CHATTERBOX_VOICE=/chemin/voix.wav >> .env");
  return true;
}
