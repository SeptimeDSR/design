import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ViralProps } from "../remotion/viral/props";
import type { Job } from "./store";

let bundlePromise: Promise<string> | undefined;

// Un seul bundle par processus ; les fichiers audio du job sont copiés dans son dossier public.
async function getBundle(): Promise<string> {
  bundlePromise ??= (async () => {
    const { bundle } = await import("@remotion/bundler");
    return bundle({ entryPoint: resolve("src/remotion/index.ts") });
  })();
  return bundlePromise;
}

export async function renderWithRemotion(job: Job, props: ViralProps, jobDir: string): Promise<string> {
  const { renderMedia, selectComposition } = await import("@remotion/renderer");
  const serveUrl = await getBundle();
  const publicJob = join(serveUrl, "public", "viral", job.id);
  mkdirSync(publicJob, { recursive: true });
  const music = readdirSync(jobDir).filter((f) => f.startsWith("music."));
  for (const sub of ["voice", "ambient.wav", "broll", "sfx", ...music]) {
    if (existsSync(join(jobDir, sub))) cpSync(join(jobDir, sub), join(publicJob, sub), { recursive: true });
  }

  const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
  const id = `viral-${job.script.template}`;
  // logLevel error : pas de bruit (« Detected differing memory amounts… ») dans le terminal de l'utilisateur.
  const composition = await selectComposition({ serveUrl, id, inputProps: props, browserExecutable, logLevel: "error" });
  const outputLocation = join(jobDir, "video.mp4");
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    // CRF 18 : quasi sans perte visible ; la plateforme réencode de toute façon, autant lui donner la meilleure source.
    crf: 18,
    inputProps: props,
    outputLocation,
    browserExecutable,
    logLevel: "error",
    concurrency: Number(process.env.VIRAL_RENDER_CONCURRENCY ?? 2),
  });
  return outputLocation;
}
