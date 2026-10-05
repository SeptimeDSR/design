import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { loadConfig, loadDotEnv, type ViralConfig } from "./config";

export type Probes = {
  ollama: boolean;
  piperVoice: boolean;
  kokoro: boolean;
  chrome: boolean;
  postiz: boolean;
  whatsappSession: boolean;
  youtubeKey: boolean;
  apify: boolean;
};

export type Fix = { id: string; label: string; commands: string[] };

export function diagnose(p: Probes) {
  const fixes: Fix[] = [];
  if (!p.piperVoice)
    fixes.push({
      id: "voice",
      label: "Voix française gratuite (sinon piste silencieuse)",
      commands: ["pip install piper-tts", "python3 -m piper.download_voices fr_FR-tom-medium --data-dir .septim-viral/voices"],
    });
  if (!p.ollama)
    fixes.push({
      id: "llm",
      label: "LLM local pour le démon (sinon script de secours ; en interactif, Claude écrit le script)",
      commands: ["curl -fsSL https://ollama.com/install.sh | sh", "ollama pull qwen2.5:7b"],
    });
  if (!p.whatsappSession) fixes.push({ id: "whatsapp", label: "Lier WhatsApp (une fois)", commands: ["npm run viral:daemon   # scanne le QR avec WhatsApp > Appareils connectés"] });
  if (!p.chrome)
    fixes.push({
      id: "chrome",
      label: "Envoyer de vraies vidéos WhatsApp (sinon envoi en document)",
      commands: ["wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb", "sudo apt install ./google-chrome-stable_current_amd64.deb", "echo WHATSAPP_CHROME_PATH=/usr/bin/google-chrome >> .env"],
    });
  if (!p.postiz) fixes.push({ id: "postiz", label: "Publication automatique (sinon légende à coller)", commands: ["npm i -g postiz", "postiz auth:login"] });
  if (!p.youtubeKey) fixes.push({ id: "youtube", label: "Tendances YouTube du Cameroun (clé gratuite)", commands: ["echo YOUTUBE_API_KEY=ta_cle >> .env"] });
  if (!p.apify) fixes.push({ id: "apify", label: "Tendances TikTok Creative Center (optionnel, offre gratuite)", commands: ["echo APIFY_TOKEN=ton_token >> .env"] });

  return {
    canRender: true,
    voice: p.piperVoice ? ("piper" as const) : p.kokoro ? ("kokoro" as const) : ("silent" as const),
    llm: p.ollama ? ("ollama" as const) : ("secours" as const),
    publishMode: p.postiz ? ("postiz" as const) : ("manual" as const),
    notify: p.whatsappSession ? ("whatsapp" as const) : ("console" as const),
    fixes,
  };
}

export function formatDiagnosis(d: ReturnType<typeof diagnose>): string {
  const lines = [
    "SEPTIM-VIRAL-OS : état de l'usine",
    `Rendu       : prêt (Remotion, gratuit)`,
    `Voix        : ${d.voice === "silent" ? "silencieuse (aucune voix installée)" : d.voice}`,
    `Script auto : ${d.llm === "ollama" ? "Ollama" : "script de secours (Ollama absent)"}`,
    `Publication : ${d.publishMode === "postiz" ? "Postiz" : "manuelle (légende prête à coller)"}`,
    `Messages    : ${d.notify === "whatsapp" ? "WhatsApp" : "console (WhatsApp pas encore lié)"}`,
  ];
  for (const f of d.fixes) lines.push("", `À faire : ${f.label}`, ...f.commands.map((c) => `  ${c}`));
  return lines.join("\n");
}

export async function probe(cfg: ViralConfig, env: Record<string, string | undefined> = process.env): Promise<Probes> {
  const voiceDir = env.VIRAL_PIPER_DIR ?? join(cfg.home, "voices");
  const voice = env.VIRAL_PIPER_VOICE ?? "fr_FR-tom-medium";
  const ollama = await fetch(`${cfg.ollama.host}/api/tags`, { signal: AbortSignal.timeout(2000) })
    .then((r) => r.ok)
    .catch(() => false);
  const kokoro = await import("kokoro-js" as string).then(() => true).catch(() => false);
  const { hasPostizCredentials } = await import("./publish");
  return {
    ollama,
    piperVoice: existsSync(join(voiceDir, `${voice}.onnx`)) && spawnSync("python3", ["-c", "import piper"], { stdio: "ignore" }).status === 0,
    kokoro,
    chrome: !!env.WHATSAPP_CHROME_PATH && existsSync(env.WHATSAPP_CHROME_PATH),
    postiz: !!env.POSTIZ_API_KEY || hasPostizCredentials(),
    whatsappSession: existsSync(join(cfg.home, "wa")),
    youtubeKey: !!env.YOUTUBE_API_KEY,
    apify: !!env.APIFY_TOKEN,
  };
}

if (process.argv[1]?.endsWith("doctor.ts")) {
  loadDotEnv();
  const cfg = loadConfig();
  probe(cfg).then((p) => console.log(formatDiagnosis(diagnose(p))));
}
