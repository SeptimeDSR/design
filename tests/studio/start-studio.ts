// Serveur de test du Studio : même chemin de code que `septim studio` (createFactory + startServer), sans le CLI.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFactory } from "../../src/viral-engine/factory";
import { startServer } from "../../src/viral-engine/server/http";
import { qrToDataUrl } from "../../src/viral-engine/notifier-hub";
import { createStore, type Job } from "../../src/viral-engine/store";
import { fakeComfy, WAN22_FILES } from "../../src/viral-engine/__tests__/fixtures/fake-comfy";

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
  // Réglages : aucune clé au départ, WhatsApp coché ; les services externes sont factices (rien ne sort du test).
  const env: Record<string, string | undefined> = { ...process.env, VIRAL_HOME: home, VIRAL_NOTIFIER: "whatsapp", VIRAL_PUBLISH_MODE: undefined };
  for (const k of ["PEXELS_API_KEY", "PIXABAY_API_KEY", "YOUTUBE_API_KEY", "APIFY_TOKEN", "POSTIZ_API_KEY", "POSTIZ_API_URL", "COMFYUI_URL", "VIRAL_MUSIC_DIR"]) delete env[k];
  const comfy = fakeComfy(WAN22_FILES);
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.startsWith("https://api.pexels.com")) return new Response("{}", { status: (init?.headers as Record<string, string>)?.Authorization === "good-key" ? 200 : 401 });
    if (u.startsWith("http://host.docker.internal:8188")) return comfy(url, init);
    if (u.endsWith("/api/tags")) return new Response(JSON.stringify({ models: ["qwen2.5:3b", "llama3.2:latest", "deepseek-r1:latest", "kimi-k2.5:cloud"].map((name) => ({ name })) }));
    throw new Error("fetch failed");
  }) as unknown as typeof fetch;
  // Installation factice : trois étapes de 0,7 s ; la dernière dépose les fichiers que l'usine cherche.
  const installRun = async (_cmd: string, args: string[], onLine: (l: string) => void) => {
    onLine(`pip ${args.slice(0, 3).join(" ")}`);
    await new Promise((r) => setTimeout(r, 700));
    if (args.includes("piper.download_voices")) {
      mkdirSync(join(home, "venv", "lib", "python3.11", "site-packages", "piper"), { recursive: true });
      mkdirSync(join(home, "voices"), { recursive: true });
      writeFileSync(join(home, "voices", "fr_FR-tom-medium.onnx"), "");
    }
    return 0;
  };
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
  const factory = createFactory({ env, runJob: process.env.REAL_RENDER ? undefined : (runJob as never), fetchImpl, installRun });
  const qr = await qrToDataUrl("2@FAKEQR,demo-septim");
  factory.attachHub({ state: () => ({ state: "qr" as const, qr }) } as never);
  const srv = await startServer({ factory, port: Number(process.env.PORT ?? 4399), token: process.env.SEPTIM_TOKEN });
  console.log(`READY ${srv.url} ${home}`);
}
void main();
