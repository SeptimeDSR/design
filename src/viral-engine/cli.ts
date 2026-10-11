import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Writable } from "node:stream";
import { parseArgs } from "node:util";
import { checkScript, cleanTopic, type JobRequest, type PipelineDeps } from "./pipeline";
import { createConsoleNotifier } from "./notify";
import { loadConfig, loadDotEnv, type ViralConfig } from "./config";
import { enqueueOutbox } from "./outbox";
import { createFactory, type FactoryDeps } from "./factory";
import { attachWebhooks, flushWebhooks } from "./webhooks";
import type { Job } from "./store";
import { TEMPLATES, type Lang, type TemplateId } from "./types";
import { formatDuration, GENRE_LABEL, isLongForm, parseDuration, parseGenre, QUALITIES, ORIENTATIONS, type Genre, type Orientation, type Quality } from "./duration";
import { estimateFilmSeconds } from "./film/plan";
import { lintFilm, normalizeFilm } from "./film/types";
import { callFactory, type RemoteResult } from "./remote";

// input : seulement pour les assistants interactifs (septim env init) ; par défaut le clavier.
export type CliIO = { out: Writable; err: Writable; input?: NodeJS.ReadableStream };

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
//   [--duree 45s|3min|1h30] [--genre drame] [--format paysage|vertical] [--qualite eco|standard|hd]
//   [--script script.json] [--lint-only] [--broll dossier-clips-PRO] [--no-notify]
// npm run viral -- --publish <ref>        publie un job déjà validé (même registre que le démon : jamais deux fois)
export async function runCli(
  argv: string[],
  io: CliIO = { out: process.stdout, err: process.stderr },
  deps: { runJob?: (req: JobRequest, partial: Partial<PipelineDeps>) => Promise<Job>; remote?: typeof callFactory } = {},
): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      template: { type: "string" },
      lang: { type: "string" },
      script: { type: "string" },
      broll: { type: "string" },
      duree: { type: "string" },
      genre: { type: "string" },
      format: { type: "string" },
      qualite: { type: "string" },
      publish: { type: "string" },
      "lint-only": { type: "boolean", default: false },
      "no-notify": { type: "boolean", default: false },
    },
  });
  if (values.template && !TEMPLATES.includes(values.template as TemplateId)) throw new Error(`--template doit valoir ${TEMPLATES.join(", ")}`);
  if (values.lang && values.lang !== "fr" && values.lang !== "en") throw new Error("--lang doit valoir fr ou en");

  if (values.publish) return publishFromTerminal(values.publish, io);

  let durationSec: number | undefined;
  let genre: Genre | undefined;
  try {
    durationSec = values.duree ? parseDuration(values.duree) : undefined;
    genre = parseGenre(values.genre);
  } catch (error) {
    throw new Error(`${(error as Error).message}`);
  }
  if (values.format && !ORIENTATIONS.includes(values.format as Orientation)) throw new Error(`--format doit valoir ${ORIENTATIONS.join(" ou ")}`);
  if (values.qualite && !QUALITIES.includes(values.qualite as Quality)) throw new Error(`--qualite doit valoir ${QUALITIES.join(", ")}`);
  const orientation = values.format as Orientation | undefined;
  const quality = values.qualite as Quality | undefined;

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
    if (script && Array.isArray(script.scenes)) {
      const f = normalizeFilm(script, { lang, genre });
      if (!f) {
        line(io.out, "✗ film.empty : il faut un title et au moins une scène avec des plans (shots → narration).");
        return 1;
      }
      const issues = lintFilm(f, { targetSec: durationSec });
      line(io.out, `Film « ${f.title} » : ${f.scenes.length} scène(s), ${f.scenes.reduce((n, sc) => n + sc.shots.length, 0)} plans, environ ${formatDuration(Math.round(estimateFilmSeconds(f)))} à voix haute`);
      line(io.out, issues.length ? issues.map((i) => `✗ ${i.rule} : ${i.message}`).join("\n") : "✓ Film conforme.");
      return issues.length ? 1 : 0;
    }
    const r = checkScript({ topic: cleanTopic(topic ?? script.topic ?? ""), lang, template: template ?? "story", formula: "question", targetSec: durationSec }, script);
    line(io.out, `Durée ${(r.durationMs / 1000).toFixed(1)} s · réponse à ${Math.round(r.payoffRatio * 100)} %`);
    line(io.out, r.issues.length ? r.issues.map((i) => `✗ ${i.rule} : ${i.message}`).join("\n") : "✓ Script conforme aux règles virales.");
    return r.issues.length ? 1 : 0;
  }

  const isFilm = !!script && Array.isArray(script.scenes);
  const long = isFilm || (durationSec !== undefined && isLongForm(durationSec));
  if (long) {
    const code = await runLongFromTerminal({ topic, lang, durationSec, genre, orientation, quality, film: isFilm ? script : undefined }, { cfg, io, noNotify: values["no-notify"], deps });
    return code;
  }

  // Le CLI n'ouvre jamais WhatsApp : il affiche ici et dépose le message pour le démon.
  const toWhatsApp = queueToWhatsApp(cfg, values["no-notify"]);
  // Même file et mêmes événements que le Studio, l'API et le MCP : les webhooks voient aussi les vidéos du terminal.
  const factory = createFactory({
    ...(deps.runJob ? { runJob: deps.runJob as FactoryDeps["runJob"] } : {}),
    notify: async (text, media) => {
      await notify(text, media);
      if (toWhatsApp) enqueueOutbox(cfg.home, { text, mediaPath: media });
    },
  });
  attachWebhooks(factory);
  let task;
  try {
    task = factory.createVideo({ topic, template, lang, script, durationSec, brollDir: values.broll ? userPath(values.broll) : undefined });
    await factory.idle();
    task = factory.getTask(task.id);
  } finally {
    await flushWebhooks();
  }
  const job = task.jobId ? factory.store.getJob(task.jobId) : undefined;
  if (!job) {
    line(io.out, `\n✗ Tâche ${task.id} : ${task.status}`);
    line(io.out, `  Erreur: ${task.error ?? "rendu raté"}`);
    return 1;
  }
  const ref = factory.store.ref(job.id);

  line(io.out, `\n${job.status === "failed" ? "✗" : "✓"} Job ${job.id} : ${job.status}`);
  if (job.videoPath) line(io.out, `  Vidéo : ${job.videoPath}`);
  line(io.out, `  Hook  : ${job.script.hook}`);
  line(io.out, `  Script: ${job.source} · voix ${job.ttsEngine} · ${Math.round(job.timeline.durationMs / 1000)} s`);
  if (toWhatsApp) line(io.out, "  WhatsApp : message en file, le démon l'envoie (septim start).");
  else if (cfg.notifier === "whatsapp" && !values["no-notify"]) line(io.out, "  WhatsApp pas encore lié : rien mis en file (septim start pour le lier).");
  if (job.status !== "failed") line(io.out, `  Publier : septim publier ${ref}   (ou le Studio, ou OUI #${ref} sur WhatsApp)`);
  if (job.error) line(io.out, `  Erreur: ${job.error}`);
  return job.status === "failed" ? 1 : 0;
}

