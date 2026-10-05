import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { checkScript, cleanTopic, runJob } from "./pipeline";
import { createConsoleNotifier } from "./notify";
import { loadConfig, loadDotEnv } from "./config";
import { enqueueOutbox } from "./outbox";
import { publishWithLedger } from "./daemon";
import { publishJob } from "./publish";
import { resolveModeFromEnv } from "./publish-mode";
import { createStore } from "./store";
import { TEMPLATES, type Lang, type TemplateId } from "./types";

// npm run viral -- "je veux une histoire sur la tontine" [--template story|maths|film] [--lang fr|en]
//   [--script script.json] [--lint-only] [--broll dossier-clips-PRO] [--no-notify]
// npm run viral -- --publish <ref>        publie un job déjà validé (même registre que le démon : jamais deux fois)
async function main() {
  loadDotEnv();
  const { values, positionals } = parseArgs({
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

  const cfg = loadConfig();
  const console_ = createConsoleNotifier();
  const notify = (text: string, media?: string) => console_.send(text, media);

  if (values.publish) {
    const store = createStore(cfg.home);
    const job = store.findJob(values.publish);
    if (!job) throw new Error(`Aucun job #${values.publish}`);
    const mode = resolveModeFromEnv();
    await publishWithLedger(job, { store, notify, publish: (j) => publishJob(j, mode, cfg.platforms, cfg.tiktokMethod) });
    return;
  }

  const topic = positionals.join(" ") || undefined;
  const template = values.template as TemplateId | undefined;
  const lang = (values.lang as Lang | undefined) ?? cfg.lang;
  const script = values.script ? JSON.parse(readFileSync(values.script, "utf8")) : undefined;

  if (values["lint-only"]) {
    if (!script) throw new Error("--lint-only demande --script fichier.json");
    const r = checkScript({ topic: cleanTopic(topic ?? script.topic ?? ""), lang, template: template ?? "story", formula: "question" }, script);
    console.log(`Durée ${(r.durationMs / 1000).toFixed(1)} s · réponse à ${Math.round(r.payoffRatio * 100)} %`);
    console.log(r.issues.length ? r.issues.map((i) => `✗ ${i.rule} : ${i.message}`).join("\n") : "✓ Script conforme aux règles virales.");
    process.exit(r.issues.length ? 1 : 0);
  }

  // Le CLI n'ouvre jamais WhatsApp : il affiche ici et dépose le message pour le démon.
  const toWhatsApp = cfg.notifier === "whatsapp" && !values["no-notify"];
  const job = await runJob(
    { topic, template, lang, script, brollDir: values.broll },
    {
      notify: async (text, media) => {
        await notify(text, media);
        if (toWhatsApp) enqueueOutbox(cfg.home, { text, mediaPath: media });
      },
    },
  );

  console.log(`\n${job.status === "failed" ? "✗" : "✓"} Job ${job.id} : ${job.status}`);
  if (job.videoPath) console.log(`  Vidéo : ${job.videoPath}`);
  console.log(`  Hook  : ${job.script.hook}`);
  console.log(`  Script: ${job.source} · voix ${job.ttsEngine} · ${Math.round(job.timeline.durationMs / 1000)} s`);
  if (toWhatsApp) console.log("  WhatsApp : message en file, le démon l'envoie (npm run viral:daemon).");
  if (job.error) console.log(`  Erreur: ${job.error}`);
  process.exit(job.status === "failed" ? 1 : 0);
}

main().catch((error) => {
  console.error(`✗ ${(error as Error).message}`);
  process.exit(1);
});
