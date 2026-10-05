// Serveur de test du Studio : même chemin de code que `septim studio` (createFactory + startServer), sans le CLI.
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFactory } from "../../src/viral-engine/factory";
import { startServer } from "../../src/viral-engine/server/http";
import { createStore, type Job } from "../../src/viral-engine/store";

async function main() {
  const src = process.env.SRC_JOB!;
  const home = mkdtempSync(join(tmpdir(), "studio-home-"));
  const copy = (id: string, minutesAgo: number) => {
    const dir = join(home, "jobs", id);
    cpSync(src, dir, { recursive: true });
    // Chromium de Playwright n'a pas de décodeur H.264 : copie VP9 dans le même conteneur MP4 pour le test navigateur.
    if (process.env.VP9) cpSync(process.env.VP9, join(dir, "video.mp4"));
    const job = JSON.parse(readFileSync(join(dir, "job.json"), "utf8")) as Job;
    writeFileSync(join(dir, "job.json"), JSON.stringify({ ...job, id, jobDir: dir, videoPath: join(dir, "video.mp4"), createdAt: new Date(Date.now() - minutesAgo * 60000).toISOString() }));
  };
  copy("2e5b66e3", 30);
  copy("7c1d9a40", 10);
  const store = createStore(home);
  const env = { ...process.env, VIRAL_HOME: home, VIRAL_PUBLISH_MODE: "manual" };
  let n = 0;
  // Rendu factice rapide (3 s) : la file et l'interface des tâches sont réelles, seul Remotion est remplacé.
  const runJob = async (req: { topic?: string }) => {
    await new Promise((r) => setTimeout(r, 3000));
    const id = `aa${String(++n).padStart(2, "0")}beef`;
    copy(id, 0);
    const job = store.getJob(id)!;
    const next = { ...job, script: { ...job.script, topic: req.topic ?? job.script.topic } };
    store.saveJob(next);
    return next;
  };
  const factory = createFactory({ env, runJob: process.env.REAL_RENDER ? undefined : (runJob as never) });
  const srv = await startServer({ factory, port: Number(process.env.PORT ?? 4399), token: process.env.SEPTIM_TOKEN });
  console.log(`READY ${srv.url} ${home}`);
}
void main();
