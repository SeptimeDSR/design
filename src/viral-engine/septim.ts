import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { runCli, userPath, type CliIO } from "./cli";
import { loadDotEnv } from "./config";
import { CLIENT_NAMES, isMcpClient, MCP_CLIENTS, mcpConfig, writeMcpConfig } from "./connect";
import { formatDiagnosis } from "./doctor";
import { FactoryError } from "./errors";
import { createFactory, type VideoDetail, type VideoSummary } from "./factory";
import { connectClaudeCode, installVoice, installVoiceHd, setup } from "./setup";
import type { JobStatus } from "./store";
import { attachWebhooks, flushWebhooks } from "./webhooks";

export { MCP_CLIENTS, mcpConfig, writeMcpConfig };

export const HELP = `SEPTIM — l'usine à vidéos virales, depuis le terminal

Fabriquer une vidéo
  septim video "la tontine" [--template story|maths|film] [--lang fr|en] [--script script.json] [--broll dossier] [--no-notify]
  septim lint script.json [--template maths] [--lang fr]     vérifier un script sans rien rendre

Regarder et décider
  septim videos [--status a-valider|publiee|jetee|ratee] [--limit 20]
  septim voir <ref>                   hook, légende, fichier MP4
  septim publier <ref>                publier (taper la commande vaut « OUI #ref »)
  septim jeter <ref>                  jeter

Ouvrir les portes
  septim studio [--port 4321] [--host 127.0.0.1]   Studio navigateur, API REST et MCP HTTP
  septim start                        tout, en permanence : démon, WhatsApp, cycle de 6 h, Studio, API
  septim mcp                          serveur MCP stdio (Claude, Cursor, VS Code, Windsurf, Codex, Gemini)
  septim connect <client> [--write]   brancher un assistant : ${MCP_CLIENTS.join(", ")}

Installer et réparer
  septim setup [--sans-claude] [--voix] [--voix-hd]   .env, Claude Code, voix gratuite (HD : Chatterbox), diagnostic
  septim doctor                       ce qui tourne, et les commandes pour le reste
  septim design init [dossier]        installer septim-design dans un autre projet
  septim version

Alias anglais acceptés : create, list, show, publish, reject.
Mode d'emploi complet : docs/GUIDE.md`;

const ALIASES: Record<string, string> = {
  create: "video",
  list: "videos",
  show: "voir",
  publish: "publier",
  reject: "jeter",
  help: "aide",
  "--help": "aide",
  "-h": "aide",
  "--version": "version",
  "-v": "version",
};
const COMMANDS = ["video", "lint", "videos", "voir", "publier", "jeter", "studio", "start", "mcp", "doctor", "connect", "setup", "design", "aide", "version"];

const STATUS_FR: Record<JobStatus, string> = { rendered: "Rendue", notified: "À valider", publishing: "En publication", published: "Publiée", rejected: "Jetée", failed: "Ratée" };
const STATUS_ARG: Record<string, JobStatus> = { "a-valider": "notified", prete: "notified", publiee: "published", jetee: "rejected", ratee: "failed" };
const TEMPLATES_FR: Record<string, string> = { story: "Histoire", maths: "Maths", film: "Film" };
const BROLL_FR: Record<string, string> = { comfyui: "IA locale ComfyUI (gratuit)", pexels: "Pexels (gratuit)", pixabay: "Pixabay (gratuit)", procedural: "fonds animés générés", dossier: "tes clips" };

export function parseCommand(argv: string[]): { command: string; args: string[] } {
  const [first, ...args] = argv;
  if (!first) return { command: "aide", args: [] };
  return { command: ALIASES[first] ?? first, args };
}

export const repoRoot = () => resolve(process.env.SEPTIM_ROOT ?? process.cwd());

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

const suggest = (word: string) => [...COMMANDS, ...Object.keys(ALIASES).filter((k) => !k.startsWith("-"))].sort((a, b) => distance(word, a) - distance(word, b))[0];

const seconds = (ms: number) => `${(ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`;
const when = (iso?: string) => (iso ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "");

function videoLine(v: VideoSummary): string {
  const hook = v.hook.length > 60 ? `${v.hook.slice(0, 59)}…` : v.hook;
  return `#${v.ref}  ${STATUS_FR[v.status].padEnd(14)} ${seconds(v.durationMs).padStart(7)}  ${(TEMPLATES_FR[v.template] ?? v.template).padEnd(8)} « ${hook} »  ${when(v.createdAt)}`;
}

