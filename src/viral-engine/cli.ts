import { parseArgs } from "node:util";
import { runJob } from "./pipeline";
import { createNotifier } from "./notify";
import { loadConfig } from "./config";
import type { Lang, TemplateId } from "./types";

// npm run viral -- "je veux une histoire sur la tontine" [--template story|maths|film] [--lang fr|en] [--no-notify]
async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      template: { type: "string" },
      lang: { type: "string" },
      "no-notify": { type: "boolean", default: false },
    },
  });
  const cfg = loadConfig();
  const notifier = createNotifier(values["no-notify"] ? "console" : cfg.notifier, cfg);
  await notifier.start();

  const job = await runJob(
    { topic: positionals.join(" ") || undefined, template: values.template as TemplateId | undefined, lang: values.lang as Lang | undefined },
    { notify: (text, media) => notifier.send(text, media) },
  );

  console.log(`\n${job.status === "failed" ? "✗" : "✓"} Job ${job.id} : ${job.status}`);
  if (job.videoPath) console.log(`  Vidéo : ${job.videoPath}`);
  console.log(`  Hook  : ${job.script.hook}`);
  console.log(`  Script: ${job.source} · voix ${job.ttsEngine} · ${Math.round(job.timeline.durationMs / 1000)} s`);
  if (job.error) console.log(`  Erreur: ${job.error}`);
  await notifier.stop();
  process.exit(job.status === "failed" ? 1 : 0);
}

main();
