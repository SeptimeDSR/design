// Contrat de l'API locale SEPTIM, importable tel quel dans n8n, Make, Zapier, Postman ou Insomnia.
// Un test vérifie qu'il décrit exactement les routes du serveur (ni plus, ni moins).

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: unknown, description: string) => ({ description, content: { "application/json": { schema } } });
const error = (description: string) => json(ref("Error"), description);
const refParam = {
  name: "ref",
  in: "path",
  required: true,
  description: "Référence de la vidéo : les 4 premiers caractères suffisent (« 5f8a », « #5F8A » encodé en %235F8A).",
  schema: { type: "string" },
};
const common = {
  "401": error("Token absent ou faux (Authorization: Bearer <SEPTIM_TOKEN>)."),
  "403": error("Hôte ou origine refusés (protection DNS rebinding et CSRF)."),
};
const body = (schema: unknown, required = true) => ({ required, content: { "application/json": { schema } } });

const videoRequest = {
  type: "object",
  properties: {
    topic: { type: "string", maxLength: 500, description: "Sujet libre. Absent : l'usine prend la tendance du jour." },
    template: { type: "string", enum: ["story", "maths", "film"] },
    lang: { type: "string", enum: ["fr", "en"] },
    script: ref("Script"),
  },
};

export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "SEPTIM-VIRAL-OS — API locale",
    version: "1.0.0",
    description:
      "Pilote l'usine à vidéos virales : fabriquer, regarder, vérifier un script, publier (seulement avec la phrase « OUI #ref »), jeter, refaire. " +
      "Écoute sur 127.0.0.1:4321 par défaut. Avec SEPTIM_TOKEN, chaque appel (sauf /health et /openapi.json) envoie Authorization: Bearer <token>.",
  },
  servers: [{ url: "http://127.0.0.1:4321" }],
  security: [{ bearer: [] }],
  paths: {
    "/api/v1/health": {
      get: {
        operationId: "health",
        summary: "L'usine répond-elle ?",
        security: [],
        responses: { "200": json({ type: "object", properties: { ok: { const: true }, version: { type: "string" } }, required: ["ok", "version"] }, "En marche.") },
      },
    },
    "/api/v1/openapi.json": {
      get: { operationId: "openapi", summary: "Ce contrat.", security: [], responses: { "200": json({ type: "object" }, "Document OpenAPI 3.1.") } },
    },
    "/api/v1/doctor": {
      get: { operationId: "doctor", summary: "État de l'usine (voix, script auto, publication, messages) et commandes pour ce qui manque.", responses: { "200": json(ref("Diagnosis"), "Diagnostic."), ...common } },
    },
    "/api/v1/videos": {
      get: {
        operationId: "listVideos",
        summary: "Liste des vidéos, la plus récente d'abord.",
        parameters: [
          { name: "status", in: "query", schema: ref("VideoStatus") },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: { "200": json({ type: "object", properties: { videos: { type: "array", items: ref("VideoSummary") } } }, "Vidéos."), "400": error("Filtre invalide."), ...common },
      },
      post: {
        operationId: "createVideo",
        summary: "Fabriquer une vidéo. Répond tout de suite avec une tâche ; le rendu dure environ 2 minutes.",
        requestBody: body(videoRequest, false),
        responses: {
          "202": json(ref("Task"), "Tâche créée (queued). Suivre /api/v1/tasks/{id} ou attendre le webhook video.ready."),
          "400": error("Sujet trop long, template ou langue inconnus, script refusé (details.issues)."),
          "413": error("Corps de plus de 1 Mo."),
          "415": error("Le corps doit être en application/json."),
          ...common,
        },
      },
    },
    "/api/v1/videos/{ref}": {
      get: {
        operationId: "getVideo",
        summary: "Détail d'une vidéo (hook, légende, hashtags, script, statut).",
        parameters: [refParam],
        responses: { "200": json(ref("VideoDetail"), "Vidéo."), "404": error("Référence inconnue."), "409": error("Référence ambiguë : details.matches liste les vidéos."), ...common },
      },
    },
    "/api/v1/videos/{ref}/video": {
      get: {
        operationId: "getVideoFile",
        summary: "Le fichier MP4 (lecture progressive avec Range).",
        description: "Accepte aussi ?token=<SEPTIM_TOKEN>, pour une balise <video> qui ne peut pas envoyer d'en-tête.",
        parameters: [refParam, { name: "Range", in: "header", schema: { type: "string", example: "bytes=0-1048575" } }],
        responses: {
          "200": { description: "Fichier entier.", content: { "video/mp4": { schema: { type: "string", format: "binary" } } } },
          "206": { description: "Partie demandée.", content: { "video/mp4": { schema: { type: "string", format: "binary" } } } },
          "404": error("Vidéo inconnue, ou fichier supprimé du disque."),
          "416": { description: "Plage hors du fichier." },
          ...common,
        },
      },
    },
    "/api/v1/videos/{ref}/publish": {
      post: {
        operationId: "publishVideo",
        summary: "Publier. Exige la phrase exacte « OUI #ref » de CETTE vidéo, écrite par un humain.",
        parameters: [refParam],
        requestBody: body({ type: "object", properties: { confirm: { type: "string", example: "OUI #5f8a" } }, required: ["confirm"] }),
        responses: {
          "200": json(ref("PublishOutcome"), "Publiée (ou légende prête à coller en mode manuel)."),
          "409": error("Déjà publiée, jetée, sans vidéo, ou publication déjà en cours."),
          "428": error("Confirmation absente ou fausse : details.expected donne la phrase attendue."),
          ...common,
        },
      },
    },
    "/api/v1/videos/{ref}/reject": {
      post: { operationId: "rejectVideo", summary: "Jeter une vidéo.", parameters: [refParam], responses: { "200": json(ref("VideoSummary"), "Jetée."), "409": error("Déjà publiée."), ...common } },
    },
    "/api/v1/videos/{ref}/redo": {
      post: {
        operationId: "redoVideo",
        summary: "Jeter et refaire une version sur le même sujet.",
        parameters: [refParam],
        responses: { "202": json(ref("Task"), "Nouvelle tâche."), "409": error("Déjà publiée."), ...common },
      },
    },
    "/api/v1/tasks": {
      get: { operationId: "listTasks", summary: "Toutes les tâches de fabrication.", responses: { "200": json({ type: "object", properties: { tasks: { type: "array", items: ref("Task") } } }, "Tâches."), ...common } },
    },
    "/api/v1/tasks/{id}": {
      get: {
        operationId: "getTask",
        summary: "Suivi d'une tâche (queued, running, done, failed).",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": json(ref("Task"), "Tâche."), "404": error("Tâche inconnue."), ...common },
      },
    },
    "/api/v1/lint": {
      post: {
        operationId: "lintScript",
        summary: "Vérifier un script avec les règles virales, sans rien fabriquer.",
        requestBody: body({ type: "object", properties: { script: ref("Script"), topic: { type: "string" }, template: { type: "string", enum: ["story", "maths", "film"] }, lang: { type: "string", enum: ["fr", "en"] } }, required: ["script"] }),
        responses: { "200": json(ref("LintResult"), "Résultat (ok:false liste les règles enfreintes)."), "400": error("script n'est pas un objet."), ...common },
      },
    },
    "/api/v1/lessons": {
      get: { operationId: "lessons", summary: "Ce qui marche : LESSONS.md et classement des couples template × formule.", responses: { "200": json(ref("Lessons"), "Leçons."), ...common } },
    },
  },
  components: {
    securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "SEPTIM_TOKEN, exigé seulement s'il est défini." } },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string", enum: ["bad_request", "unauthorized", "forbidden", "not_found", "ambiguous_ref", "conflict", "payload_too_large", "unsupported_media_type", "confirmation_required", "internal"] },
              message: { type: "string" },
              details: {},
            },
            required: ["code", "message"],
          },
        },
        required: ["error"],
      },
      VideoStatus: { type: "string", enum: ["rendered", "notified", "publishing", "published", "rejected", "failed"] },
      Script: {
        type: "object",
        description: "Script H.E.A.T : hook ≤ 3 s, beats de ≤ 3 s, réponse à ≥ 80 % de la vidéo.",
        properties: {
          topic: { type: "string" },
          hook: { type: "string" },
          beats: { type: "array", items: { type: "object", properties: { text: { type: "string" }, emphasis: { type: "string" } }, required: ["text"] } },
          payoff: { type: "string" },
          cta: { type: "string" },
          caption: { type: "string" },
          hashtags: { type: "array", items: { type: "string" } },
        },
        required: ["hook", "beats", "payoff"],
      },
      Task: {
        type: "object",
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: ["create", "redo"] },
          status: { type: "string", enum: ["queued", "running", "done", "failed"] },
          request: videoRequest,
          jobId: { type: "string" },
          ref: { type: "string" },
          error: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
        required: ["id", "kind", "status", "createdAt", "updatedAt"],
      },
      VideoSummary: {
        type: "object",
        properties: {
          id: { type: "string" },
          ref: { type: "string" },
          status: ref("VideoStatus"),
          hook: { type: "string" },
          topic: { type: "string" },
          template: { type: "string" },
          lang: { type: "string" },
          durationMs: { type: "integer" },
          voice: { type: "string" },
          source: { type: "string", enum: ["ollama", "fallback", "claude"] },
          createdAt: { type: "string", format: "date-time" },
          publishedAt: { type: "string", format: "date-time" },
          hasVideo: { type: "boolean" },
        },
        required: ["id", "ref", "status", "hook", "topic", "template", "lang", "durationMs", "hasVideo"],
      },
      VideoDetail: {
        allOf: [
          ref("VideoSummary"),
          {
            type: "object",
            properties: {
              caption: { type: "string" },
              hashtags: { type: "array", items: { type: "string" } },
              script: ref("Script"),
              videoUrl: { type: "string", description: "Chemin du MP4 sur ce serveur." },
              videoPath: { type: "string", description: "Chemin du MP4 sur le disque de l'usine." },
              posted: { type: "object", additionalProperties: { type: "array", items: { type: "string" } } },
              error: { type: "string" },
              publishMode: { type: "string" },
            },
          },
        ],
      },
      PublishOutcome: {
        type: "object",
        properties: {
          ref: { type: "string" },
          status: ref("VideoStatus"),
          posted: { type: "object" },
          manualText: { type: "string", description: "Mode manuel : légende et hashtags prêts à coller." },
          message: { type: "string" },
        },
        required: ["ref", "status", "message"],
      },
      LintResult: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          issues: { type: "array", items: { type: "object", properties: { rule: { type: "string" }, message: { type: "string" } } } },
          durationMs: { type: "integer" },
          payoffRatio: { type: "number" },
        },
        required: ["ok", "issues", "durationMs", "payoffRatio"],
      },
      Diagnosis: {
        type: "object",
        properties: {
          canRender: { type: "boolean" },
          voice: { type: "string" },
          llm: { type: "string" },
          publishMode: { type: "string" },
          notify: { type: "string" },
          fixes: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, commands: { type: "array", items: { type: "string" } } } } },
        },
      },
      Lessons: {
        type: "object",
        properties: {
          text: { type: "string" },
          arms: { type: "array", items: { type: "object", properties: { arm: { type: "string" }, alpha: { type: "number" }, beta: { type: "number" }, mean: { type: "number" } } } },
        },
      },
    },
  },
};
