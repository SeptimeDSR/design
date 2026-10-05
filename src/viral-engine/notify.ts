import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import type { ViralConfig } from "./config";
import { BOT_PREFIX } from "./message";

export type Notifier = {
  start(): Promise<void>;
  send(text: string, mediaPath?: string): Promise<void>;
  onMessage(handler: (text: string) => void): void;
  stop(): Promise<void>;
};

// Mode dev / sans WhatsApp : les messages s'affichent, les réponses se tapent dans le terminal.
export function createConsoleNotifier(io: { input?: Readable; output?: Writable } = {}): Notifier {
  const input = io.input ?? process.stdin;
  const output = io.output ?? process.stdout;
  const handlers: ((t: string) => void)[] = [];
  let rl: ReturnType<typeof createInterface> | undefined;
  return {
    async start() {
      rl = createInterface({ input, terminal: false });
      rl.on("line", (line) => line.trim() && handlers.forEach((h) => h(line.trim())));
    },
    async send(text, mediaPath) {
      output.write(`\n${text}${mediaPath ? `\n📎 ${mediaPath}` : ""}\n`);
    },
    onMessage: (h) => void handlers.push(h),
    async stop() {
      rl?.close();
    },
  };
}

// WhatsApp perso via whatsapp-web.js (non officiel : un seul destinataire, faible volume).
export function createWhatsAppNotifier(cfg: ViralConfig): Notifier {
  const handlers: ((t: string) => void)[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let client: any;
  let target = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let MessageMedia: any;
  const chromePath = process.env.WHATSAPP_CHROME_PATH;

  return {
    async start() {
      const wa = await import("whatsapp-web.js");
      const qrcode = (await import("qrcode-terminal")).default;
      const lib = (wa.default ?? wa) as typeof wa;
      MessageMedia = lib.MessageMedia;
      client = new lib.Client({
        authStrategy: new lib.LocalAuth({ dataPath: join(cfg.home, "wa") }),
        puppeteer: { headless: true, executablePath: chromePath, args: ["--no-sandbox"] },
      });
      client.on("qr", (qr: string) => {
        console.log("Scanne ce QR avec WhatsApp (Appareils connectés) :");
        qrcode.generate(qr, { small: true });
      });
      const ready = new Promise<void>((resolve) => client.once("ready", resolve));
      await client.initialize();
      await ready;
      const self = client.info.wid._serialized as string;
      target = cfg.whatsappTo ? `${cfg.whatsappTo.replace(/\D/g, "")}@c.us` : self;

      client.on("message_create", (msg: { body: string; from: string; to: string; fromMe: boolean }) => {
        if (!msg.body || msg.body.startsWith(BOT_PREFIX)) return;
        const fromTarget = target === self ? msg.fromMe && msg.to === self : msg.from === target;
        if (fromTarget) handlers.forEach((h) => h(msg.body));
      });
      console.log(`WhatsApp connecté, messages vers ${target === self ? "toi-même" : target}.`);
    },
    async send(text, mediaPath) {
      if (!mediaPath) {
        await client.sendMessage(target, text);
        return;
      }
      const media = MessageMedia.fromFilePath(mediaPath);
      // Chromium ne sait pas encoder les vidéos WhatsApp : sans Google Chrome, on envoie un document (lisible sur le téléphone).
      const asDocument = !chromePath || statSync(mediaPath).size > 16 * 1024 * 1024;
      await client.sendMessage(target, media, { caption: text, sendMediaAsDocument: asDocument });
    },
    onMessage: (h) => void handlers.push(h),
    async stop() {
      await client?.destroy();
    },
  };
}

// Le CLI ne doit jamais rester bloqué sur un QR : seul le démon (interactif) lie WhatsApp.
export function chooseNotifier(opts: { requested: "whatsapp" | "console"; sessionExists: boolean; interactive: boolean }): {
  kind: "whatsapp" | "console";
  warning?: string;
} {
  if (opts.requested === "console") return { kind: "console" };
  if (opts.sessionExists || opts.interactive) return { kind: "whatsapp" };
  return { kind: "console", warning: "WhatsApp pas encore lié : lance une fois `npm run viral:daemon` et scanne le QR. Message affiché ici en attendant." };
}

export const whatsappSessionExists = (cfg: ViralConfig) => existsSync(join(cfg.home, "wa"));

export function createNotifier(kind: "whatsapp" | "console", cfg: ViralConfig): Notifier {
  return kind === "whatsapp" ? createWhatsAppNotifier(cfg) : createConsoleNotifier();
}
