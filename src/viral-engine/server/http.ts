import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { FactoryError } from "../errors";
import type { Factory } from "../factory";
import { LockTimeout } from "../lock";
import { matchRoute } from "./routes";
import { serveStatic } from "./static";

export type McpHttpHandler = (req: IncomingMessage, res: ServerResponse, body: unknown) => Promise<void>;

export type ServerOptions = {
  factory: Factory;
  port?: number;
  host?: string;
  token?: string;
  corsOrigins?: string[];
  mcp?: McpHttpHandler;
  // Dossier du repo (Studio, police, package.json). Par défaut : SEPTIM_ROOT, sinon le dossier courant.
  root?: string;
};

export type RunningServer = { url: string; port: number; close(): Promise<void> };

const MAX_BODY = 1024 * 1024;
const LOOPBACK_NAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);
const CSP = "default-src 'self'; img-src 'self' data:; media-src 'self'; font-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

export const isLoopback = (host: string) => host === "localhost" || host === "::1" || host === "[::1]" || /^127\.\d+\.\d+\.\d+$/.test(host);

const digest = (s: string) => createHash("sha256").update(s).digest();
const sameToken = (given: string, token: string) => timingSafeEqual(digest(given), digest(token));

function sendJson(res: ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-store" }).end(body);
}

function sendError(res: ServerResponse, error: unknown) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  if (error instanceof FactoryError) {
    sendJson(res, error.status, { error: { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) } });
  } else if (error instanceof LockTimeout) {
    sendJson(res, 409, { error: { code: "conflict", message: "L'usine est occupée par une autre porte, réessaie dans un instant." } });
  } else {
    console.error("[serveur]", error);
    sendJson(res, 500, { error: { code: "internal", message: (error as Error)?.message ?? "Erreur interne." } });
  }
}

// Corps limité à 1 Mo. Au-delà, on lit sans garder (pour pouvoir répondre 413 proprement), puis on coupe si ça continue.
function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= MAX_BODY) chunks.push(chunk);
      else if (size > MAX_BODY * 16) req.destroy();
    });
    req.on("end", () => (size > MAX_BODY ? reject(new FactoryError("payload_too_large", "Corps de requête trop gros (1 Mo maximum).")) : resolveBody(Buffer.concat(chunks))));
    req.on("error", reject);
  });
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const raw = await readBody(req);
  const type = req.headers["content-type"];
  const isJson = !!type && /^application\/json\s*(;|$)/i.test(type);
  if (raw.length === 0 && (!type || isJson)) return {};
  if (!isJson) throw new FactoryError("unsupported_media_type", "Envoie le corps en JSON (Content-Type: application/json).");
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    throw new FactoryError("bad_request", "JSON invalide.");
  }
}

const asObject = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new FactoryError("bad_request", "Le corps doit être un objet JSON.");
  return v as Record<string, unknown>;
};

