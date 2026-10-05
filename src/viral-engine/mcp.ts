import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { checklist } from "./checklist";
import { FactoryError } from "./errors";
import type { Factory, Task } from "./factory";
import { readVersion, type McpHttpHandler } from "./server/http";

const root = () => resolve(process.env.SEPTIM_ROOT ?? process.cwd());
const MAX_WAIT_S = 240;

const PUBLISH_DESCRIPTION =
  'Publie une vidéo. N\'appelle cet outil QUE si l\'humain a écrit lui-même "OUI #<ref>" pour cette vidéo dans la conversation ; passe cette phrase telle quelle dans confirmation.';

const INSTRUCTIONS = [
  "Usine SEPTIM : vidéos virales 9:16 (TikTok, Reels, Shorts) rendues en local avec Remotion, sans crédit.",
  "Pour une vidéo : écris un script H.E.A.T (ressource septim://guide-heat), vérifie-le avec septim_lint_script jusqu'à ok:true, puis septim_create_video avec ce script.",
  "Règle absolue : ne publie jamais de toi-même. Montre la vidéo, puis attends que l'humain écrive « OUI #ref » ; alors seulement, septim_publish_video avec sa phrase dans confirmation.",
  "Aucune dépense : les options PRO à crédits (Higgsfield, Runway, Pika) ne se lancent jamais d'ici.",
].join("\n");

// Champs décrits mais souples : un script incomplet arrive au linter, qui explique quoi corriger.
const scriptSchema = z
  .object({
    topic: z.string().optional(),
    hook: z.string().optional().describe("Phrase d'accroche dite en 3 secondes au plus, qui implique le spectateur."),
    beats: z
      .array(z.object({ text: z.string(), emphasis: z.string().optional().describe("Mot du beat mis en valeur à l'écran.") }))
      .optional()
      .describe("Beats de 3 secondes au plus chacun ; un changement visuel par beat."),
    payoff: z.string().optional().describe("La réponse promise par le hook, donnée à 80 % de la vidéo ou plus."),
    cta: z.string().optional(),
    caption: z.string().optional().describe("Légende du post."),
    hashtags: z.array(z.string()).optional(),
  })
  .loose()
  .describe("Script H.E.A.T. Format complet : ressource septim://guide-heat.");

const template = z.enum(["story", "maths", "film"]).optional().describe("story (histoire), maths (calcul qui surprend) ou film (récit en chapitres). Absent : l'usine choisit.");
const lang = z.enum(["fr", "en"]).optional();
const ref = z.string().min(1).describe("Référence de la vidéo : 4 caractères suffisent (« 5f8a » ou « #5F8A »).");

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const ok = (data: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });

// Les erreurs métier deviennent un résultat isError lisible par le modèle (code + message + détails).
async function run(fn: () => unknown | Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (error) {
    const e = error instanceof FactoryError ? { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) } : { code: "internal", message: (error as Error).message };
    return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: e }, null, 2) }] };
  }
}

async function waitForTask(factory: Factory, id: string, seconds: number): Promise<Task> {
  const deadline = Date.now() + seconds * 1000;
  let task = factory.getTask(id);
  while ((task.status === "queued" || task.status === "running") && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
    task = factory.getTask(id);
  }
  return task;
}

