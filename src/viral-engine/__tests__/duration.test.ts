import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkDisk,
  estimateDisk,
  estimateRenderMinutes,
  formatDuration,
  frameSize,
  GENRES,
  isLongForm,
  MAX_S,
  MIN_S,
  parseDuration,
  parseGenre,
  SHORT_MAX_S,
} from "../duration";

describe("parseDuration : la durée se tape comme on la dit", () => {
  it.each([
    ["45s", 45],
    ["45 s", 45],
    ["45 secondes", 45],
    ["3min", 180],
    ["3 min", 180],
    ["3 minutes", 180],
    ["90", 5400], // un nombre seul = des minutes
    ["1h", 3600],
    ["1 heure", 3600],
    ["1h30", 5400],
    ["1h30min", 5400],
    ["1 h 30", 5400],
    ["2h15m", 8100],
    ["1,5h", 5400],
    ["1.5 h", 5400],
    ["3min30s", 210],
    ["90min", 5400],
  ])("%s → %i s", (input, seconds) => {
    expect(parseDuration(input)).toBe(seconds);
  });

  it("un nombre déjà en secondes (API, Studio) passe tel quel", () => {
    expect(parseDuration(5400)).toBe(5400);
  });

  it.each(["", "   ", "beaucoup", "1h-30", "min", "12 jours"])("« %s » est refusé avec un exemple", (input) => {
    expect(() => parseDuration(input)).toThrow(/45s[\s\S]*3min[\s\S]*1h30/);
  });

  it("refuse le trop court et le trop long avec les bornes", () => {
    expect(() => parseDuration("5s")).toThrow(new RegExp(`${MIN_S} s`));
    expect(() => parseDuration("5h")).toThrow(/4 h/);
    expect(() => parseDuration(Number.NaN)).toThrow(/durée/i);
    expect(MAX_S).toBe(4 * 3600);
  });
});

describe("court ou long", () => {
  it("jusqu'à 60 s : le format court (Remotion) ; au-delà : le long métrage", () => {
    expect(SHORT_MAX_S).toBe(60);
    expect(isLongForm(45)).toBe(false);
    expect(isLongForm(60)).toBe(false);
    expect(isLongForm(61)).toBe(true);
    expect(isLongForm(3600)).toBe(true);
  });

  it("formatDuration parle français", () => {
    expect(formatDuration(45)).toBe("45 s");
    expect(formatDuration(180)).toBe("3 min");
    expect(formatDuration(210)).toBe("3 min 30 s");
    expect(formatDuration(3600)).toBe("1 h");
    expect(formatDuration(5400)).toBe("1 h 30");
    expect(formatDuration(8130)).toBe("2 h 15");
  });
});

describe("genres", () => {
  it("accepte le nom, sans accent ni majuscule ; refuse le reste avec la liste", () => {
    expect(parseGenre("Drame")).toBe("drame");
    expect(parseGenre("MYSTÈRE")).toBe("mystere");
    expect(parseGenre("histoire vraie")).toBe("histoire-vraie");
    expect(parseGenre(undefined)).toBeUndefined();
    expect(() => parseGenre("western")).toThrow(new RegExp(GENRES.join(", ")));
  });
});

describe("qualité et format : une vidéo légère pour un PC qui manque de place", () => {
  it("tailles paires, paysage ou vertical", () => {
    expect(frameSize("standard", "paysage")).toEqual({ width: 1280, height: 720 });
    expect(frameSize("standard", "vertical")).toEqual({ width: 720, height: 1280 });
    expect(frameSize("eco", "paysage")).toEqual({ width: 854, height: 480 });
    expect(frameSize("hd", "paysage")).toEqual({ width: 1920, height: 1080 });
    for (const q of ["eco", "standard", "hd"] as const) for (const o of ["paysage", "vertical"] as const) {
      const { width, height } = frameSize(q, o);
      expect(width % 2, `${q} ${o}`).toBe(0);
      expect(height % 2).toBe(0);
    }
  });

  it("l'estimation de place croît avec la durée et la qualité, et dit le total en Mo", () => {
    const hour = estimateDisk(3600, "standard");
    expect(hour.finalMb).toBeGreaterThan(50);
    expect(hour.totalMb).toBeGreaterThan(hour.finalMb);
    expect(estimateDisk(7200, "standard").totalMb).toBeGreaterThan(hour.totalMb);
    expect(estimateDisk(3600, "hd").totalMb).toBeGreaterThan(hour.totalMb);
    expect(estimateDisk(3600, "eco").totalMb).toBeLessThan(hour.totalMb);
  });

  it("l'estimation du temps de fabrication reste en minutes entières et croît avec la durée", () => {
    const a = estimateRenderMinutes(600, "standard");
    const b = estimateRenderMinutes(3600, "standard");
    expect(Number.isInteger(a)).toBe(true);
    expect(b).toBeGreaterThan(a);
  });

  it("checkDisk refuse quand il n'y a pas la place, en disant combien il en faut et que faire", () => {
    const dir = mkdtempSync(join(tmpdir(), "disk-"));
    try {
      const need = estimateDisk(3600, "standard").totalMb;
      const roomy = checkDisk(dir, 3600, "standard", { freeMb: need * 10 });
      expect(roomy.ok).toBe(true);
      const tight = checkDisk(dir, 3600, "standard", { freeMb: need / 2 });
      expect(tight.ok).toBe(false);
      expect(tight.message).toMatch(/Mo/);
      expect(tight.message).toMatch(/eco|durée|libère/i);
      // sans mesure injectée, il lit le vrai disque
      expect(typeof checkDisk(dir, 60, "eco").freeMb).toBe("number");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
