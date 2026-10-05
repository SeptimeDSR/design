import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Writable } from "node:stream";
import { parseArgs } from "node:util";
import { checkScript, cleanTopic, runJob } from "./pipeline";
import { createConsoleNotifier } from "./notify";
import { loadConfig, loadDotEnv, type ViralConfig } from "./config";
import { enqueueOutbox } from "./outbox";
import { createFactory } from "./factory";
import { attachWebhooks, flushWebhooks } from "./webhooks";
import { TEMPLATES, type Lang, type TemplateId } from "./types";

export type CliIO = { out: Writable; err: Writable };

// Un chemin tapé par l'humain se lit depuis le dossier où il a tapé la commande, pas depuis le repo.
export const userPath = (p: string) => resolve(process.env.SEPTIM_CWD ?? process.env.INIT_CWD ?? process.cwd(), p);

// La file WhatsApp ne se remplit que si WhatsApp est lié : sinon un vieux message partirait au premier septim start.
export const queueToWhatsApp = (cfg: ViralConfig, noNotify: boolean) => cfg.notifier === "whatsapp" && !noNotify && existsSync(join(cfg.home, "wa"));

const line = (stream: NodeJS.WritableStream, text = "") => void stream.write(`${text}\n`);

// Taper « septim publier <ref> » vaut « OUI #ref » : même cœur, même registre, mêmes refus que les autres portes.
export async function publishFromTerminal(ref: string, io: CliIO): Promise<number> {
  const factory = createFactory({ notify: async () => undefined });
  attachWebhooks(factory);
  try {
    const video = factory.getVideo(ref);
    const r = await factory.publish(video.id, `OUI #${video.id}`);
    line(io.out, r.message);
    return r.status === "published" ? 0 : 1;
  } finally {
    await flushWebhooks();
  }
}

// npm run viral -- "je veux une histoire sur la tontine" [--template story|maths|film] [--lang fr|en]
//   [--script script.json] [--lint-only] [--broll dossier-clips-PRO] [--no-notify]
// npm run viral -- --publish <ref>        publie un job déjà validé (même registre que le démon : jamais deux fois)
export async function runCli(argv: string[], io: CliIO = { out: process.stdout, err: process.stderr }): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      template: { type: "string" },
      lang: { type: "string" },
      script: { type: "string" },
      broll: { type: "string" },
      publish: { type: "string" },
      "lint-only": { type: "boolean", default: false },
      "no-notify": { type: "boolean", default: false },
    },
  });
  if (values.template && !TEMPLATES.includes(values.template as TemplateId)) throw new Error(`--template doit valoir ${TEMPLATES.join(", ")}`);
  if (values.lang && values.lang !== "fr" && values.lang !== "en") throw new Error("--lang doit valoir fr ou en");

  if (values.publish) return publishFromTerminal(values.publish, io);

  const cfg = loadConfig();
  const console_ = createConsoleNotifier({ output: io.out });
  const notify = (text: string, media?: string) => console_.send(text, media);
  const topic = positionals.join(" ") || undefined;
  const template = values.template as TemplateId | undefined;
  const lang = (values.lang as Lang | undefined) ?? cfg.lang;
  const scriptPath = values.script ? userPath(values.script) : undefined;
  let script;
  if (scriptPath) {
    try {
      script = JSON.parse(readFileSync(scriptPath, "utf8"));
    } catch (error) {
      throw new Error(`Script illisible (${scriptPath}) : ${(error as Error).message}`);
    }
    // Le corps de l'API ({"script": {…}}) marche aussi : même fichier pour le terminal et pour curl.
    if (script && typeof script === "object" && script.script && typeof script.script === "object" && !("hook" in script)) script = script.script;
  }

  if (values["lint-only"]) {
    if (!script) throw new Error("--lint-only demande --script fichier.json");
    const r = checkScript({ topic: cleanTopic(topic ?? script.topic ?? ""), lang, template: template ?? "story", formula: "question" }, script);
    line(io.out, `Durée ${(r.durationMs / 1000).toFixed(1)} s · réponse à ${Math.round(r.payoffRatio * 100)} %`);
    line(io.out, r.issues.length ? r.issues.map((i) => `✗ ${i.rule} : ${i.message}`).join("\n") : "✓ Script conforme aux règles virales.");
    return r.issues.length ? 1 : 0;
  }

  // Le CLI n'ouvre jamais WhatsApp : il affiche ici et dépose le message pour le démon.
  const toWhatsApp = queueToWhatsApp(cfg, values["no-notify"]);
  const job = await runJob(
    { topic, template, lang, script, brollDir: values.broll ? userPath(values.broll) : undefined },
    {
      notify: async (text, media) => {
        await notify(text, media);
        if (toWhatsApp) enqueueOutbox(cfg.home, { text, mediaPath: media });
      },
    },
  );

  line(io.out, `\n${job.status === "failed" ? "✗" : "✓"} Job ${job.id} : ${job.status}`);
  if (job.videoPath) line(io.out, `  Vidéo : ${job.videoPath}`);
  line(io.out, `  Hook  : ${job.script.hook}`);
  line(io.out, `  Script: ${job.source} · voix ${job.ttsEngine} · ${Math.round(job.timeline.durationMs / 1000)} s`);
  if (toWhatsApp) line(io.out, "  WhatsApp : message en file, le démon l'envoie (septim start).");
  else if (cfg.notifier === "whatsapp" && !values["no-notify"]) line(io.out, "  WhatsApp pas encore lié : rien mis en file (septim start pour le lier).");
  if (job.status !== "failed") line(io.out, `  Publier : septim publier ${job.id.slice(0, 4)}   (ou le Studio, ou OUI #${job.id.slice(0, 4)} sur WhatsApp)`);
  if (job.error) line(io.out, `  Erreur: ${job.error}`);
  return job.status === "failed" ? 1 : 0;
}

if (process.argv[1]?.endsWith("cli.ts")) {
  loadDotEnv();
  runCli(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(`✗ ${(error as Error).message}`);
      process.exit(1);
    },
  );
}
