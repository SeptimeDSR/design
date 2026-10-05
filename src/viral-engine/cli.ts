import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { checkScript, cleanTopic, runJob } from "./pipeline";
import { chooseNotifier, createNotifier, whatsappSessionExists } from "./notify";
import { loadConfig } from "./config";
import type { Lang, TemplateId } from "./types";

// npm run viral -- "je veux une histoire sur la tontine" [--template story|maths|film] [--lang fr|en]
//   [--script script.json] [--lint-only] [--broll dossier-clips-PRO] [--no-notify]
async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      template: { type: "string" },
      lang: { type: "string" },
      script: { type: "string" },
      broll: { type: "string" },
      "lint-only": { type: "boolean", default: false },
      "no-notify": { type: "boolean", default: false },
    },
  });
  const cfg = loadConfig();
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

  const choice = chooseNotifier({ requested: values["no-notify"] ? "console" : cfg.notifier, sessionExists: whatsappSessionExists(cfg), interactive: false });
  if (choice.warning) console.warn(`⚠ ${choice.warning}`);
  const notifier = createNotifier(choice.kind, cfg);
  await notifier.start();
  const job = await runJob({ topic, template, lang, script, brollDir: values.broll }, { notify: (text, media) => notifier.send(text, media) });

  console.log(`\n${job.status === "failed" ? "✗" : "✓"} Job ${job.id} : ${job.status}`);
  if (job.videoPath) console.log(`  Vidéo : ${job.videoPath}`);
  console.log(`  Hook  : ${job.script.hook}`);
  console.log(`  Script: ${job.source} · voix ${job.ttsEngine} · ${Math.round(job.timeline.durationMs / 1000)} s`);
  if (job.error) console.log(`  Erreur: ${job.error}`);
  await notifier.stop();
  process.exit(job.status === "failed" ? 1 : 0);
}

main().catch((error) => {
  console.error(`✗ ${(error as Error).message}`);
  process.exit(1);
});
