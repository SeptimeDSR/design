import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { createConsoleNotifier } from "../notify";
import { formatReadyMessage, jobRef } from "../message";
import { fallbackScript } from "../heat";
import { buildTimeline } from "../story";
import type { Job } from "../store";

function job(over: Partial<Job> = {}): Job {
  const script = fallbackScript({ topic: "la tontine", lang: "fr", formula: "secret", template: "maths" });
  return {
    id: "a1b2c3d4",
    createdAt: new Date().toISOString(),
    status: "rendered",
    request: {},
    script,
    timeline: buildTimeline(script),
    arm: "maths:secret",
    source: "ollama",
    ttsEngine: "piper",
    jobDir: "/tmp/x",
    ...over,
  };
}

describe("formatReadyMessage", () => {
  it("contient la référence, le hook, la légende et la consigne OUI #ref", () => {
    const text = formatReadyMessage(job(), "postiz-cloud", ["tiktok", "youtube", "instagram", "facebook"]);
    expect(text).toContain(`#${jobRef(job())}`);
    expect(text).toContain(job().script.hook);
    expect(text).toContain(job().script.caption);
    expect(text).toContain(`OUI #${jobRef(job())}`);
    expect(text).toMatch(/TikTok, YouTube, Instagram, Facebook/);
    expect(text.startsWith("🎬 Septim")).toBe(true);
  });

  it("en mode manuel, promet la légende à coller", () => {
    expect(formatReadyMessage(job(), "manual", ["tiktok"])).toContain("légende prête à coller");
  });

  it("signale le son tendance à ajouter dans l'app", () => {
    const text = formatReadyMessage(job({ trend: { title: "x", source: "tiktok", sound: "Coup du marteau", score: 1 } }), "manual", ["tiktok"]);
    expect(text).toContain("Coup du marteau");
  });

  it("avoue le script de secours", () => {
    expect(formatReadyMessage(job({ source: "fallback" }), "manual", ["tiktok"])).toContain("script de secours");
  });
});

describe("notificateur console", () => {
  it("affiche les messages et transmet les réponses tapées", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let printed = "";
    output.on("data", (d) => (printed += d));
    const n = createConsoleNotifier({ input, output });
    const replies: string[] = [];
    n.onMessage((t) => replies.push(t));
    await n.start();
    await n.send("🎬 Septim · test", "/tmp/v.mp4");
    input.write("oui\n");
    await new Promise((r) => setTimeout(r, 20));
    expect(printed).toContain("🎬 Septim · test");
    expect(printed).toContain("/tmp/v.mp4");
    expect(replies).toEqual(["oui"]);
    await n.stop();
  });
});

describe("formatReadyMessage : ce qu'on accepte = ce qui se passera", () => {
  it("ne liste que les plateformes configurées", () => {
    const text = formatReadyMessage(job(), "postiz-cloud", ["tiktok", "instagram"]);
    expect(text).toMatch(/TikTok, Instagram/);
    expect(text).not.toMatch(/YouTube/);
  });

  it("Postiz auto-hébergé : prévient que TikTok et YouTube restent privés", () => {
    expect(formatReadyMessage(job(), "postiz-self", ["tiktok", "youtube"])).toMatch(/privé/);
  });
});

describe("WhatsApp : jamais sourd", () => {
  async function started(event: string) {
    const { EventEmitter } = await import("node:events");
    const { createWhatsAppNotifier } = await import("../notify");
    class Client extends EventEmitter {
      info = { wid: { _serialized: "me@c.us" } };
      async initialize() {
        setTimeout(() => this.emit("ready"), 0);
      }
    }
    const client: { current?: Client } = {};
    const lib = {
      Client: class extends Client {
        constructor() {
          super();
          client.current = this;
        }
      },
      LocalAuth: class {},
      MessageMedia: {},
    };
    const exits: number[] = [];
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const n = createWhatsAppNotifier({ home: "/tmp/septim-wa-test" } as never, {
      load: async () => ({ lib, qrcode: { generate: () => undefined } }),
      exit: (code) => void exits.push(code),
    });
    await n.start();
    client.current!.emit(event, "LOGOUT");
    errors.mockRestore();
    log.mockRestore();
    return exits;
  }

  it("déconnecté → le processus quitte (pm2 relance)", async () => {
    expect(await started("disconnected")).toEqual([1]);
  });

  it("échec d'authentification → le processus quitte", async () => {
    expect(await started("auth_failure")).toEqual([1]);
  });
});