function readVersion(root: string): string {
  try {
    return JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

// Serveur local de l'usine : Studio, API REST, contrat OpenAPI et MCP HTTP sur un seul port.
export async function startServer(opts: ServerOptions): Promise<RunningServer> {
  const host = opts.host ?? "127.0.0.1";
  const token = opts.token?.trim() || undefined;
  if (!isLoopback(host) && !token) {
    throw new FactoryError(
      "forbidden",
      `Écouter sur ${host} ouvre l'usine au réseau : définis d'abord SEPTIM_TOKEN (par exemple SEPTIM_TOKEN=$(openssl rand -hex 16) dans .env), ou reste sur 127.0.0.1.`,
    );
  }
  const root = resolve(opts.root ?? process.env.SEPTIM_ROOT ?? process.cwd());
  const version = readVersion(root);
  const cors = new Set((opts.corsOrigins ?? []).map((o) => o.trim().replace(/\/+$/, "")).filter(Boolean));
  let port = opts.port ?? 4321;

  // Sans token, seul un nom local est accepté : un site qui fait pointer son domaine sur 127.0.0.1 (DNS rebinding) est refusé.
  // Avec token, tout hôte passe (Wi-Fi, tunnel) : sans le token, il ne peut rien lire ni lancer.
  const hostAllowed = (header: string | undefined) => {
    if (token) return true;
    if (!header) return false;
    try {
      const u = new URL(`http://${header}`);
      return LOOPBACK_NAMES.has(u.hostname) && (u.port === String(port) || (u.port === "" && port === 80));
    } catch {
      return false;
    }
  };

  const originAllowed = (origin: string, hostHeader: string | undefined) => {
    if (cors.has(origin)) return true;
    try {
      return new URL(origin).host === hostHeader;
    } catch {
      return false;
    }
  };

  const authorized = (req: IncomingMessage, query?: URLSearchParams) => {
    if (!token) return true;
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? "");
    const given = m?.[1]?.trim() ?? query?.get("token") ?? "";
    return given.length > 0 && sameToken(given, token);
  };

  async function handle(req: IncomingMessage, res: ServerResponse) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Content-Security-Policy", CSP);

    if (!hostAllowed(req.headers.host)) throw new FactoryError("forbidden", "Hôte refusé. Ouvre l'usine par http://127.0.0.1 ou http://localhost (ou définis SEPTIM_TOKEN pour l'ouvrir au réseau).");
    const origin = req.headers.origin;
    if (origin !== undefined) {
      if (!originAllowed(origin, req.headers.host)) throw new FactoryError("forbidden", `Origine refusée : ${origin}. Ajoute-la à SEPTIM_CORS_ORIGINS si c'est un outil à toi.`);
      if (cors.has(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, Content-Range");
      }
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, Range, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
        "Access-Control-Max-Age": "600",
      });
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", "http://septim.local");
    const { pathname } = url;

    if (pathname === "/" || pathname === "/index.html" || pathname.startsWith("/studio/")) {
      if (req.method === "GET" || req.method === "HEAD") {
        if (serveStatic(pathname, res, root)) return;
      }
      throw new FactoryError("not_found", `Rien ici : ${pathname}.`);
    }

    if (pathname === "/mcp") {
      if (!opts.mcp) throw new FactoryError("not_found", "Le MCP HTTP n'est pas branché sur ce serveur.");
      if (!authorized(req)) throw new FactoryError("unauthorized", "Token requis : Authorization: Bearer <SEPTIM_TOKEN>.");
      const body = req.method === "POST" ? await readJson(req) : undefined;
      await opts.mcp(req, res, body);
      return;
    }

    const match = matchRoute(req.method ?? "GET", pathname);
    if (!match) throw new FactoryError("not_found", `Route inconnue : ${req.method} ${pathname}. La liste est dans /api/v1/openapi.json.`);
    const { route, params } = match;
    if (!route.public && !authorized(req, route.tokenInQuery ? url.searchParams : undefined)) {
      throw new FactoryError("unauthorized", "Token requis : Authorization: Bearer <SEPTIM_TOKEN>.");
    }
    const body = route.method === "POST" ? asObject(await readJson(req)) : {};
    const reply = await route.handle({
      factory: opts.factory,
      params,
      query: url.searchParams,
      body,
      req,
      res,
      baseUrl: `http://${req.headers.host ?? `127.0.0.1:${port}`}`,
      version,
    });
    if (reply !== "handled") sendJson(res, reply.status ?? 200, reply.json);
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((error) => {
      // Corps non lu (requête refusée avant lecture) : on le vide pour que le client reçoive la réponse.
      if (!req.complete) req.resume();
      sendError(res, error);
    });
  });

  await new Promise<void>((done, fail) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.off("listening", onListening);
      if (error.code === "EADDRINUSE") fail(new FactoryError("conflict", `Le port ${port} est déjà pris (une usine tourne déjà ?). Choisis-en un autre : --port ${port + 1}.`));
      else if (error.code === "EACCES") fail(new FactoryError("forbidden", `Le port ${port} demande des droits administrateur. Choisis un port au-dessus de 1024 : --port 4321.`));
      else fail(error);
    };
    const onListening = () => {
      server.off("error", onError);
      done();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
  port = (server.address() as { port: number }).port;
  const shown = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;

  return {
    url: `http://${shown}:${port}`,
    port,
    close: () =>
      new Promise<void>((done) => {
        server.close(() => done());
        server.closeAllConnections();
      }),
  };
}