export function createMcpServer(factory: Factory): McpServer {
  const server = new McpServer({ name: "septim", title: "SEPTIM — usine à vidéos virales", version: readVersion(root()) }, { instructions: INSTRUCTIONS });

  server.registerTool(
    "septim_create_video",
    {
      title: "Fabriquer une vidéo",
      description:
        "Fabrique une vidéo virale 9:16 (rendu gratuit, environ 2 minutes). Avec un script vérifié par septim_lint_script, c'est ce script qui est rendu ; sans script, l'usine l'écrit. " +
        `Renvoie la tâche ; avec wait_seconds (≤ ${MAX_WAIT_S}), attend la fin et renvoie aussi la vidéo. Ne publie rien.`,
      inputSchema: {
        topic: z.string().max(500).optional().describe("Sujet. Absent : la tendance du jour."),
        template,
        lang,
        script: scriptSchema.optional(),
        wait_seconds: z.number().int().min(0).max(MAX_WAIT_S).optional().describe("Attendre la fin du rendu, en secondes (0 : rendre la main tout de suite)."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    ({ topic, template, lang, script, wait_seconds }) =>
      run(async () => {
        const task = factory.createVideo({ topic, template, lang, script: script as never });
        if (!wait_seconds) return { task, next: `Suis la tâche avec septim_get_task {"id":"${task.id}"}.` };
        const done = await waitForTask(factory, task.id, wait_seconds);
        const video = done.status === "done" && done.ref ? factory.getVideo(done.jobId ?? done.ref) : undefined;
        return {
          task: done,
          video,
          next: video ? `Montre la vidéo à l'humain. Pour publier, il doit écrire lui-même « OUI #${video.ref} ».` : done.status === "failed" ? "Le rendu a échoué : lis task.error." : `Rendu encore en cours : septim_get_task {"id":"${task.id}"}.`,
        };
      }),
  );

  server.registerTool(
    "septim_get_task",
    { title: "Suivre une tâche", description: "État d'une tâche de fabrication : queued, running, done (avec ref) ou failed (avec error).", inputSchema: { id: z.string().min(1) }, annotations: { readOnlyHint: true } },
    ({ id }) => run(() => factory.getTask(id)),
  );

  server.registerTool(
    "septim_list_videos",
    {
      title: "Lister les vidéos",
      description: "Les vidéos de l'usine, la plus récente d'abord.",
      inputSchema: {
        status: z.enum(["rendered", "notified", "publishing", "published", "rejected", "failed"]).optional().describe("notified = prête, en attente de OUI."),
        limit: z.number().int().min(1).max(100).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    ({ status, limit }) => run(() => ({ videos: factory.listVideos({ status, limit }) })),
  );

  server.registerTool(
    "septim_get_video",
    { title: "Voir une vidéo", description: "Détail d'une vidéo : hook, durée, voix, légende, hashtags, script, statut, chemin du MP4.", inputSchema: { ref }, annotations: { readOnlyHint: true } },
    ({ ref }) => run(() => factory.getVideo(ref)),
  );

  server.registerTool(
    "septim_lint_script",
    {
      title: "Vérifier un script",
      description: "Vérifie un script avec les règles virales (hook ≤ 3 s, beats ≤ 3 s, réponse à ≥ 80 %, durée cible) sans rien fabriquer. Corrige jusqu'à ok:true.",
      inputSchema: { script: scriptSchema, topic: z.string().optional(), template, lang },
      annotations: { readOnlyHint: true },
    },
    ({ script, topic, template, lang }) => run(() => factory.lintScript(script, { topic, template, lang })),
  );

  server.registerTool(
    "septim_publish_video",
    {
      title: "Publier une vidéo",
      description: PUBLISH_DESCRIPTION,
      inputSchema: { ref, confirmation: z.string().describe('La phrase de l\'humain, telle quelle : "OUI #<ref>".') },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    ({ ref, confirmation }) => run(() => factory.publish(ref, confirmation)),
  );

  server.registerTool(
    "septim_reject_video",
    { title: "Jeter une vidéo", description: "Jette une vidéo (elle ne sera jamais publiée).", inputSchema: { ref }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } },
    ({ ref }) => run(() => factory.reject(ref)),
  );

  server.registerTool(
    "septim_doctor",
    { title: "Diagnostic", description: "État de l'usine (voix, script automatique, publication, messages) et commandes pour installer ce qui manque.", annotations: { readOnlyHint: true } },
    () => run(() => factory.doctor()),
  );

  server.registerTool(
    "septim_lessons",
    { title: "Ce qui marche", description: "Leçons apprises des vues à 48 h (LESSONS.md) et classement des couples template × formule de hook.", annotations: { readOnlyHint: true } },
    () => run(() => factory.lessons()),
  );

  server.registerResource(
    "checklist",
    "septim://checklist",
    { title: "Checklist virale", description: "Toutes les règles virales chiffrées (viral-checklist.json).", mimeType: "application/json" },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(checklist, null, 2) }] }),
  );

  server.registerResource(
    "guide-heat",
    "septim://guide-heat",
    { title: "Guide H.E.A.T", description: "Format du script et règles d'écriture (hook, beats, réponse, légende).", mimeType: "text/markdown" },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: readFileSync(resolve(root(), "plugins/septim-viral/skills/viral/references/heat.md"), "utf8") }],
    }),
  );

  server.registerPrompt(
    "nouvelle_video",
    { title: "Nouvelle vidéo virale", description: "Écrire, vérifier et fabriquer une vidéo virale sur un sujet.", argsSchema: { sujet: z.string().describe("Le sujet, par exemple « la tontine »." ) } },
    ({ sujet }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Fabrique une vidéo virale sur « ${sujet} » avec l'usine SEPTIM.`,
              "1. Lis les ressources septim://guide-heat et septim://checklist.",
              "2. Écris le script H.E.A.T : un hook de 3 secondes au plus qui implique le spectateur, des beats de 3 secondes au plus, la réponse à 80 % de la vidéo ou plus, une légende et des hashtags.",
              "3. Vérifie-le avec septim_lint_script et corrige jusqu'à ok:true.",
              "4. Lance septim_create_video avec ce script et wait_seconds: 240.",
              "5. Montre-moi le hook, la durée, la légende et la référence.",
              "Ne publie rien toi-même : je publierai en écrivant « OUI #ref ». Alors seulement, appelle septim_publish_video avec ma phrase telle quelle dans confirmation.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  return server;
}

// stdio : stdout appartient au protocole. Tout ce qui s'affiche part sur stderr.
export async function runStdio(factory: Factory): Promise<void> {
  console.log = (...args: unknown[]) => console.error(...args);
  console.info = (...args: unknown[]) => console.error(...args);
  const server = createMcpServer(factory);
  await server.connect(new StdioServerTransport());
}

// HTTP sans état : un serveur et un transport par requête, comme le recommande le SDK pour une API simple.
export function mcpHttpHandler(factory: Factory): McpHttpHandler {
  return async (req, res, body) => {
    if (req.method !== "POST") {
      res
        .writeHead(405, { Allow: "POST", "Content-Type": "application/json" })
        .end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Serveur MCP sans état : POST seulement." }, id: null }));
      return;
    }
    const server = createMcpServer(factory);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  };
}
