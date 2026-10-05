import { describe, expect, it } from "vitest";
import { diagnose, formatDiagnosis } from "../doctor";

const allMissing = { ollama: false, piperVoice: false, kokoro: false, chrome: false, postiz: false, whatsappSession: false, youtubeKey: false, apify: false };

describe("doctor", () => {
  it("sans rien d'installé, l'usine tourne quand même en FREE minimal", () => {
    const d = diagnose(allMissing);
    expect(d.canRender).toBe(true);
    expect(d.voice).toBe("silent");
    expect(d.publishMode).toBe("manual");
    expect(d.fixes.find((f) => f.id === "voice")?.commands.join(" ")).toContain("piper.download_voices fr_FR-tom-medium");
    expect(d.fixes.find((f) => f.id === "llm")?.commands.join(" ")).toContain("ollama pull qwen2.5");
  });

  it("tout installé : voix Piper, Postiz, aucune correction requise", () => {
    const d = diagnose({ ...allMissing, ollama: true, piperVoice: true, chrome: true, postiz: true, whatsappSession: true, youtubeKey: true });
    expect(d.voice).toBe("piper");
    expect(d.publishMode).toBe("postiz");
    expect(d.fixes.filter((f) => f.id !== "apify")).toEqual([]);
  });

  it("le rapport est lisible et signale clairement la voix silencieuse", () => {
    expect(formatDiagnosis(diagnose(allMissing))).toMatch(/Voix\s*:\s*silencieuse/);
  });
});
