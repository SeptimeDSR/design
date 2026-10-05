import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { loadConfig, loadDotEnv, type ViralConfig } from "./config";
import { pythonBin } from "./tts";

export type Probes = {
  ollama: boolean;
  piperVoice: boolean;
  kokoro: boolean;
  chrome: boolean;
  postiz: boolean;
  whatsappSession: boolean;
  youtubeKey: boolean;
  apify: boolean;
  // Gratuit d'abord (D22–D26)
  comfyui: boolean;
  pexels: boolean;
  pixabay: boolean;
  musicTracks: number;
  chatterbox: boolean;
  ttsPref: string;
};

export type Fix = { id: string; label: string; commands: string[] };

// Les commandes « >> .env » visent le .env de l'usine : septim se tape depuis n'importe quel dossier.
export function diagnose(p: Probes, opts: { envFile?: string } = {}) {
  const fixes: Fix[] = [];
  const env = `'${(opts.envFile ?? ".env").replace(/'/g, "'\\''")}'`;
  if (!p.piperVoice)
    fixes.push({
      id: "voice",
      label: "Voix française gratuite (sinon piste silencieuse)",
      commands: ["septim setup --voix   # Piper (gratuit, local) dans .septim-viral/venv + voix fr_FR-tom-medium"],
    });
  if (!p.ollama)
    fixes.push({
      id: "llm",
      label: "LLM local pour le démon (sinon script de secours ; en interactif, Claude écrit le script)",
      commands: ["curl -fsSL https://ollama.com/install.sh | sh", "ollama pull qwen2.5:7b"],
    });
  if (!p.whatsappSession) fixes.push({ id: "whatsapp", label: "Lier WhatsApp (une fois)", commands: ["septim start   # scanne le QR avec WhatsApp > Appareils connectés"] });
  if (!p.chrome)
    fixes.push({
      id: "chrome",
      label: "Envoyer de vraies vidéos WhatsApp (sinon envoi en document)",
      commands: ["wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb", "sudo apt install ./google-chrome-stable_current_amd64.deb", `echo WHATSAPP_CHROME_PATH=/usr/bin/google-chrome >> ${env}`],
    });
  if (!p.postiz) fixes.push({ id: "postiz", label: "Publication automatique (sinon légende à coller)", commands: ["npm i -g postiz", "postiz auth:login"] });
  if (!p.youtubeKey) fixes.push({ id: "youtube", label: "Tendances YouTube du Cameroun (clé gratuite)", commands: [`echo YOUTUBE_API_KEY=ta_cle >> ${env}`] });
  if (!p.apify) fixes.push({ id: "apify", label: "Tendances TikTok Creative Center (optionnel, offre gratuite)", commands: [`echo APIFY_TOKEN=ton_token >> ${env}`] });
  if (!p.comfyui && !p.pexels && !p.pixabay)
    fixes.push({
      id: "broll",
      label: "Vrais plans vidéo en rapport avec le sujet, gratuits (sinon fonds animés)",
      commands: [
        `echo PEXELS_API_KEY=ta_cle >> ${env}   # clé gratuite en 1 minute : https://www.pexels.com/api/`,
        "# avec une carte NVIDIA 8 Go+ : IA locale ComfyUI + Wan 2.2, voir docs/GUIDE.md « Gratuit d'abord »",
      ],
    });
  if (!p.musicTracks)
    fixes.push({
      id: "music",
      label: "Ta musique sous la voix (optionnel ; sinon nappe lo-fi générée)",
      commands: [`mkdir -p ~/septim-musique && echo VIRAL_MUSIC_DIR=$HOME/septim-musique >> ${env}   # pistes libres de droits ou générées avec ACE-Step`],
    });
  if (!p.chatterbox) fixes.push({ id: "voice-hd", label: "Voix HD expressive et clonage de ta voix (optionnel, GPU conseillé)", commands: ["septim setup --voix-hd   # Chatterbox Multilingual, licence MIT, puis VIRAL_TTS=chatterbox"] });

  return {
    canRender: true,
    voice: p.chatterbox && p.ttsPref === "chatterbox" ? ("chatterbox" as const) : p.piperVoice ? ("piper" as const) : p.kokoro ? ("kokoro" as const) : ("silent" as const),
    broll: p.comfyui ? ("comfyui" as const) : p.pexels ? ("pexels" as const) : p.pixabay ? ("pixabay" as const) : ("procedural" as const),
    music: p.musicTracks > 0 ? ("pistes" as const) : ("procedural" as const),
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
    `Plans       : ${{ comfyui: "IA locale ComfyUI (gratuit)", pexels: "Pexels (gratuit)", pixabay: "Pixabay (gratuit)", procedural: "fonds animés générés" }[d.broll]}`,
    `Musique     : ${d.music === "pistes" ? "tes pistes" : "nappe lo-fi générée"}`,
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
    piperVoice: existsSync(join(voiceDir, `${voice}.onnx`)) && spawnSync(pythonBin({ ...env, VIRAL_HOME: cfg.home }), ["-c", "import piper"], { stdio: "ignore" }).status === 0,
    kokoro,
    chrome: !!env.WHATSAPP_CHROME_PATH && existsSync(env.WHATSAPP_CHROME_PATH),
    postiz: !!env.POSTIZ_API_KEY || hasPostizCredentials(),
    whatsappSession: existsSync(join(cfg.home, "wa")),
    youtubeKey: !!env.YOUTUBE_API_KEY,
    apify: !!env.APIFY_TOKEN,
    comfyui: !!env.COMFYUI_URL && (await fetch(`${env.COMFYUI_URL.replace(/\/+$/, "")}/system_stats`, { signal: AbortSignal.timeout(2000) }).then((r) => r.ok).catch(() => false)),
    pexels: !!env.PEXELS_API_KEY?.trim(),
    pixabay: !!env.PIXABAY_API_KEY?.trim(),
    musicTracks: env.VIRAL_MUSIC_DIR && existsSync(env.VIRAL_MUSIC_DIR) ? readdirSync(env.VIRAL_MUSIC_DIR).filter((f) => /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(f)).length : 0,
    chatterbox: spawnSync(pythonBin({ ...env, VIRAL_HOME: cfg.home }), ["-c", "import chatterbox"], { stdio: "ignore" }).status === 0,
    ttsPref: env.VIRAL_TTS ?? "auto",
  };
}

if (process.argv[1]?.endsWith("doctor.ts")) {
  loadDotEnv();
  const cfg = loadConfig();
  probe(cfg).then((p) => console.log(formatDiagnosis(diagnose(p, { envFile: resolve(".env") }))));
}
