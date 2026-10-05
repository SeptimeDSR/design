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
