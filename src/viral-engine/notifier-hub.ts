import QRCode from "qrcode";
import type { ViralConfig } from "./config";
import { createNotifier, type Notifier, type WhatsAppDeps } from "./notify";

export type HubState = { state: "off" | "starting" | "qr" | "ready" | "error"; qr?: string; error?: string };
type Kind = "whatsapp" | "console";

// Le QR de WhatsApp en image SVG (data URL) : la page l'affiche dans un <img>, jamais par innerHTML.
export async function qrToDataUrl(raw: string): Promise<string> {
  const svg = await QRCode.toString(raw, { type: "svg", margin: 2, errorCorrectionLevel: "M" });
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

// Un seul interlocuteur pour l'usine : WhatsApp ou la console, changeable à chaud depuis le Studio.
// Tant que WhatsApp n'est pas lié, les messages vont à la console : rien ne se perd.
export function createNotifierHub(o: {
  cfg: () => ViralConfig;
  create?: (kind: Kind, cfg: ViralConfig, deps: WhatsAppDeps) => Notifier;
  toQr?: (raw: string) => Promise<string>;
}) {
  const create = o.create ?? createNotifier;
  const toQr = o.toQr ?? qrToDataUrl;
  const handlers: ((t: string, meta?: { quoted?: string }) => void)[] = [];
  let consoleN: Notifier | undefined;
  const console_ = () => (consoleN ??= create("console", o.cfg(), {}));
  let current: Notifier | undefined;
  let kind: Kind | undefined;
  let state: HubState = { state: "off" };
  let generation = 0;
  let consoleStarted = false;

  const ensureConsole = async () => {
    if (consoleStarted) return;
    consoleStarted = true;
    console_().onMessage((t) => handlers.forEach((h) => h(t)));
    await console_().start();
  };

  async function use(next: Kind): Promise<void> {
    if (next === kind) return;
    const mine = ++generation;
    const old = current;
    current = undefined;
    kind = next;
    await old?.stop().catch(() => undefined);
    if (next === "console") {
      state = { state: "off" };
      await ensureConsole();
      return;
    }
    state = { state: "starting" };
    await ensureConsole();
    const wa = create("whatsapp", o.cfg(), {
      onQr: (raw) =>
        void toQr(raw).then((qr) => {
          if (generation === mine) state = { state: "qr", qr };
        }),
      onReady: () => {
        if (generation === mine) state = { state: "ready" };
      },
    });
    handlers.forEach((h) => wa.onMessage(h));
    current = wa;
    // start() n'aboutit qu'une fois le téléphone lié : on ne bloque ni le Studio ni le démon.
    void wa.start().then(
      () => {
        if (generation === mine) state = { state: "ready" };
      },
      (error: Error) => {
        if (generation !== mine) return;
        state = { state: "error", error: error.message };
        current = undefined;
      },
    );
  }

  return {
    use,
    state: (): HubState => state,
    kind: () => kind,
    async start() {
      await ensureConsole();
    },
    async send(text: string, mediaPath?: string) {
      if (current && state.state === "ready") return current.send(text, mediaPath);
      return console_().send(text, mediaPath);
    },
    onMessage(h: (t: string, meta?: { quoted?: string }) => void) {
      handlers.push(h);
      current?.onMessage(h);
    },
    async stop() {
      generation++;
      await current?.stop().catch(() => undefined);
      await consoleN?.stop();
    },
  } satisfies Notifier & { use: typeof use; state: () => HubState; kind: () => Kind | undefined };
}

export type NotifierHub = ReturnType<typeof createNotifierHub>;
