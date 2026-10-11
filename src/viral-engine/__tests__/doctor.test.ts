import { describe, expect, it } from "vitest";
import { diagnose, formatDiagnosis } from "../doctor";

const allMissing = { ollama: false, piperVoice: false, kokoro: false, chrome: false, postiz: false, whatsappSession: false, youtubeKey: false, apify: false, comfyui: false, pexels: false, pixabay: false, musicTracks: 0, chatterbox: false, ttsPref: "auto" };

describe("doctor", () => {
  it("sans rien d'installé, l'usine tourne quand même en FREE minimal", () => {
    const d = diagnose(allMissing);
    expect(d.canRender).toBe(true);
    expect(d.voice).toBe("silent");
    expect(d.publishMode).toBe("manual");
    expect(d.fixes.find((f) => f.id === "voice")?.commands.join(" ")).toContain("septim setup --voix");
    expect(d.fixes.find((f) => f.id === "llm")?.commands.join(" ")).toContain("ollama pull qwen2.5");
  });

  it("tout installé : voix Piper, Postiz, aucune correction requise", () => {
    const d = diagnose({ ...allMissing, ollama: true, piperVoice: true, chrome: true, postiz: true, whatsappSession: true, youtubeKey: true, pexels: true, musicTracks: 3, chatterbox: true });
    expect(d.voice).toBe("piper");
    expect(d.publishMode).toBe("postiz");
    expect(d.fixes.filter((f) => f.id !== "apify")).toEqual([]);
  });

  it("le rapport est lisible et signale clairement la voix silencieuse", () => {
    expect(formatDiagnosis(diagnose(allMissing))).toMatch(/Voix\s*:\s*silencieuse/);
  });

  it("gratuit d'abord : l'étage de B-roll, la musique et la voix HD, avec la commande gratuite pour monter d'un cran", () => {
    const none = diagnose(allMissing);
    expect(none.broll).toBe("procedural");
    expect(none.music).toBe("procedural");
    expect(none.fixes.find((f) => f.id === "broll")?.commands.join(" ")).toMatch(/PEXELS_API_KEY/);
    expect(none.fixes.find((f) => f.id === "music")?.commands.join(" ")).toMatch(/VIRAL_MUSIC_DIR/);
    expect(none.fixes.find((f) => f.id === "voice-hd")?.commands.join(" ")).toMatch(/septim setup --voix-hd/);
    expect(diagnose({ ...allMissing, pexels: true }).broll).toBe("pexels");
    expect(diagnose({ ...allMissing, pexels: true, comfyui: true }).broll).toBe("comfyui");
    expect(diagnose({ ...allMissing, pixabay: true }).broll).toBe("pixabay");
    expect(diagnose({ ...allMissing, musicTracks: 2 }).music).toBe("pistes");
    expect(diagnose({ ...allMissing, chatterbox: true, ttsPref: "chatterbox" }).voice).toBe("chatterbox");
    const text = formatDiagnosis(diagnose({ ...allMissing, pexels: true }));
    expect(text).toMatch(/Plans\s*:\s*Pexels/);
    expect(text).toMatch(/Musique\s*:\s*nappe lo-fi/);
  });

  it("les commandes « >> .env » visent le .env de l'usine (chemin absolu), quel que soit le dossier où l'on tape", () => {
    const d = diagnose(allMissing, { envFile: "/home/ana/mon septim/.env" });
    const appends = d.fixes.flatMap((f) => f.commands).filter((c) => c.includes(">>"));
    expect(appends.length).toBeGreaterThanOrEqual(4);
    for (const c of appends) expect(c, c).toContain(">> '/home/ana/mon septim/.env'");
  });
});

describe("doctor : suit les interrupteurs des Réglages", () => {
  it("voix coupée (VIRAL_TTS=silent) → « silent » même si Piper est installé", () => {
    expect(diagnose({ ...allMissing, piperVoice: true, ttsPref: "silent" }).voice).toBe("silent");
    expect(diagnose({ ...allMissing, piperVoice: true, ttsPref: "auto" }).voice).toBe("piper");
    expect(diagnose({ ...allMissing, kokoro: true, ttsPref: "silent" }).voice).toBe("silent");
  });

  it("dans Docker, aucune commande de l'hôte : chaque correction renvoie vers Studio > Réglages > la fonction", () => {
    const d = diagnose(allMissing, { docker: true });
    for (const f of d.fixes) {
      const text = f.commands.join(" ");
      expect(text, f.id).toMatch(/Réglages/);
      expect(text, f.id).not.toMatch(/>> |sudo |curl |septim setup|npm i /);
    }
    expect(d.fixes.find((f) => f.id === "broll")?.commands.join(" ")).toMatch(/Pexels/);
    expect(d.fixes.find((f) => f.id === "postiz")?.commands.join(" ")).toMatch(/Publication/);
    expect(d.fixes.find((f) => f.id === "whatsapp")?.commands.join(" ")).toMatch(/QR/);
  });

  it("probe : publication coupée ou WhatsApp coupé ne comptent pas, même avec clé et session présentes", async () => {
    const { probe } = await import("../doctor");
    const { loadConfig } = await import("../config");
    const { mkdirSync, mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const home = mkdtempSync(join(tmpdir(), "septim-doc-"));
    mkdirSync(join(home, "wa"));
    const env = { VIRAL_HOME: home, OLLAMA_HOST: "http://127.0.0.1:9", POSTIZ_API_KEY: "k", VIRAL_PUBLISH_MODE: "manual", VIRAL_NOTIFIER: "console" };
    const p = await probe(loadConfig(env), env);
    expect(p.postiz).toBe(false);
    expect(p.whatsappSession).toBe(false);
    const on = await probe(loadConfig({ ...env, VIRAL_PUBLISH_MODE: undefined, VIRAL_NOTIFIER: "whatsapp" }), { ...env, VIRAL_PUBLISH_MODE: undefined, VIRAL_NOTIFIER: "whatsapp" });
    expect(on.postiz).toBe(true);
    expect(on.whatsappSession).toBe(true);
  });

  it("probe : Piper et Chatterbox se reconnaissent aux fichiers, sans lancer Python (importer torch prend des secondes)", async () => {
    const { probe } = await import("../doctor");
    const { loadConfig } = await import("../config");
    const { mkdirSync, mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const home = mkdtempSync(join(tmpdir(), "septim-doc-"));
    const env = { VIRAL_HOME: home, OLLAMA_HOST: "http://127.0.0.1:9", VIRAL_PYTHON: "/chemin/qui/n/existe/pas" };
    expect((await probe(loadConfig(env), env)).chatterbox).toBe(false);
    mkdirSync(join(home, "venv", "lib", "python3.12", "site-packages", "chatterbox"), { recursive: true });
    mkdirSync(join(home, "venv", "lib", "python3.12", "site-packages", "piper"), { recursive: true });
    mkdirSync(join(home, "voices"), { recursive: true });
    writeFileSync(join(home, "voices", "fr_FR-tom-medium.onnx"), "");
    const p = await probe(loadConfig(env), env);
    expect(p.chatterbox).toBe(true);
    expect(p.piperVoice).toBe(true);
  });
});

