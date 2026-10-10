import { describe, expect, it } from "vitest";
import { createNotifierHub, qrToDataUrl } from "../notifier-hub";
import { createWhatsAppNotifier, type Notifier } from "../notify";
import { loadConfig } from "../config";

type Deps = { onQr?: (qr: string) => void; onReady?: () => void };
function fakes() {
  const log: string[] = [];
  const handlers: { kind: string; fn: (t: string) => void }[] = [];
  const startGate: { resolve: () => void; reject: (e: Error) => void }[] = [];
  let waDeps: Deps = {};
  const make = (kind: "whatsapp" | "console", _cfg: unknown, deps: Deps): Notifier => {
    if (kind === "whatsapp") waDeps = deps;
    return {
      async start() {
        log.push(`start:${kind}`);
        if (kind === "whatsapp") await new Promise<void>((resolve, reject) => startGate.push({ resolve, reject }));
      },
      async send(text) {
        log.push(`send:${kind}:${text}`);
      },
      onMessage(fn) {
        handlers.push({ kind, fn });
      },
      async stop() {
        log.push(`stop:${kind}`);
      },
    };
  };
  const hub = createNotifierHub({ cfg: () => loadConfig({}), create: make, toQr: async (raw) => `data:image/svg+xml;base64,${raw}` });
  return { hub, log, handlers, startGate, deps: () => waDeps };
}

describe("hub de notifications : WhatsApp à chaud, avec son QR code", () => {
  it("use(whatsapp) rend la main tout de suite (état « starting ») ; le QR arrive, puis « ready » efface le QR", async () => {
    const f = fakes();
    await f.hub.use("whatsapp");
    expect(f.hub.state()).toEqual({ state: "starting" });
    f.deps().onQr!("RAW1");
    await new Promise((r) => setTimeout(r, 5));
    expect(f.hub.state()).toEqual({ state: "qr", qr: "data:image/svg+xml;base64,RAW1" });
    f.deps().onQr!("RAW2");
    await new Promise((r) => setTimeout(r, 5));
    expect(f.hub.state().qr).toContain("RAW2");
    f.startGate[0].resolve();
    await new Promise((r) => setTimeout(r, 5));
    expect(f.hub.state()).toEqual({ state: "ready" });
  });

  it("avant « ready » les messages vont à la console (rien ne se perd, rien ne plante) ; après, à WhatsApp", async () => {
    const f = fakes();
    await f.hub.use("whatsapp");
    await f.hub.send("avant");
    f.startGate[0].resolve();
    await new Promise((r) => setTimeout(r, 5));
    await f.hub.send("après");
    expect(f.log).toContain("send:console:avant");
    expect(f.log).toContain("send:whatsapp:après");
  });

  it("les réponses (OUI #ref) arrivent aux écouteurs, qu'ils aient été posés avant ou après le basculement", async () => {
    const f = fakes();
    const got: string[] = [];
    f.hub.onMessage((t) => got.push(t));
    await f.hub.use("whatsapp");
    f.startGate[0].resolve();
    await new Promise((r) => setTimeout(r, 5));
    f.handlers.filter((h) => h.kind === "whatsapp").forEach((h) => h.fn("OUI #5f8a"));
    expect(got).toEqual(["OUI #5f8a"]);
  });

  it("use(console) arrête WhatsApp et remet l'état à « off » ; redemander le même mode ne relance rien", async () => {
    const f = fakes();
    await f.hub.use("whatsapp");
    f.startGate[0].resolve();
    await new Promise((r) => setTimeout(r, 5));
    await f.hub.use("whatsapp");
    expect(f.log.filter((l) => l === "start:whatsapp")).toHaveLength(1);
    await f.hub.use("console");
    expect(f.log).toContain("stop:whatsapp");
    expect(f.hub.state()).toEqual({ state: "off" });
  });

  it("WhatsApp qui ne démarre pas (Chromium absent…) → état « error » avec la phrase, la console prend le relais", async () => {
    const f = fakes();
    await f.hub.use("whatsapp");
    f.startGate[0].reject(new Error("Browser was not found"));
    await new Promise((r) => setTimeout(r, 5));
    expect(f.hub.state()).toEqual({ state: "error", error: "Browser was not found" });
    await f.hub.send("x");
    expect(f.log).toContain("send:console:x");
  });
});

describe("notifieur WhatsApp : signaux pour le hub", () => {
  it("le QR et « prêt » sont signalés par onQr / onReady, sans toucher au comportement terminal", async () => {
    const handlers: Record<string, (v?: unknown) => void> = {};
    class FakeClient {
      info = { wid: { _serialized: "237@c.us" } };
      constructor(public opts: unknown) {}
      on(e: string, fn: (v?: unknown) => void) {
        handlers[e] = fn;
      }
      once(e: string, fn: (v?: unknown) => void) {
        handlers[`once:${e}`] = fn;
      }
      async initialize() {
        handlers.qr?.("QR-RAW");
        setTimeout(() => handlers["once:ready"]?.(), 0);
      }
      async destroy() {}
    }
    const seen: string[] = [];
    const printed: string[] = [];
    const n = createWhatsAppNotifier(loadConfig({ VIRAL_HOME: "/tmp/septim-wa-test" }), {
      load: async () => ({ lib: { Client: FakeClient, LocalAuth: class {}, MessageMedia: {} }, qrcode: { generate: (qr: string) => void printed.push(qr) } }),
      exit: () => undefined,
      onQr: (qr) => void seen.push(`qr:${qr}`),
      onReady: () => void seen.push("ready"),
    });
    await n.start();
    expect(seen).toEqual(["qr:QR-RAW", "ready"]);
    expect(printed).toEqual(["QR-RAW"]);
  });
});

describe("QR code", () => {
  it("qrToDataUrl : une image SVG (data URL) que la page affiche dans <img>, sans innerHTML", async () => {
    const url = await qrToDataUrl("2@abcdef,xyz");
    expect(url.startsWith("data:image/svg+xml;base64,")).toBe(true);
    const svg = Buffer.from(url.split(",")[1], "base64").toString("utf8");
    expect(svg).toContain("<svg");
    expect(svg).not.toContain("<script");
  });
});
