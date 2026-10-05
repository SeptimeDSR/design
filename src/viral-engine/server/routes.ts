import { createReadStream, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { FactoryError } from "../errors";
import type { Factory, VideoDetail } from "../factory";
import type { JobStatus } from "../store";
import { TEMPLATES, type Lang, type TemplateId } from "../types";
import { openapi } from "./openapi";

export type RouteContext = {
  factory: Factory;
  params: Record<string, string>;
  query: URLSearchParams;
  body: Record<string, unknown>;
  req: IncomingMessage;
  res: ServerResponse;
  baseUrl: string;
  version: string;
};

// Une réponse JSON, ou « handled » quand la route a écrit elle-même (flux vidéo).
export type Reply = { status?: number; json: unknown } | "handled";

type Route = {
  method: "GET" | "POST";
  path: string;
  // Sans token : seulement la santé et le contrat (rien de privé, utiles pour brancher un outil).
  public?: boolean;
  // Une balise <video> ne peut pas envoyer d'en-tête Authorization : le token passe alors en ?token=.
  tokenInQuery?: boolean;
  handle: (c: RouteContext) => Reply | Promise<Reply>;
};

const STATUSES: JobStatus[] = ["rendered", "notified", "publishing", "published", "rejected", "failed"];
// Les mots du Studio et du terminal marchent aussi dans l'API.
const STATUS_FR: Record<string, JobStatus> = { "a-valider": "notified", prete: "notified", publiee: "published", jetee: "rejected", ratee: "failed" };

const bad = (message: string) => new FactoryError("bad_request", message);

const optionalString = (v: unknown, name: string): string | undefined => {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw bad(`${name} doit être un texte.`);
  return v;
};

function options(body: Record<string, unknown>) {
  const template = optionalString(body.template, "template");
  if (template !== undefined && !TEMPLATES.includes(template as TemplateId)) throw bad(`template doit valoir ${TEMPLATES.join(", ")}.`);
  const lang = optionalString(body.lang, "lang");
  if (lang !== undefined && lang !== "fr" && lang !== "en") throw bad("lang doit valoir fr ou en.");
  return { topic: optionalString(body.topic, "topic"), template: template as TemplateId | undefined, lang: lang as Lang | undefined };
}

const withUrl = (v: VideoDetail) => ({ ...v, videoUrl: v.hasVideo ? `/api/v1/videos/${v.id}/video` : undefined });

// bytes=0-99, bytes=100-, bytes=-500. Plusieurs plages : on sert tout le fichier (permis par la RFC 9110).
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | "unsatisfiable" | undefined {
  const m = header?.trim().match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (!m[1] && !m[2])) return undefined;
  if (!m[1]) {
    const suffix = Number(m[2]);
    if (suffix === 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(m[1]);
  const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
}

function streamVideo(c: RouteContext): Reply {
  const file = c.factory.videoFile(c.params.ref);
  let size: number;
  try {
    size = statSync(file).size;
  } catch {
    throw new FactoryError("not_found", "Le fichier vidéo n'existe plus.");
  }
  const range = parseRange(c.req.headers.range, size);
  const headers = { "Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Cache-Control": "no-cache" };
  if (range === "unsatisfiable") {
    c.res.writeHead(416, { ...headers, "Content-Range": `bytes */${size}`, "Content-Length": 0 }).end();
    return "handled";
  }
  const { start, end } = range ?? { start: 0, end: size - 1 };
  c.res.writeHead(range ? 206 : 200, {
    ...headers,
    "Content-Length": size === 0 ? 0 : end - start + 1,
    ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
  });
  if (size === 0) {
    c.res.end();
    return "handled";
  }
  createReadStream(file, { start, end })
    .on("error", () => c.res.destroy())
    .pipe(c.res);
  return "handled";
}

const API: Route[] = [
  { method: "GET", path: "/api/v1/health", public: true, handle: (c) => ({ json: { ok: true, version: c.version } }) },
  { method: "GET", path: "/api/v1/openapi.json", public: true, handle: (c) => ({ json: { ...openapi, info: { ...openapi.info, version: c.version }, servers: [{ url: c.baseUrl }] } }) },
  { method: "GET", path: "/api/v1/doctor", handle: async (c) => ({ json: await c.factory.doctor() }) },
  {
    method: "GET",
    path: "/api/v1/videos",
    handle: (c) => {
      const rawStatus = c.query.get("status") || undefined;
      const status = rawStatus ? (STATUS_FR[rawStatus] ?? rawStatus) : undefined;
      if (status && !STATUSES.includes(status as JobStatus)) throw bad(`status doit valoir ${[...Object.keys(STATUS_FR), ...STATUSES].join(", ")}.`);
      const rawLimit = c.query.get("limit");
      if (rawLimit !== null && !/^\d+$/.test(rawLimit)) throw bad("limit doit être un entier entre 1 et 100.");
      const limit = rawLimit === null ? undefined : Number(rawLimit);
      return { json: { videos: c.factory.listVideos({ status: status as JobStatus | undefined, limit }) } };
    },
  },
  {
    method: "POST",
    path: "/api/v1/videos",
    handle: (c) => {
      const script = c.body.script;
      if (script !== undefined && (typeof script !== "object" || script === null || Array.isArray(script))) throw bad("script doit être un objet JSON.");
      return { status: 202, json: c.factory.createVideo({ ...options(c.body), script: script as never }) };
    },
  },
  { method: "GET", path: "/api/v1/videos/:ref", handle: (c) => ({ json: withUrl(c.factory.getVideo(c.params.ref)) }) },
  { method: "GET", path: "/api/v1/videos/:ref/video", tokenInQuery: true, handle: streamVideo },
  {
    method: "POST",
    path: "/api/v1/videos/:ref/publish",
    handle: async (c) => {
      // « confirmation » (le nom du MCP) est accepté aussi : la phrase compte, pas le nom du champ.
      const confirm = optionalString(c.body.confirm, "confirm") ?? optionalString(c.body.confirmation, "confirmation");
      if (!confirm) {
        const ref = c.factory.getVideo(c.params.ref).ref;
        throw new FactoryError("confirmation_required", `Champ confirm absent : envoie {"confirm": "OUI #${ref}"}, la phrase écrite par l'humain.`, { expected: `OUI #${ref}` });
      }
      return { json: await c.factory.publish(c.params.ref, confirm) };
    },
  },
  { method: "POST", path: "/api/v1/videos/:ref/reject", handle: (c) => ({ json: c.factory.reject(c.params.ref) }) },
  { method: "POST", path: "/api/v1/videos/:ref/redo", handle: (c) => ({ status: 202, json: c.factory.redo(c.params.ref) }) },
  { method: "GET", path: "/api/v1/tasks", handle: (c) => ({ json: { tasks: c.factory.listTasks() } }) },
  { method: "GET", path: "/api/v1/tasks/:id", handle: (c) => ({ json: c.factory.getTask(c.params.id) }) },
  {
    method: "POST",
    path: "/api/v1/lint",
    handle: (c) => {
      const { topic, template, lang } = options(c.body);
      return { json: c.factory.lintScript(c.body.script, { topic, template, lang }) };
    },
  },
  { method: "GET", path: "/api/v1/lessons", handle: (c) => ({ json: c.factory.lessons() }) },
];

// La table du routeur, exportée pour vérifier qu'elle et le contrat OpenAPI disent la même chose.
export const ROUTES: { method: string; path: string }[] = API.map(({ method, path }) => ({ method, path }));

export function matchRoute(method: string, pathname: string): { route: Route; params: Record<string, string> } | undefined {
  const parts = pathname.split("/");
  for (const route of API) {
    if (route.method !== method) continue;
    const want = route.path.split("/");
    if (want.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < want.length && ok; i++) {
      if (want[i].startsWith(":")) {
        try {
          params[want[i].slice(1)] = decodeURIComponent(parts[i]);
        } catch {
          throw bad("Adresse mal encodée.");
        }
        ok = params[want[i].slice(1)].length > 0;
      } else ok = want[i] === parts[i];
    }
    if (ok) return { route, params };
  }
  return undefined;
}
