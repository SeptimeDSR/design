import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FilmError } from "../film/writer";
import { normalizeFilm } from "../film/types";
import { SCENE_PAD_S, SHOT_PAD_S } from "../film/plan";
import { requireVoice, sceneVoice, voiceChoices } from "../film/voice";
import { decodeWav, encodeWav, wavDurationMs } from "../wav";

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "film-voice-"));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

const film = normalizeFilm(
  {
    title: "T",
    characters: [{ name: "Mireille", gender: "f" }, { name: "Paul", gender: "h" }],
    scenes: [{ title: "S", shots: [{ narration: "Il pleuvait." }, { narration: "Je ne signerai pas.", speaker: "Mireille" }, { narration: "Paul se tut.", speaker: "Paul" }] }],
  },
  { lang: "fr" },
)!;

// Une voix synthétique : 1 s par mot, à 22 050 Hz (ou 16 000 Hz pour la voix féminine, pour forcer le rééchantillonnage).
function fakeSynth(log: { text: string; voice?: string }[]) {
  return async (text: string, o: { outPath: string; voice?: string; engine?: string }) => {
    log.push({ text, voice: o.voice });
    const rate = o.voice === "fr_FR-siwis-medium" ? 16000 : 22050;
    const seconds = text.split(/\s+/).length;
    writeFileSync(o.outPath, encodeWav(new Float32Array(rate * seconds).fill(0.1), rate));
    return { path: o.outPath, durationMs: seconds * 1000, engine: (o.engine ?? "piper") as "piper" };
  };
}

describe("voiceChoices : qui parle avec quelle voix", () => {
  it("le narrateur a la voix principale, une femme la voix féminine si elle est installée", () => {
    const c = voiceChoices("fr", film.characters, { has: () => true });
    expect(c.narrator).toBe("fr_FR-tom-medium");
    expect(c.byName.get("mireille")).toBe("fr_FR-siwis-medium");
    expect(c.byName.get("paul")).toBe("fr_FR-tom-medium");
  });

  it("voix féminine absente : tout le monde garde la voix principale, sans planter", () => {
    const c = voiceChoices("fr", film.characters, { has: (v) => v === "fr_FR-tom-medium" });
    expect(c.byName.get("mireille")).toBe("fr_FR-tom-medium");
  });
});

describe("sceneVoice : une piste par scène, des plans calés sur la voix", () => {
  it("assemble les plans avec leurs pauses, rend les repères de temps, efface les pistes intermédiaires", async () => {
    const dir = tmp();
    const log: { text: string; voice?: string }[] = [];
    const v = await sceneVoice({ film, sceneIndex: 0, dir, engine: "piper", synth: fakeSynth(log), has: () => true });
    expect(log.map((l) => l.voice)).toEqual(["fr_FR-tom-medium", "fr_FR-siwis-medium", "fr_FR-tom-medium"]);
    expect(v.shots).toHaveLength(3);
    // plan 1 : début après la pause de scène ; chaque plan dure sa voix + la pause
    expect(v.shots[0].startMs).toBe(Math.round(SCENE_PAD_S * 1000));
    expect(v.shots[0].endMs - v.shots[0].startMs).toBe(2000 + Math.round(SHOT_PAD_S * 1000));
    expect(v.shots[1].startMs).toBe(v.shots[0].endMs);
    const wav = readFileSync(v.path);
    // la piste finale dure autant que les repères (± 1 échantillon d'arrondi), et la voix à 16 kHz a été ramenée à 22,05 kHz
    expect(Math.abs(wavDurationMs(wav) - v.durationMs)).toBeLessThan(5);
    expect(decodeWav(wav).sampleRate).toBe(22050);
    expect(readdirSync(join(dir, "voice")).filter((f) => /^\d+-\d+\.wav$/.test(f))).toEqual([]);
  });

  it("reprise : une scène déjà dite n'est pas resynthétisée", async () => {
    const dir = tmp();
    const log: { text: string; voice?: string }[] = [];
    const first = await sceneVoice({ film, sceneIndex: 0, dir, engine: "piper", synth: fakeSynth(log), has: () => true });
    const second = await sceneVoice({ film, sceneIndex: 0, dir, engine: "piper", synth: fakeSynth(log), has: () => true });
    expect(log).toHaveLength(3);
    expect(second.durationMs).toBe(first.durationMs);
    expect(second.shots).toEqual(first.shots);
  });

  it("un plan qui échoue ne perd pas les autres : la voix de secours prend le relais plan par plan", async () => {
    const dir = tmp();
    const base = fakeSynth([]);
    let n = 0;
    const flaky = async (text: string, o: { outPath: string; voice?: string; engine?: string }) => {
      if (++n === 2) throw new Error("piper a planté");
      return base(text, o);
    };
    const v = await sceneVoice({ film, sceneIndex: 0, dir, engine: "piper", synth: flaky, has: () => true });
    expect(v.shots).toHaveLength(3);
    expect(v.shots[1].endMs - v.shots[1].startMs).toBeGreaterThan(0);
  });
});

describe("requireVoice : pas de film muet par accident", () => {
  it("moteur silencieux sans l'avoir demandé : erreur claire avec la marche à suivre", () => {
    const err = (() => {
      try {
        requireVoice("silent", { VIRAL_TTS: "auto" });
      } catch (e) {
        return e as FilmError;
      }
    })();
    expect(err).toBeInstanceOf(FilmError);
    expect(err!.code).toBe("no_voice");
    expect(err!.message).toMatch(/Voix française|septim setup --voix/);
    expect(err!.message).toMatch(/voix/i);
  });

  it("silencieux demandé (VIRAL_TTS=silent) ou vraie voix : accepté", () => {
    expect(() => requireVoice("silent", { VIRAL_TTS: "silent" })).not.toThrow();
    expect(() => requireVoice("piper", {})).not.toThrow();
    expect(existsSync("/")).toBe(true);
  });
});