function videoDetail(v: VideoDetail): string[] {
  const lines = [
    `#${v.ref} — ${STATUS_FR[v.status]}`,
    `« ${v.hook} »`,
    "",
    `Sujet     ${v.topic}`,
    `Template  ${TEMPLATES_FR[v.template] ?? v.template}, ${seconds(v.durationMs)}, voix ${v.voice}, script ${v.source}`,
    `Créée     ${when(v.createdAt)}${v.publishedAt ? `, publiée ${when(v.publishedAt)}` : ""}`,
    `Fichier   ${v.hasVideo ? v.videoPath : "absent du disque"}`,
    `Plans     ${BROLL_FR[v.broll?.source ?? "procedural"] ?? v.broll?.source}${v.broll?.credits.length ? `, crédits : ${[...new Set(v.broll.credits.map((c) => c.author))].join(", ")}` : ""}`,
    "",
    "Légende",
    ...v.caption.split("\n").map((l) => `  ${l}`),
    `  ${v.hashtags.join(" ")}`,
  ];
  if (v.error) lines.push("", `Erreur    ${v.error}`);
  if (v.status === "notified" || v.status === "rendered") lines.push("", `Pour publier : septim publier ${v.ref}   (ou réponds OUI #${v.ref} sur WhatsApp)`, `Pour jeter   : septim jeter ${v.ref}`);
  return lines;
}

const lanAddresses = () =>
  Object.values(networkInterfaces())
    .flat()
    .filter((a): a is NonNullable<typeof a> => !!a && a.family === "IPv4" && !a.internal)
    .map((a) => a.address);

const list = (v?: string) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);

async function studio(args: string[], io: CliIO, opts: { daemon: boolean }): Promise<"running"> {
  const { values } = parseArgs({ args, options: { port: { type: "string" }, host: { type: "string" } } });
  const env = process.env;
  const port = Number(values.port ?? (env.SEPTIM_PORT || 4321));
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new FactoryError("bad_request", `--port doit être un numéro de port (par exemple 4321), pas « ${values.port} ».`);
  const host = values.host || env.SEPTIM_HOST || "127.0.0.1";
  const { startServer } = await import("./server/http");
  const { mcpHttpHandler } = await import("./mcp");
  const factory = createFactory();
  attachWebhooks(factory, env);
  const srv = await startServer({ factory, port, host, token: env.SEPTIM_TOKEN, corsOrigins: list(env.SEPTIM_CORS_ORIGINS), mcp: mcpHttpHandler(factory), root: repoRoot() });
  const token = env.SEPTIM_TOKEN?.trim();
  const out = (t = "") => void io.out.write(`${t}\n`);
  out(`Studio SEPTIM en marche${opts.daemon ? " (avec le démon)" : ""}`);
  out(`  Navigateur : ${srv.url}${token ? `/?token=${token}` : ""}`);
  out(`  API        : ${srv.url}/api/v1   (contrat : ${srv.url}/api/v1/openapi.json)`);
  out(`  MCP HTTP   : ${srv.url}/mcp`);
  if (host === "0.0.0.0" || host === "::") for (const ip of lanAddresses()) out(`  Téléphone  : http://${ip}:${srv.port}/?token=${token}`);
  out("Ctrl+C pour arrêter.");
  const stop = () => void srv.close().then(() => process.exit(0));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  return "running";
}

async function connect(args: string[], io: CliIO): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { write: { type: "boolean", default: false } } });
  const client = positionals[0];
  if (!client || !isMcpClient(client)) {
    io.err.write(`${client ? `Client inconnu « ${client} ». ` : ""}Choisis parmi : ${MCP_CLIENTS.join(", ")}.\nExemple : septim connect claude-desktop --write\n`);
    return 1;
  }
  const root = repoRoot();
  const o = { root, node: process.execPath };
  const c = mcpConfig(client, o);
  const out = (t = "") => void io.out.write(`${t}\n`);
  if (client === "claude-code") {
    out(`Claude Code : ${c.content}`);
    return connectClaudeCode(root, io) ? 0 : 1;
  }
  if (values.write) {
    const path = writeMcpConfig(client, o);
    out(`✓ ${CLIENT_NAMES[client]} branché : ${path} (les autres serveurs sont gardés).`);
    out(`Redémarre ${CLIENT_NAMES[client]} : l'usine apparaît sous le nom « septim ».`);
    return 0;
  }
  out(`${CLIENT_NAMES[client]} : ajoute ceci dans ${c.path}`);
  out("");
  out(c.content);
  out("");
  out(`Ou laisse septim l'écrire (les autres serveurs sont gardés) : septim connect ${client} --write`);
  return 0;
}

