import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SFX_FILES, sfxSamples, writeSfx } from "../sfx";
import { wavDurationMs } from "../wav";

describe("bruitages générés (gratuits, sans droits)", () => {
  it.each([
    ["hit", 300, 700],
    ["whoosh", 250, 600],
    ["riser", 1100, 1500],
    ["ding", 900, 2000],
  ] as const)("%s : son audible, sans saturation, durée %i–%i ms", (kind, min, max) => {
    const s = sfxSamples(kind, 22050);
    const ms = (s.length / 22050) * 1000;
    expect(ms).toBeGreaterThanOrEqual(min);
    expect(ms).toBeLessThanOrEqual(max);
    let peak = 0;
    let energy = 0;
    for (const v of s) {
      peak = Math.max(peak, Math.abs(v));
      energy += v * v;
    }
    expect(peak).toBeLessThanOrEqual(0.95);
    expect(peak).toBeGreaterThan(0.3);
    expect(Math.sqrt(energy / s.length)).toBeGreaterThan(0.02);
    // pas de clic : début et fin à zéro
    expect(Math.abs(s[0])).toBeLessThan(0.05);
    expect(Math.abs(s[s.length - 1])).toBeLessThan(0.05);
  });

  it("writeSfx écrit les 4 fichiers WAV dans le job", async () => {
    const dir = mkdtempSync(join(tmpdir(), "septim-sfx-"));
    await writeSfx(join(dir, "sfx"));
    for (const f of Object.values(SFX_FILES)) {
      expect(existsSync(join(dir, "sfx", f)), f).toBe(true);
      expect(wavDurationMs(readFileSync(join(dir, "sfx", f)))).toBeGreaterThan(200);
    }
  });
});