type LongRequest = { topic?: string; lang: Lang; durationSec?: number; genre?: Genre; orientation?: Orientation; quality?: Quality; film?: unknown };

// Un film : on dit ce qu'il coûte (temps, place), puis l'usine qui tourne s'en charge (le terminal peut se fermer) ; sinon ce terminal le fabrique.
async function runLongFromTerminal(req: LongRequest, o: { cfg: ViralConfig; io: CliIO; noNotify: boolean; deps: { runJob?: (req: JobRequest, partial: Partial<PipelineDeps>) => Promise<Job>; remote?: typeof callFactory } }): Promise<number> {
  const { io } = o;
  const toWhatsApp = queueToWhatsApp(o.cfg, o.noNotify);
  const factory = createFactory({
    ...(o.deps.runJob ? { runJob: o.deps.runJob as FactoryDeps["runJob"] } : {}),
    notify: async (text, media) => {
      line(io.out, text);
      if (toWhatsApp) enqueueOutbox(o.cfg.home, { text, mediaPath: media });
    },
  });
  const quality = req.quality ?? "standard";
  let durationSec = req.durationSec;
  if (durationSec === undefined && req.film) {
    const f = normalizeFilm(req.film, { lang: req.lang, genre: req.genre });
    durationSec = f ? Math.max(15, Math.round(estimateFilmSeconds(f))) : undefined;
  }
  if (durationSec === undefined) throw new Error("Il manque --duree (par exemple --duree 1h30).");
  const est = factory.estimate({ durationSec, quality });
  line(io.out, `Film de ${formatDuration(durationSec)}${req.genre ? ` · ${GENRE_LABEL[req.genre]}` : ""} · ${req.orientation ?? "paysage"} · qualité ${quality}`);
  line(io.out, `Fabrication : environ ${formatDuration(est.estMinutes * 60)} sur un PC normal · place disque : environ ${est.diskMb} Mo (${est.finalMb} Mo pour le fichier final), il en reste ${est.freeMb} Mo.`);
  if (!est.ok) {
    line(io.err, `✗ ${est.message}`);
    return 1;
  }
  const body = { topic: req.topic, lang: req.lang, durationSec, genre: req.genre, orientation: req.orientation, quality: req.quality, ...(req.film === undefined ? {} : { film: req.film }) };
  const remote = await (o.deps.remote ?? callFactory)(process.env, "POST", "/api/v1/videos", body);
  if (remote.ok) {
    const task = remote.json as { id: string };
    line(io.out, `\n✓ Film lancé en arrière-plan (tâche ${task.id}). Tu peux fermer ce terminal.`);
    line(io.out, `  Suivre   : septim taches   (ou le Studio, « En fabrication »)`);
    line(io.out, `  Annuler  : septim annuler ${task.id}`);
    line(io.out, `  Un arrêt (coupure, redémarrage) ne perd rien : relance la même commande, le film reprend où il s'était arrêté.`);
    return 0;
  }
  if (remote.reason !== "absent") {
    line(io.err, `✗ ${remote.message}`);
    return 1;
  }
  line(io.out, "\nAucune usine en arrière-plan : ce terminal fabrique le film. Garde-le ouvert (Ctrl+C arrête ; relancer la même commande reprend).\n");
  attachWebhooks(factory);
  let task;
  const ticker = setInterval(() => {
    const t = factory.listTasks()[0];
    if (t?.progress) line(io.out, `  ${String(t.progress.percent).padStart(3)} %  ${t.progress.message}`);
  }, 10_000);
  try {
    task = factory.createVideo({ ...req, durationSec });
    await factory.idle();
    task = factory.getTask(task.id);
  } finally {
    clearInterval(ticker);
    await flushWebhooks();
  }
  const job = task.jobId ? factory.store.getJob(task.jobId) : undefined;
  if (!job) {
    line(io.out, `\n✗ Tâche ${task.id} : ${task.status}`);
    line(io.out, `  Erreur: ${task.error ?? "fabrication ratée"}`);
    return 1;
  }
  const ref = factory.store.ref(job.id);
  line(io.out, `\n${job.status === "failed" ? "✗" : "✓"} Film ${job.id} : ${job.status}`);
  if (job.videoPath) line(io.out, `  Vidéo : ${job.videoPath}`);
  line(io.out, `  Titre : ${job.script.hook}`);
  line(io.out, `  Durée : ${formatDuration(Math.round(job.timeline.durationMs / 1000))} · voix ${job.ttsEngine} · images ${job.film?.imageSource ?? "?"}`);
  if (job.status !== "failed") line(io.out, `  Publier : septim publier ${ref}   (ou le Studio, ou OUI #${ref} sur WhatsApp)`);
  if (job.error) {
    line(io.out, `  Erreur: ${job.error}`);
    line(io.out, "  Relance la même commande : le film reprend où il s'était arrêté.");
  }
  return job.status === "failed" ? 1 : 0;
}

export type { RemoteResult };

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
