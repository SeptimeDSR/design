// Planches de contrôle : images clés de chaque template, sans rendre toute la vidéo.
// npx tsx tests/video/stills.ts <dossier-sortie> .septim-viral/jobs/<id>/job.json [story,maths,film] [broll1.mp4,broll2.mp4 (chemins sous public/)]
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";

async function main() {
  const out = process.argv[2];
  const job = JSON.parse(readFileSync(process.argv[3], "utf8"));
  const templates = (process.argv[4] ?? "story,maths,film").split(",");
  const broll = process.argv[5] ? process.argv[5].split(",") : undefined;
  mkdirSync(out, { recursive: true });
  const serveUrl = await bundle({ entryPoint: resolve("src/remotion/index.ts") });
  const fps = 30;
  const segs = job.timeline.segments as { kind: string; startMs: number; endMs: number }[];
  const marks = [0, 400, ...segs.slice(1).map((s) => s.startMs + 450)];
  for (const t of templates) {
    const inputProps = { script: { ...job.script, template: t }, timeline: job.timeline, audio: { segments: [] }, broll };
    const composition = await selectComposition({ serveUrl, id: `viral-${t}`, inputProps, browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE || null });
    const files: string[] = [];
    for (const [i, ms] of marks.entries()) {
      const frame = Math.min(composition.durationInFrames - 1, Math.round((ms / 1000) * fps));
      const file = join(out, `${t}-${String(i).padStart(2, "0")}.png`);
      await renderStill({ composition, serveUrl, output: file, frame, inputProps, browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE || null, scale: 0.5 });
      files.push(file);
    }
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", join(out, `${t}-%02d.png`), "-vf", `scale=270:480,tile=8x${Math.ceil(files.length / 8)}:padding=6:color=white`, "-frames:v", "1", join(out, `${t}-sheet.png`)]);
    console.log(`${t} : ${files.length} images → ${join(out, `${t}-sheet.png`)}`);
  }
}
void main();
