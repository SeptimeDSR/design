import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const MCP_CLIENTS = ["claude-code", "claude-desktop", "cursor", "vscode", "windsurf", "codex", "gemini"] as const;
export type McpClient = (typeof MCP_CLIENTS)[number];

export const CLIENT_NAMES: Record<McpClient, string> = {
  "claude-code": "Claude Code",
  "claude-desktop": "Claude Desktop",
  cursor: "Cursor",
  vscode: "VS Code",
  windsurf: "Windsurf",
  codex: "Codex",
  gemini: "Gemini CLI",
};

export type ConnectOptions = { root: string; node: string; home?: string; platform?: NodeJS.Platform; appData?: string };
export type McpConfig = { path: string; content: string; command?: string[] };

// Les apps de bureau (Claude Desktop, VS Code) ne voient pas le PATH de nvm : chemins absolus partout.
const server = (o: ConnectOptions) => ({ command: o.node, args: [join(o.root, "bin", "septim.mjs"), "mcp"] });

function appDir(o: ConnectOptions, app: string): string {
  const home = o.home ?? homedir();
  const platform = o.platform ?? process.platform;
  if (platform === "darwin") return join(home, "Library", "Application Support", app);
  if (platform === "win32") return join(o.appData ?? process.env.APPDATA ?? join(home, "AppData", "Roaming"), app);
  return join(home, ".config", app);
}

export const isMcpClient = (c: string): c is McpClient => (MCP_CLIENTS as readonly string[]).includes(c);

export function mcpConfig(client: McpClient, o: ConnectOptions): McpConfig {
  const home = o.home ?? homedir();
  const s = server(o);
  const json = (path: string, key: "mcpServers" | "servers", entry: object) => ({ path, content: JSON.stringify({ [key]: { septim: entry } }, null, 2) });
  switch (client) {
    case "claude-code":
      return {
        path: join(home, ".claude.json"),
        content: ["claude", "mcp", "add", "--scope", "user", "septim", "--", s.command, ...s.args].join(" "),
        command: ["claude", "mcp", "add", "--scope", "user", "septim", "--", s.command, ...s.args],
      };
    case "claude-desktop":
      return json(join(appDir(o, "Claude"), "claude_desktop_config.json"), "mcpServers", s);
    case "cursor":
      return json(join(home, ".cursor", "mcp.json"), "mcpServers", s);
    case "vscode":
      return json(join(appDir(o, "Code"), "User", "mcp.json"), "servers", { type: "stdio", ...s });
    case "windsurf":
      return json(join(home, ".codeium", "windsurf", "mcp_config.json"), "mcpServers", s);
    case "gemini":
      return json(join(home, ".gemini", "settings.json"), "mcpServers", s);
    case "codex":
      return {
        path: join(home, ".codex", "config.toml"),
        // Une chaîne JSON est une chaîne TOML valide (mêmes échappements, y compris les \ de Windows).
        content: `[mcp_servers.septim]\ncommand = ${JSON.stringify(s.command)}\nargs = [${s.args.map((a) => JSON.stringify(a)).join(", ")}]\n`,
      };
  }
}

// Retire le bloc [mcp_servers.septim] (et ses sous-tables) d'un config.toml, sans toucher au reste.
function withoutSeptim(toml: string): string {
  const out: string[] = [];
  let skipping = false;
  for (const l of toml.split("\n")) {
    // [table], [[tableau]], commentaire en fin de ligne, clé entre guillemets : tout en-tête ferme le bloc précédent.
    const m = l.match(/^\s*(\[\[?)\s*([^\]]+?)\s*\]\]?\s*(#.*)?$/);
    if (m) {
      const header = m[2].replace(/\s*\.\s*/g, ".").replace(/"septim"/g, "septim");
      skipping = m[1] === "[" && (header === "mcp_servers.septim" || header.startsWith("mcp_servers.septim."));
    }
    if (!skipping) out.push(l);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

// Le fichier d'un autre logiciel : copie .bak, écriture atomique, mêmes droits, et un lien symbolique (dotfiles) reste un lien.
function safeWrite(path: string, content: string): void {
  const target = existsSync(path) ? realpathSync(path) : path;
  const mode = existsSync(target) ? statSync(target).mode & 0o777 : 0o644;
  if (existsSync(target)) copyFileSync(target, `${target}.bak`);
  const tmp = `${target}.${process.pid}.${randomBytes(3).toString("hex")}.tmp`;
  writeFileSync(tmp, content, { mode });
  renameSync(tmp, target);
}

// Écrit la configuration en gardant les autres serveurs et réglages. Un fichier illisible n'est jamais écrasé.
export function writeMcpConfig(client: Exclude<McpClient, "claude-code">, o: ConnectOptions): string {
  const c = mcpConfig(client, o);
  mkdirSync(dirname(c.path), { recursive: true });
  if (client === "codex") {
    const before = existsSync(c.path) ? readFileSync(c.path, "utf8") : "";
    const kept = withoutSeptim(before);
    safeWrite(c.path, `${kept ? `${kept}\n\n` : ""}${c.content}`);
    return c.path;
  }
  let current: Record<string, unknown> = {};
  if (existsSync(c.path)) {
    const raw = readFileSync(c.path, "utf8");
    try {
      current = raw.trim() ? JSON.parse(raw) : {};
    } catch {
      throw new Error(`${c.path} est illisible (JSON invalide) : je n'y touche pas. Corrige-le, ou ajoute à la main :\n${c.content}`);
    }
  }
  const key = client === "vscode" ? "servers" : "mcpServers";
  const entry = (JSON.parse(c.content) as Record<string, Record<string, unknown>>)[key].septim;
  const servers = (current[key] && typeof current[key] === "object" ? current[key] : {}) as Record<string, unknown>;
  safeWrite(c.path, `${JSON.stringify({ ...current, [key]: { ...servers, septim: entry } }, null, 2)}\n`);
  return c.path;
}

// Dans Docker : le conteneur ne voit ni claude, ni les fichiers de ton PC. On branche par l'adresse HTTP de l'usine,
// avec le token en en-tête (le même que celui du Studio).
export function dockerMcpConfig(client: McpClient, o: { url: string; token: string }): McpConfig {
  const auth = `Bearer ${o.token}`;
  const remote = { url: o.url, headers: { Authorization: auth } };
  switch (client) {
    case "claude-code":
      return { path: "", content: `claude mcp add --transport http --scope user septim ${o.url} --header "Authorization: ${auth}"` };
    case "cursor":
      return { path: join(homedir(), ".cursor", "mcp.json"), content: JSON.stringify({ mcpServers: { septim: remote } }, null, 2) };
    case "vscode":
      return { path: "mcp.json (profil utilisateur de VS Code)", content: JSON.stringify({ servers: { septim: { type: "http", ...remote } } }, null, 2) };
    case "windsurf":
      return { path: join(homedir(), ".codeium", "windsurf", "mcp_config.json"), content: JSON.stringify({ mcpServers: { septim: { serverUrl: o.url, headers: { Authorization: auth } } } }, null, 2) };
    case "gemini":
      return { path: join(homedir(), ".gemini", "settings.json"), content: JSON.stringify({ mcpServers: { septim: { httpUrl: o.url, headers: { Authorization: auth } } } }, null, 2) };
    default:
      // Claude Desktop, Codex : pas de serveur distant avec en-tête en configuration directe ; l'adresse et l'en-tête suffisent à un pont (mcp-remote).
      return { path: "", content: `Adresse MCP : ${o.url}\nEn-tête     : Authorization: ${auth}\nPont possible : npx mcp-remote ${o.url} --header "Authorization: ${auth}"` };
  }
}
