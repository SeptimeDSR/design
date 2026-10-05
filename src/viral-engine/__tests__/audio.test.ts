import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { encodeWav, wavDurationMs } from "../wav";
import { ambientSamples, writeAmbient } from "../ambient";
import { detectEngine, synthesize } from "../tts";
import { estimateSpokenMs } from "../heat";

const tmp = () => mkdtempSync(join(tmpdir(), "septim-audio-"));

describe("wav", () => {
  it("aller-retour : 48000 échantillons à 48 kHz = 1000 ms", () => {
    const buf = encodeWav(new Float32Array(48000), 48000);
    expect(buf.subarray(0, 4).toString()).toBe("RIFF");
    expect(buf.subarray(8, 12).toString()).toBe("WAVE");
    expect(wavDurationMs(buf)).toBe(1000);
  });
});

describe("ambient", () => {
  it("bonne longueur, crête douce, non silencieux", () => {
    const s = ambientSamples(2, 22050, 1);
    expect(s.length).toBe(44100);
    const peak = s.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(0.5);
  });

  it("déterministe par seed, différent entre seeds", () => {
    expect(ambientSamples(1, 8000, 3)).toEqual(ambientSamples(1, 8000, 3));
    expect(ambientSamples(1, 8000, 3)).not.toEqual(ambientSamples(1, 8000, 4));
  });

  it("écrit un WAV de la durée demandée", async () => {
    const path = await writeAmbient(join(tmp(), "bed.wav"), 3, 9);
    expect(wavDurationMs(readFileSync(path))).toBe(3000);
  });
});

describe("tts", () => {
  it("le moteur silencieux produit un WAV de la durée parlée estimée", async () => {
    const text = "Personne ne t'a jamais dit ça…";
    const out = await synthesize(text, { lang: "fr", outPath: join(tmp(), "hook.wav"), engine: "silent" });
    expect(out.engine).toBe("silent");
    expect(existsSync(out.path)).toBe(true);
    expect(Math.abs(out.durationMs - estimateSpokenMs(text, "fr"))).toBeLessThanOrEqual(50);
  });

  it("sans voix Piper installée, retombe sur le silencieux en français", async () => {
    process.env.VIRAL_PIPER_DIR = tmp();
    expect(await detectEngine("fr")).toBe("silent");
  });

  it("respecte un moteur forcé", async () => {
    expect(await detectEngine("en", "silent")).toBe("silent");
  });
});

describe("python de Piper", () => {
  it("prend VIRAL_PYTHON s'il est défini, sinon le venv de l'usine s'il existe, sinon python3", async () => {
    const { pythonBin } = await import("../tts");
    const home = mkdtempSync(join(tmpdir(), "septim-py-"));
    expect(pythonBin({ VIRAL_HOME: home })).toBe("python3");
    const venvPython = join(home, "venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(join(venvPython, ".."), { recursive: true });
    writeFileSync(venvPython, "");
    expect(pythonBin({ VIRAL_HOME: home })).toBe(venvPython);
    expect(pythonBin({ VIRAL_HOME: home, VIRAL_PYTHON: "/opt/py/bin/python3" })).toBe("/opt/py/bin/python3");
  });
});