async function dispatch(command: string, args: string[], io: CliIO): Promise<number | "running"> {
  const out = (t = "") => void io.out.write(`${t}\n`);
  const needRef = (verb: string) => {
    if (args[0]) return args[0];
    throw new FactoryError("bad_request", `Il manque la référence : septim ${verb} <ref> (4 caractères suffisent). Liste des vidéos : septim videos`);
  };
  switch (command) {
    case "aide":
      out(HELP);
      return 0;
    case "version":
      out(JSON.parse(readFileSync(join(repoRoot(), "package.json"), "utf8")).version);
      return 0;
    case "video":
      return runCli(args, io);
    case "lint": {
      const [file, ...rest] = args;
      if (!file) throw new FactoryError("bad_request", "Il manque le fichier : septim lint script.json [--template maths]");
      return runCli(["--lint-only", "--script", file, ...rest], io);
    }
    case "publier":
      return runCli(["--publish", needRef("publier")], io);
    case "videos": {
      const { values } = parseArgs({ args, options: { status: { type: "string" }, limit: { type: "string" } } });
      const status = values.status ? (STATUS_ARG[values.status] ?? (values.status as JobStatus)) : undefined;
      if (status && !(status in STATUS_FR)) throw new FactoryError("bad_request", `--status doit valoir ${Object.keys(STATUS_ARG).join(", ")}.`);
      const videos = createFactory().listVideos({ status, limit: values.limit ? Number(values.limit) : undefined });
      if (!videos.length) {
        out(status ? "Aucune vidéo avec ce statut." : 'Aucune vidéo pour l\'instant. Fabrique la première : septim video "la tontine"');
        return 0;
      }
      for (const v of videos) out(videoLine(v));
      out("");
      out("Détail : septim voir <ref>    Publier : septim publier <ref>");
      return 0;
    }
    case "voir":
      for (const l of videoDetail(createFactory().getVideo(needRef("voir")))) out(l);
      return 0;
    case "jeter": {
      const factory = createFactory();
      attachWebhooks(factory);
      const v = factory.reject(needRef("jeter"));
      await flushWebhooks();
      out(`Jetée : #${v.ref}. Elle ne sera jamais publiée.`);
      return 0;
    }
    case "doctor":
      out(formatDiagnosis(await createFactory().doctor()));
      return 0;
    case "studio":
      return studio(args, io, { daemon: false });
    case "start": {
      const { runDaemon } = await import("./daemon");
      await runDaemon();
      return "running";
    }
    case "mcp": {
      const { runStdio } = await import("./mcp");
      await runStdio(createFactory());
      return "running";
    }
    case "connect":
      return connect(args, io);
    case "setup": {
      const { values } = parseArgs({ args, options: { "sans-claude": { type: "boolean", default: false }, voix: { type: "boolean", default: false }, "voix-hd": { type: "boolean", default: false } } });
      let ok = setup(repoRoot(), io, { withClaude: !values["sans-claude"] });
      if (values.voix) ok = installVoice(createFactory().home, io) && ok;
      if (values["voix-hd"]) ok = installVoiceHd(createFactory().home, io) && ok;
      out("");
      out(formatDiagnosis(await createFactory().doctor()));
      out("");
      out("Prêt. Lance le Studio : septim studio   (mode d'emploi : docs/GUIDE.md)");
      return ok ? 0 : 1;
    }
    case "design": {
      if (args[0] !== "init") throw new FactoryError("bad_request", "Usage : septim design init [dossier]");
      const r = spawnSync(process.execPath, [join(repoRoot(), "plugins/septim-design/skills/septim-design/scripts/bootstrap.mjs")], { cwd: userPath(args[1] ?? "."), stdio: "inherit" });
      return r.status ?? 1;
    }
    default:
      io.err.write(`Commande inconnue « ${command} ». Tu voulais dire « septim ${ALIASES[suggest(command)] ?? suggest(command)} » ?\nToutes les commandes : septim aide\n`);
      return 1;
  }
}

// Point d'entrée commun : bin/septim.mjs (depuis n'importe quel dossier) et npm run septim.
export async function main(argv: string[], io: CliIO = { out: process.stdout, err: process.stderr }): Promise<number | "running"> {
  const { command, args } = parseCommand(argv);
  if (command !== "aide") loadDotEnv(join(repoRoot(), ".env"));
  try {
    return await dispatch(command, args, io);
  } catch (error) {
    io.err.write(`✗ ${(error as Error).message}\n`);
    return 1;
  }
}

if (process.argv[1]?.endsWith("septim.ts")) {
  main(process.argv.slice(2)).then((code) => {
    if (typeof code === "number") process.exit(code);
  });
}
